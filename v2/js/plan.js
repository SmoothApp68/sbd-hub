// v2/js/plan.js — le plan de séance : un seul coach (MOTEUR §9.13 bis, 49-U1).
//
// « Un seul calcul décide de tout ce que le coach dit et fait dans une séance.
// Tout le reste le lit, sans jamais refaire une règle. » (décidé le 26/09/2026)
//
// Le diagnostic du 26/09 a compté treize calculs du même coach, dont quatre qui
// refaisaient le travail des autres sans lire leur résultat : l'en-tête
// décrivait quatre séries (le `n` de la consigne brute) quand la grille en
// montrait trois ; la réaction, calculée à part, proposait 127,5 sur une série
// prévue en test à 130. Ce module est le point unique : il compose les étapes
// qui existent déjà — la consigne (figée pour la séance, fournie par
// l'appelant), la couverture (§9.13), la réaction (§9.14) — et en tire les
// lignes, la phrase du coach et l'en-tête. L'écran les lit ; il ne recalcule
// rien.
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache. Il lit THMoteur
// et THSeance à l'appel, comme `moteur.js` lit THPalier.
//
// C1 (49-U1) : la grille, l'en-tête, le « Donc » du « Pourquoi » et la phrase
// du coach. C2 (49-U2) : le fantôme de chaque ligne couverte (étape 4). Les
// paris, le constat et le reste du « Pourquoi » suivent en C3 à C5 : ils lisent
// déjà la couverture et la réaction d'ICI, par `app.js`, mais leurs règles
// propres n'y sont pas encore.

(function (racine) {
  'use strict';

  function Moteur() { return racine.THMoteur; }
  function Seance() { return racine.THSeance; }
  function Palier() { return racine.THPalier; }

  var ROLES = { ligne: true, test: true, coach: true, retour: true, hors: true };

  function nombre(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function auCentieme(v) { return Math.round(v * 100) / 100; }
  function memeCharge(a, b) {
    var x = nombre(a), y = nombre(b);
    if (x === null || y === null) return x === null && y === null;
    return auCentieme(x) === auCentieme(y);
  }

  // Le rôle d'une ligne du plan, lu sur la réaction (ce que la ligne PROPOSE
  // maintenant) et, à défaut, sur la couverture (ce que la consigne y prévoit).
  function roleDeLigne(initiale, courante) {
    var src = courante && courante.source;
    if (src === 'coach') return 'coach';
    if (src === 'retour') return 'retour';
    var r = initiale && initiale.role;
    if (r === 'haut') return 'test';
    if (r === 'coach' || r === 'retour') return r;
    return 'ligne';
  }

  // ── L'ÉTAPE 4 : LE FANTÔME D'UNE LIGNE (§9.13 bis, 49-U2) ─────────────────
  //
  // « Le fantôme d'une ligne vient d'une seule source. » Tant que l'utilisateur
  // suit le plan, une ligne affiche le plan. Dès qu'il valide une autre charge
  // que celle prévue, les lignes suivantes non validées recopient SA DERNIÈRE
  // SÉRIE FAITE, charge et reps ensemble — jamais la charge d'une source et les
  // reps d'une autre (le « 125 × 4 » après un refus : la charge tapée, les reps
  // du plan).
  //
  // « Suivre sa ligne » : la même charge que la ligne ; pour une ligne proposée
  // par le coach, sa charge ou plus — « le cran au-dessus » sans chiffre : toute
  // charge au-dessus de la charge de travail. C'est la DERNIÈRE série validée
  // qui décide : a-t-elle suivi sa ligne, retour au plan ; sinon, recopie.
  //
  // Les reps d'une ligne proposée par le coach se tapent : `reps` nul.
  function chargeDeTravail(consigne) {
    var c = consigne && consigne.ligne ? nombre(consigne.ligne.charge) : null;
    return c !== null ? c : nombre(consigne && consigne.palier);
  }

  function aSuiviSaLigne(l, consigne) {
    var fait = nombre(l.faite && l.faite.charge);
    if (fait === null) return false;
    var prevue = nombre(l.charge);
    if (prevue === null) {
      var travail = chargeDeTravail(consigne);
      return travail !== null && fait > travail && !memeCharge(fait, travail);
    }
    if (l.role === 'coach') return fait >= prevue || memeCharge(fait, prevue);
    return memeCharge(fait, prevue);
  }

  function poserFantomes(lignes, consigne) {
    var derniere = null;
    lignes.forEach(function (l) {
      if (l.role === 'hors') return;
      if (l.validee) {
        l.fantome = null;
        derniere = l;
        return;
      }
      if (!derniere || aSuiviSaLigne(derniere, consigne)) {
        l.fantome = { charge: l.charge, reps: l.role === 'coach' ? null : l.vise, source: 'plan' };
      } else {
        l.fantome = { charge: derniere.faite.charge, reps: derniere.faite.reps, source: 'derniere' };
      }
    });
  }

  // ── LE CŒUR : LES LIGNES D'UN EXERCICE, À PARTIR D'UNE CONSIGNE DONNÉE ────
  //
  // `series` : les séries de l'exercice telles qu'elles sont (validées ou non) ;
  // `consigne`, `contexte` : ceux de l'exercice, FIGÉS pour la séance ;
  // `figees` : `{ [id de série]: { rang, role, ligne } }`, les lignes figées
  // relues dans les paris (`THSeance.figeesDe`) ; `options` : `{ slug,
  // seance, reglage }`, ce que porte le pari. Pur : ne lit rien d'autre.
  function planDesLignes(series, consigneDonnee, contexte, figees, options) {
    var o = options || {};
    var S = Seance(), M = Moteur();
    // L'ÉTAPE DE LA CONSIGNE FIGÉE (§9.9, delta 49-13) : le repli de la
    // reprise longue ne descend jamais de plus de 10 % sous le dernier palier.
    var consigne = M.consigneFigee(consigneDonnee);
    var liste = series || [];
    var couverture = S.couvertureSeance(liste, consigne, figees || {});
    var indices = [], rangs = [], roles = [], couvertes = [];
    couverture.forEach(function (x, i) {
      if (!x) return;
      indices[x.position] = i;
      rangs[x.position] = x.rang;
      roles[x.position] = x.role;
      couvertes[x.position] = x;
    });
    // `faites` s'arrête à la première série non validée (§9.14).
    var faites = [];
    for (var k = 0; k < indices.length; k++) {
      var s = liste[indices[k]];
      if (!S.partEnBase(s)) break;
      faites.push({ charge_kg: s.charge_kg, reps: s.reps, rpe: s.rpe, ressenti: s.ressenti });
    }
    var planInitial = M.planDeCouverture(consigne, couvertes);
    var reaction = M.reactionPour(consigne, faites, contexte || null, planInitial);

    var lignes = liste.map(function (sr, i) {
      var cov = couverture[i];
      var ligne = { iSerie: i, id: sr && sr.id ? sr.id : null, type: S.typeDe(sr), validee: S.partEnBase(sr) };
      if (!cov) { ligne.role = 'hors'; return ligne; }
      var p = reaction.plan[cov.position] || {};
      ligne.position = cov.position;
      ligne.rang = cov.rang;
      ligne.role = roleDeLigne(planInitial[cov.position], p);
      ligne.charge = p.charge === undefined ? null : p.charge;
      ligne.vise = p.vise === undefined ? null : p.vise;
      ligne.source = p.source || null;
      ligne.figee = !!(planInitial[cov.position] && planInitial[cov.position].figee);
      ligne.proposee = p.source === 'coach' && !ligne.validee;
      ligne.fourchette = Array.isArray(p.zone) ? p.zone.slice() : null;
      if (ligne.validee) {
        ligne.faite = { charge: sr.charge_kg === undefined ? null : sr.charge_kg,
                        reps: sr.reps === undefined ? null : sr.reps,
                        rpe: sr.rpe === undefined ? null : sr.rpe,
                        ressenti: sr.ressenti === undefined ? null : sr.ressenti };
      }
      return ligne;
    });
    poserFantomes(lignes, consigne);

    // ── L'ÉTAPE DES PARIS (§9.11, §9.13 bis, 49-U3) ──────────────────────
    //
    // Le pari de chaque ligne couverte NON FIGÉE, tel qu'il s'écrira à sa
    // validation : la réaction relue sur les séries validées qui la PRÉCÈDENT
    // — ce que l'écran montrait juste avant —, sur le plan de la couverture
    // actuelle, où la ligne n'est pas encore figée. `noterPari` n'écrit que
    // ce qui est ICI : plus aucune seconde réaction calculée à part. Une ligne
    // figée a déjà son pari (c'est lui qui la fige) : rien à écrire.
    var reactionsAvant = {};
    var paris = liste.map(function () { return null; });
    lignes.forEach(function (l) {
      if (l.role === 'hors' || l.figee) return;
      var j = l.position;
      var n = Math.min(faites.length, j);
      if (!reactionsAvant[n]) {
        reactionsAvant[n] = M.reactionPour(consigne, faites.slice(0, n), contexte || null, planInitial);
      }
      var p = M.lignesDePari(consigne, reactionsAvant[n], faites.slice(0, n), j, {
        slug: o.slug, reglage: o.reglage, seance: o.seance,
        rang: rangs[j], role: roles[j], rangs: rangs
      });
      paris[l.iSerie] = p.length ? p[0] : null;
    });

    // La phrase du coach : sur la ligne `message.rang` (une POSITION).
    var m = reaction.message;
    var message = m ? {
      position: m.rang, iSerie: indices[m.rang] === undefined ? null : indices[m.rang],
      type: m.type, phrase: M.phraseReaction(m, consigne.zone)
    } : null;

    return {
      consigne: consigne, indices: indices, rangs: rangs, roles: roles,
      planInitial: planInitial, faites: faites, reaction: reaction,
      lignes: lignes, message: message, paris: paris
    };
  }

  // L'entrée qui rejoue l'étape 4 à partir d'une consigne donnée, sans
  // historique : `n` séries de travail, dont les `faites` validées dans
  // l'ordre, et les lignes `figees` de ces séries (`{ [i]: { rang, role,
  // ligne } }`, indexées par position). Pure et exportée : c'est par elle que
  // les cas du simulateur (`coach49.py`) sont rejoués.
  function rejouer(consigne, contexte, n, faites, figees, options) {
    var fa = faites || [];
    var series = [];
    for (var i = 0; i < n; i++) {
      var f = fa[i];
      series.push({
        id: 'r' + (i + 1), type_serie: 'travail',
        charge_kg: f ? f.charge : null, reps: f ? f.reps : null,
        rpe: f && f.rpe !== undefined ? f.rpe : null,
        ressenti: f && f.ressenti !== undefined ? f.ressenti : null,
        validee_a: f ? '2026-09-26T10:0' + Math.min(i, 9) + ':00.000Z' : null
      });
    }
    var gel = {};
    Object.keys(figees || {}).forEach(function (k) { gel['r' + (Number(k) + 1)] = figees[k]; });
    var r = planDesLignes(series, consigne, contexte, gel, options);
    return {
      consigne: r.consigne,
      lignes: r.lignes, message: r.message, reaction: r.reaction, paris: r.paris,
      planInitial: r.planInitial, indices: r.indices, rangs: r.rangs, roles: r.roles,
      faites: r.faites, series: series
    };
  }

  // ── L'ÉTAPE DU CONSTAT (§3.9, §9.13 bis, 49-U4) ─────────────────────────
  //
  // Le constat de fin de bloc, comme l'en-tête, est une étape du plan : il
  // n'existe que lorsque TOUTES les lignes de travail couvertes sont validées
  // (I10 a), et il lit les rôles du jour — ce que `constatDe` seul ne sait
  // pas. La suite (la consigne de la prochaine séance) vient de l'app, calculée
  // par la même fonction que la consigne sur l'historique augmenté
  // (`Moteur.suiteDExercice`) : le plan n'a pas l'historique.
  function faitsDuJour(lignes, consigne) {
    var z = Moteur().zoneParCle(consigne.zone);
    var couvertes = lignes.filter(function (l) { return l.role !== 'hors'; });
    var montee = null;
    couvertes.forEach(function (l) {
      if (l.role !== 'coach' || !l.validee || !aSuiviSaLigne(l, consigne) || !z) return;
      var comptees = Palier().repsComptees({ reps: l.faite.reps, rpe: l.faite.rpe, ressenti: l.faite.ressenti });
      if (comptees === null || comptees < z.bas || comptees > z.haut) return;
      if (!montee || nombre(l.faite.charge) > nombre(montee.charge)) {
        montee = { charge: l.faite.charge, reps: l.faite.reps };
      }
    });
    return {
      montee: montee,
      suivies: couvertes.length > 0 && couvertes.every(function (l) { return l.validee && aSuiviSaLigne(l, consigne); }),
      faites: couvertes.map(function (l) { return { charge: l.faite ? l.faite.charge : null, reps: l.faite ? l.faite.reps : null }; })
    };
  }

  function constatDuPlan(lignes, consigne, suite, reglage) {
    var couvertes = lignes.filter(function (l) { return l.role !== 'hors'; });
    if (!couvertes.length || !couvertes.every(function (l) { return l.validee; })) return null;
    if (!suite || !suite.consigne) return null;
    var c = Moteur().constatDuJour(consigne, suite.consigne, reglage || null,
      suite.cranSuivant === undefined ? null : suite.cranSuivant, faitsDuJour(lignes, consigne));
    if (!c) return null;
    // Ce que la prochaine séance proposera, en charges : de quoi vérifier
    // qu'elle ne propose pas moins qu'une montée tenue (I10 b).
    var k = suite.consigne;
    c.suiteCharges = [k.ligne ? k.ligne.charge : null, k.haut ? k.haut.charge : null];
    c.suiteEtat = k.etat || null;
    return c;
  }

  // ── L'ÉTAPE DE LA FEUILLE « POURQUOI » (ECRAN §3.10, delta 49-14 W1) ─────
  //
  // La feuille LIT LE PLAN : « Donc » et ses lignes décrivent les lignes de la
  // séance en cours, une par une — rôle, charge, visée ; pour une ligne du
  // coach sa raison, pour une ligne revenue à la charge de travail la sienne ;
  // une ligne validée dit aussi ce qui a été fait. Jamais le `n` de la
  // consigne. La dernière séance, la zone, le palier, l'état et le réglage
  // restent ceux de la CONSIGNE FIGÉE du plan (`pourquoiConsigne(x.consigne)`,
  // assemblée par l'app).
  //
  // Les lignes suivent `VOIX-DU-COACH-V1` : la charge d'abord (« 130 kg × 4 »).
  // Invariant (I6, étendu à la feuille) : exactement les lignes de la grille,
  // même nombre, mêmes charges, mêmes visées, même ordre.
  function nombreFr(v) { return racine.THModele.nombre(v); }
  var NBSP = '\u00a0';
  function kg(v) {
    var n = nombre(v);
    return n === null ? 'le cran au-dessus' : nombreFr(n) + NBSP + 'kg';
  }
  function kgFois(charge, reps) { return kg(charge) + NBSP + '\u00d7' + NBSP + nombreFr(reps); }
  var ROLE_FEUILLE = { ligne: 'consigne', test: 'test', coach: 'proposée par le coach', retour: 'retour à ta charge' };

  function lignesDeLaFeuille(lignes) {
    var couvertes = (lignes || []).filter(function (l) { return l.role !== 'hors'; });
    var premiereCoach = null;
    return couvertes.map(function (l, k) {
      var visee = l.role === 'coach' && Array.isArray(l.fourchette) && l.fourchette.length === 2
        ? nombreFr(l.fourchette[0]) + ' à ' + nombreFr(l.fourchette[1])
        : (l.vise === null || l.vise === undefined ? '' : nombreFr(l.vise));
      var raison = null;
      if (l.role === 'coach') {
        if (premiereCoach === null) {
          premiereCoach = l;
          var avant = couvertes[k - 1];
          raison = avant && avant.faite ? 'proposée après ' + kgFois(avant.faite.charge, avant.faite.reps) : 'proposée par le coach';
        } else {
          raison = premiereCoach.faite
            ? 'la montée a tenu à ' + kgFois(premiereCoach.faite.charge, premiereCoach.faite.reps)
            : 'la montée continue';
        }
      } else if (l.role === 'retour') {
        var montee = premiereCoach || couvertes.filter(function (c) { return c.role === 'coach'; })[0];
        raison = 'on revient à ' + kg(l.charge) +
          (montee && montee.faite ? ' après ' + kgFois(montee.faite.charge, montee.faite.reps) : '');
      }
      return {
        rang: l.rang, role: l.role, charge: l.charge === undefined ? null : l.charge,
        vise: l.vise === undefined ? null : l.vise,
        texte: kg(l.charge) + (visee ? NBSP + '\u00d7' + NBSP + visee : ''),
        libelle: ROLE_FEUILLE[l.role] || l.role,
        raison: raison,
        faite: l.validee && l.faite ? 'faite' + NBSP + ': ' + kgFois(l.faite.charge, l.faite.reps) : null
      };
    });
  }

  // La part de la feuille qui décrit la SÉANCE : « Donc » et les lignes. Les
  // paragraphes (dernière séance, zone, palier, état, réglage) se lisent sur la
  // consigne figée du plan (`x.consigne`) par `pourquoiConsigne` : l'app les
  // assemble, le plan n'a pas à connaître le fondement complet d'une consigne.
  function pourquoiDuPlan(consigne, lignes, donc) {
    if (!consigne) return null;
    var muet = consigne.etat === 'silence';
    return { donc: muet ? null : donc, lignes: muet ? [] : lignesDeLaFeuille(lignes) };
  }

  // ── LE PLAN D'UN EXERCICE ───────────────────────────────────────────────
  function planDExercice(exo, iExo, consigneDuSlug, paris, seanceId, reglage, suite) {
    var S = Seance(), M = Moteur();
    var series = (exo && exo.series) || [];
    var c = consigneDuSlug && consigneDuSlug.consigne ? consigneDuSlug : null;
    var base = { iExo: iExo, slug: exo ? exo.exercise_slug : null, consigne: null };
    if (!c) {
      base.lignes = series.map(function (s, i) {
        return { iSerie: i, type: S.typeDe(s), role: 'hors', validee: S.partEnBase(s) };
      });
      return base;
    }
    // La consigne figée (§9.9, delta 49-13) : c'est elle que lisent les lignes
    // figées, l'en-tête, le constat et les invariants.
    var consigne = M.consigneFigee(c.consigne);
    var siens = (paris || []).filter(function (l) {
      return l && l.exercise_slug === base.slug && l.fondement && l.fondement.seance === seanceId;
    });
    // ⚠️ LES LIGNES FIGÉES SE LISENT ICI, UNE FOIS, DANS LES PARIS DE LA SÉANCE
    // (§9.13, #322) — et nulle part ailleurs : elles sont une ENTRÉE du plan.
    var figees = S.figeesDe(siens, series, consigne);
    var r = planDesLignes(series, consigne, c.contexte || null, figees, {
      slug: base.slug, seance: seanceId === undefined ? null : seanceId,
      reglage: reglage === undefined ? null : reglage
    });

    // L'en-tête décrit la disposition de la consigne sur les lignes de la
    // séance (ECRAN §3.12, 26/09/2026) — plus le `n` de la consigne brute.
    var disposition = r.planInitial.map(function (p) { return p && p.role === 'haut' ? 'haut' : 'ligne'; });
    var entete = M.enteteDeDisposition(consigne, disposition);
    var gris = c.libelles ? c.libelles.gris : '';
    var donc = entete.jaune.length ? 'Donc ' + entete.jaune.join(', ') + '.' : null;

    return {
      iExo: iExo, slug: base.slug,
      consigne: consigne, contexte: c.contexte || null,
      indices: r.indices, rangs: r.rangs, roles: r.roles, figees: figees,
      planInitial: r.planInitial, faites: r.faites, reaction: r.reaction,
      lignes: r.lignes, message: r.message, paris: r.paris,
      constat: constatDuPlan(r.lignes, consigne, suite, reglage),
      entete: { jaune: entete.jaune, gris: gris, segments: entete.segments },
      donc: donc,
      pourquoi: pourquoiDuPlan(consigne, r.lignes, donc)
    };
  }

  // §9.13 (49-C ; 49-U6) — LE NOMBRE DE SÉRIES PROPOSÉ AU DÉPART, HORS ROUTINE.
  // Une seule règle, ici, lue par l'ajout d'exercice : l'habitude d'abord —
  // `n`, le nombre de séries de travail de la dernière séance de l'exercice tel
  // que la consigne le lit ; sans consigne (Entretenir, mesure sans charge), les
  // séries de travail de la dernière séance ; sans historique, l'intention — 3
  // en Progresser, 2 en Entretenir (Spiering et al. 2021). Ce n'est qu'un
  // pré-remplissage : on ajoute et on retire librement. Une routine garde ses
  // propres séries (`exerciceDepuisRoutine`). Plus aucune lecture de
  // `consigne.n` hors du plan.
  var SERIES_DEPART_PROGRESSER = 3;
  var SERIES_DEPART_ENTRETIEN = 2;

  function seriesDeDepart(consigne, prec, intention) {
    var c = consigne ? Moteur().consigneFigee(consigne) : null;
    var v = Number(c ? c.n : null);
    if (c && isFinite(v) && v >= 1 && Math.floor(v) === v) return v;
    var faites = prec && prec.series
      ? prec.series.filter(function (s) { return Seance().typeDe(s) === 'travail'; }).length : 0;
    if (faites >= 1) return faites;
    return intention === 'entretien' ? SERIES_DEPART_ENTRETIEN : SERIES_DEPART_PROGRESSER;
  }

  // ══ LE PLAN DE SÉANCE ═══════════════════════════════════════════════════
  //
  // `entrees` :
  //   · `seance` — `{ id, debut, edition, exercices: [{ exercise_slug, series }] }`,
  //     telle qu'elle est À CET INSTANT (séries validées ou non) ;
  //   · `consignes` — `{ [slug]: sortie de Moteur.consigneDExercice | null }`,
  //     FIGÉES POUR LA SÉANCE par l'appelant dès leur premier calcul (§9.13
  //     bis) : une synchronisation pendant la séance ne les change pas ; seule
  //     une correction de zone par l'utilisateur recalcule son exercice ;
  //   · `paris` — les lignes `predictions` de la séance : les lignes figées se
  //     relisent dans les paris (§9.13, #322) ;
  //   · `reglage` — le rythme du profil, que porte le fondement de chaque
  //     pari (§9.11) ;
  //   · `suites` — `{ [slug]: { consigne, cranSuivant } }`, la consigne de la
  //     PROCHAINE séance (`Moteur.suiteDExercice`), donnée par l'app quand les
  //     séries de travail de l'exercice sont faites : le constat en a besoin.
  //
  // Pure : mêmes entrées, même plan ; les entrées ne sont jamais modifiées.
  function planDeSeance(entrees) {
    var e = entrees || {};
    var seance = e.seance || {};
    var consignes = e.consignes || {};
    var exos = seance.exercices || [];
    return {
      seance: seance.id === undefined ? null : seance.id,
      exercices: exos.map(function (exo, i) {
        var slug = exo && exo.exercise_slug;
        var c = Object.prototype.hasOwnProperty.call(consignes, slug) ? consignes[slug] : null;
        var suites = e.suites || {};
        var suite = Object.prototype.hasOwnProperty.call(suites, slug) ? suites[slug] : null;
        return planDExercice(exo, i, c, e.paris || [], seance.id, e.reglage, suite);
      })
    };
  }

  // ══ LES INVARIANTS — UN COACH QUI NE PEUT PAS SE CONTREDIRE ══════════════
  //
  // Vérifiés sur chaque plan : en test (plans générés), au banc (après chaque
  // geste de chaque section, 49-U7) et, hors production, dans l'app par la
  // garde du coach (`creerGarde`). C1 porte I1, I2, I3, I6, I9 et I12, C2
  // (49-U2) I11, C3 (49-U3) I4, I7 et I8, C4 (49-U4) I10, 49-U5 I14 et I15,
  // C5 (49-U6) l'extension de I6 à la feuille. Rend `{ ok, erreurs }`.
  //
  // ⚠️ AUCUNE VÉRIFICATION NE RELIT LA RÈGLE QU'ELLE CONTRÔLE. I6 ne rappelle
  // pas la fonction qui rédige l'en-tête : il compte les séries que le texte
  // DIT et les confronte aux lignes.
  function seriesDites(jaune) {
    var compte = 0, sansCompte = 0;
    (jaune || []).forEach(function (t) {
      var x = String(t).replace(/ /g, ' ');
      var m;
      if ((m = /sur les (\d+) dernières séries/.exec(x))) compte += Number(m[1]);
      else if ((m = /sur les (\d+) d'avant/.exec(x))) compte += Number(m[1]);
      else if (/sur celle d'avant/.test(x)) compte += 1;
      else if (/en dernière série/.test(x)) compte += 1;
      else if (/sur une série/.test(x)) compte += 1;
      else if ((m = /sur (\d+) séries/.exec(x))) compte += Number(m[1]);
      else sansCompte += 1;
    });
    return { compte: compte, sansCompte: sansCompte };
  }

  // Le rôle qu'un pari écrit, pour le rôle d'une ligne du plan.
  var ROLE_DU_PARI = { ligne: 'ligne', test: 'haut', coach: 'coach', retour: 'retour' };

  function verifierExercice(x, erreurs, parisSeance) {
    var nom = 'exercice ' + x.iExo + ' (' + x.slug + ')';
    var err = function (inv, texte) { erreurs.push(inv + ' — ' + nom + ' : ' + texte); };
    var lignes = x.lignes || [];

    // I1 — chaque ligne a un seul rôle ; seules les séries de travail sont couvertes.
    lignes.forEach(function (l) {
      if (!ROLES[l.role]) err('I1', 'série ' + l.iSerie + ' sans rôle valide (' + l.role + ')');
      if (l.role !== 'hors' && l.type !== 'travail') err('I1', 'série ' + l.iSerie + ' couverte mais de type ' + l.type);
    });
    if (!x.consigne) {
      lignes.forEach(function (l) {
        if (l.role !== 'hors') err('I1', 'série ' + l.iSerie + ' couverte sans consigne');
      });
      return;
    }
    var couvertes = lignes.filter(function (l) { return l.role !== 'hors'; });
    var positions = couvertes.map(function (l) { return l.position; });
    positions.forEach(function (p, i) {
      if (p !== i) err('I1', 'positions non contiguës : ' + JSON.stringify(positions));
    });

    var init = x.planInitial || [];
    var cour = (x.reaction && x.reaction.plan) || [];
    var P = x.consigne.ligne ? nombre(x.consigne.ligne.charge) : null;

    // I2 — aucune ligne du coach ne remplace une ligne de test non figée.
    // I3 — une proposition n'est jamais plus basse que la ligne prévue, et
    // toujours au-dessus de la charge de travail.
    cour.forEach(function (p, i) {
      if (!p || p.source !== 'coach' || (init[i] && init[i].figee)) return;
      if (init[i] && init[i].role === 'haut') {
        err('I2', 'la ligne ' + i + ' prévue en test (' + init[i].charge + ') porte une proposition du coach (' + p.charge + ')');
      }
      var prevue = init[i] ? nombre(init[i].charge) : null;
      var ch = nombre(p.charge);
      if (ch !== null && prevue !== null && ch < prevue && !memeCharge(ch, prevue)) {
        err('I3', 'proposition ' + ch + ' plus basse que la ligne prévue ' + prevue + ' (ligne ' + i + ')');
      }
      // Sans exception (49-U7) : la tolérance de 49-U5 pour une reprise longue
      // « au palier » (P008, F028) est partie avec les cas corrigés — le cran
      // se lit au-dessus de la charge retenue (`reactionPour`).
      if (ch !== null && P !== null && !(ch > P && !memeCharge(ch, P))) {
        err('I3', 'proposition ' + ch + ' pas au-dessus de la charge de travail ' + P + ' (ligne ' + i + ')');
      }
    });

    // I14 (§9.14, delta 49-13) — une proposition du coach suivie d'un test
    // PRÉVU a la charge de ce test : une seule montée par bloc. Le test prévu
    // se lit sur le rôle de la couverture (`planInitial`), figé ou non.
    // ⚠️ LA PROPOSITION, c'est la PREMIÈRE ligne du coach (révision 1) : les
    // suivantes portent la charge réellement montée (« la charge montée reste
    // pour la suite »). Et une proposition FIGÉE est de l'histoire — écrite
    // avant ce jour, elle garde sa charge (I4) : I14 juge les décisions à venir.
    var testI14 = x.consigne.haut ? nombre(x.consigne.haut.charge) : null;
    var premiereCoach = -1;
    cour.forEach(function (p, i) { if (premiereCoach < 0 && p && p.source === 'coach') premiereCoach = i; });
    cour.forEach(function (p, i) {
      if (i !== premiereCoach || (init[i] && init[i].figee)) return;
      var suivi = false;
      for (var t = i + 1; t < init.length; t++) {
        if (init[t] && init[t].role === 'haut') { suivi = true; break; }
      }
      if (suivi && !memeCharge(p.charge, testI14)) {
        err('I14', 'la proposition du coach (ligne ' + i + ', ' + p.charge + ') précède un test prévu à ' +
          testI14 + ', à une autre charge');
      }
    });

    // I15, LE REPLI (§9.9, delta 49-13 ; numéroté par le delta 49-14) — une reprise longue ne descend jamais de
    // plus de 10 % sous le dernier palier : ni la consigne figée, ni une ligne
    // qui la reprend.
    if (x.consigne.etat === 'reprise_longue') {
      var Pal = nombre(x.consigne.palier);
      var plancher = Pal === null ? null : Pal * (1 - racine.THMoteur.REPLI_MAX_REPRISE);
      var sous = function (v) { var n = nombre(v); return n !== null && plancher !== null && n < plancher - 1e-9; };
      if (x.consigne.ligne && sous(x.consigne.ligne.charge)) {
        err('I15', 'la consigne reprend à ' + x.consigne.ligne.charge + ', plus de 10 % sous le palier ' + Pal);
      }
      (x.lignes || []).forEach(function (l) {
        if ((l.role === 'ligne' || l.role === 'retour') && sous(l.charge)) {
          err('I15', 'la série ' + l.iSerie + ' reprend à ' + l.charge + ', plus de 10 % sous le palier ' + Pal);
        }
      });
    }

    // I6, ÉTENDU À LA FEUILLE « POURQUOI » (ECRAN §3.10, delta 49-14 W1) : la
    // feuille décrit exactement les lignes de la grille — même nombre, mêmes
    // rangs dans le même ordre, mêmes charges, mêmes visées.
    if (x.pourquoi && x.consigne.etat !== 'silence') {
      var fl = x.pourquoi.lignes || [];
      if (fl.length !== couvertes.length) {
        err('I6', 'la feuille décrit ' + fl.length + ' ligne(s), la grille en porte ' + couvertes.length);
      } else {
        fl.forEach(function (f, k) {
          var g = couvertes[k];
          if (f.rang !== g.rang || f.role !== g.role || !memeCharge(f.charge, g.charge) || nombre(f.vise) !== nombre(g.vise)) {
            err('I6', 'la feuille décrit la ligne ' + k + ' (rang ' + f.rang + ', ' + f.role + ') à ' + f.charge + '×' + f.vise +
              ', la grille (rang ' + g.rang + ', ' + g.role + ') à ' + g.charge + '×' + g.vise);
          }
        });
      }
    }

    // I6 — l'en-tête décrit exactement les lignes : les segments recouvrent
    // chaque ligne une fois, dans l'ordre, avec sa charge et sa visée prévues ;
    // et le TEXTE dit ce nombre de séries.
    var e = x.entete || { jaune: [], segments: [] };
    if (x.consigne.etat !== 'silence' && couvertes.length) {
      var dispo = init.map(function (p) { return p && p.role === 'haut' ? 'haut' : 'ligne'; });
      var deplie = [];
      (e.segments || []).forEach(function (s) {
        for (var k = 0; k < s.nombre; k++) deplie.push(s);
      });
      if (deplie.length !== couvertes.length) {
        err('I6', 'l\'en-tête décrit ' + deplie.length + ' série(s), la grille en porte ' + couvertes.length);
      }
      deplie.forEach(function (s, i) {
        if (dispo[i] !== s.role) err('I6', 'segment ' + s.role + ' sur une ligne ' + dispo[i] + ' (position ' + i + ')');
        var src = s.role === 'haut' ? x.consigne.haut : x.consigne.ligne;
        if (src && (!memeCharge(s.charge, src.charge) || nombre(s.vise) !== nombre(src.vise))) {
          err('I6', 'segment ' + s.role + ' à ' + s.charge + '×' + s.vise + ' pour une consigne à ' + src.charge + '×' + src.vise);
        }
      });
      var dites = seriesDites(e.jaune);
      var total = couvertes.length;
      if (dites.sansCompte > 1 || dites.compte > total ||
          (dites.sansCompte === 0 && dites.compte !== total) ||
          (dites.sansCompte === 1 && dites.compte === total)) {
        err('I6', 'le texte de l\'en-tête dit ' + dites.compte + ' série(s) comptée(s) et ' +
          dites.sansCompte + ' ligne(s) sans compte, pour ' + total + ' série(s) : ' +
          JSON.stringify(e.jaune).replace(/ /g, ' '));
      }
      (e.segments || []).forEach(function (s) {
        if (s.vise === null || s.vise === undefined) return;
        var dit = (e.jaune || []).some(function (t) { return String(t).indexOf('vise ' + s.vise) >= 0; });
        if (!dit) err('I6', 'la visée ' + s.vise + ' n\'apparaît pas dans l\'en-tête');
      });
    }

    // I9 — un message vise une ligne qui existe et n'est pas faite ;
    // « propose » ⇒ une ligne du coach juste là ; la phrase du test à venir ⇒
    // la ligne est un test ; « ton test a avancé » ⇒ la charge proposée est
    // celle d'un test encore à venir.
    var msg = x.reaction && x.reaction.message;
    if (msg) {
      var cible = couvertes[msg.rang];
      if (!cible) err('I9', 'message « ' + msg.type + ' » sur une position absente (' + msg.rang + ')');
      else if (cible.validee) err('I9', 'message « ' + msg.type + ' » au-dessus d\'une série déjà faite (position ' + msg.rang + ')');
      if (msg.type === 'propose' && (!cour[msg.rang] || cour[msg.rang].source !== 'coach')) {
        err('I9', '« propose » sans ligne du coach en position ' + msg.rang);
      }
      if (msg.type === 'test_suit' && !(init[msg.rang] && init[msg.rang].role === 'haut' &&
          cour[msg.rang] && cour[msg.rang].source === 'consigne')) {
        err('I9', '« ton test arrive » sur une ligne qui n\'est pas un test (position ' + msg.rang + ')');
      }
      if (msg.type === 'tenue' && msg.avance) {
        var tenue = cour[msg.rang - 1];
        var avant = false;
        for (var q = msg.rang; q < cour.length; q++) {
          var t = cour[q], i0 = init[q];
          if (!t || !i0 || i0.figee || i0.role !== 'haut' || t.source !== 'consigne') continue;
          if (couvertes[q] && couvertes[q].validee) continue;
          if (tenue && memeCharge(t.charge, tenue.charge)) avant = true;
        }
        if (!avant) err('I9', '« ton test a avancé » alors qu\'aucun test à venir n\'est à la charge proposée');
      }
    }
    // I11 — le fantôme d'une ligne vient d'une seule règle (49-U2). Un fantôme
    // `plan` reprend la charge et la visée de SA ligne (les reps d'une ligne du
    // coach se tapent : nulles) ; un fantôme `derniere` reprend la charge ET les
    // reps de la dernière série validée ; jamais `plan` après une dernière série
    // qui n'a pas suivi sa ligne, jamais `derniere` après une qui l'a suivie.
    // « Suivre » se relit ici, à la main, sans rappeler `aSuiviSaLigne`.
    var travailI11 = x.consigne.ligne && nombre(x.consigne.ligne.charge) !== null
      ? nombre(x.consigne.ligne.charge) : nombre(x.consigne.palier);
    var precedente = null;
    couvertes.forEach(function (l) {
      var f = l.fantome;
      if (l.validee) {
        if (f) err('I11', 'la série ' + l.iSerie + ' est faite et porte encore un fantôme');
        precedente = l;
        return;
      }
      if (!f) { err('I11', 'la série ' + l.iSerie + ' n\'a pas de fantôme'); return; }
      var suivie = true;
      if (precedente) {
        var fait = precedente.faite ? nombre(precedente.faite.charge) : null;
        var prevue = nombre(precedente.charge);
        if (fait === null) suivie = false;
        else if (prevue === null) suivie = travailI11 !== null && fait > travailI11 && !memeCharge(fait, travailI11);
        else if (precedente.role === 'coach') suivie = fait > prevue || memeCharge(fait, prevue);
        else suivie = memeCharge(fait, prevue);
      }
      if (f.source === 'plan') {
        if (!suivie) err('I11', 'fantôme du plan en série ' + l.iSerie + ' après une série ' + precedente.iSerie + ' qui n\'a pas suivi sa ligne');
        var repsPlan = l.role === 'coach' ? null : nombre(l.vise);
        if (!memeCharge(f.charge, l.charge) || nombre(f.reps) !== repsPlan) {
          err('I11', 'fantôme du plan ' + f.charge + '×' + f.reps + ' pour une ligne ' + l.charge + '×' + repsPlan + ' (série ' + l.iSerie + ')');
        }
      } else if (f.source === 'derniere') {
        if (!precedente) err('I11', 'fantôme « dernière série » en série ' + l.iSerie + ' sans série faite avant');
        else {
          if (suivie) err('I11', 'fantôme « dernière série » en série ' + l.iSerie + ' alors que la série ' + precedente.iSerie + ' a suivi sa ligne');
          var d = precedente.faite || {};
          if (!memeCharge(f.charge, d.charge) || nombre(f.reps) !== nombre(d.reps)) {
            err('I11', 'fantôme ' + f.charge + '×' + f.reps + ' pour une dernière série ' + d.charge + '×' + d.reps + ' (série ' + l.iSerie + ')');
          }
        }
      } else {
        err('I11', 'fantôme de source inconnue « ' + f.source + ' » (série ' + l.iSerie + ')');
      }
    });

    // I10 — le constat ne contredit jamais le plan du jour (49-U4). Relu ici à
    // la main, sans rappeler `faitsDuJour` :
    //   (a) pas de constat tant qu'une ligne de travail couverte n'est pas faite ;
    //   (b) une montée du coach tenue (ligne du coach faite à sa charge ou
    //       plus, reps comptées dans la zone) : le constat la porte et son
    //       verdict ne la contredit pas (« Pas de palier », « Pas encore »), et la suite
    //       propose au moins une série à cette charge — la partie « suite » se
    //       signale à part (`I10 suite`), pour être RAPPORTÉE, pas corrigée ici ;
    //   (c) toutes les séries ont suivi leur ligne : jamais « Pas de palier ».
    var k10 = x.constat || null;
    if (k10 && couvertes.some(function (l) { return !l.validee; })) {
      err('I10', 'un constat alors qu\'une ligne de travail n\'est pas faite');
    }
    if (k10) {
      var zI10 = racine.THMoteur.zoneParCle(x.consigne.zone);
      var tI10 = x.consigne.ligne && nombre(x.consigne.ligne.charge) !== null
        ? nombre(x.consigne.ligne.charge) : nombre(x.consigne.palier);
      var suivieI10 = function (l) {
        var fait = l.faite ? nombre(l.faite.charge) : null;
        var prevue = nombre(l.charge);
        if (fait === null) return false;
        if (prevue === null) return tI10 !== null && fait > tI10 && !memeCharge(fait, tI10);
        if (l.role === 'coach') return fait > prevue || memeCharge(fait, prevue);
        return memeCharge(fait, prevue);
      };
      var tenue = null;
      couvertes.forEach(function (l) {
        if (l.role !== 'coach' || !l.validee || !suivieI10(l) || !zI10) return;
        var c = racine.THPalier.repsComptees({ reps: l.faite.reps, rpe: l.faite.rpe, ressenti: l.faite.ressenti });
        if (c === null || c < zI10.bas || c > zI10.haut) return;
        if (tenue === null || nombre(l.faite.charge) > tenue) tenue = nombre(l.faite.charge);
      });
      var verdict = String(k10.verdict || '');
      if (tenue !== null) {
        if (!k10.montee || !memeCharge(k10.montee.charge, tenue) ||
            /^Pas de palier/.test(verdict) || /^Pas encore/.test(verdict)) {
          err('I10', 'une montée du coach a tenu à ' + tenue + ', le constat ne la dit pas : « ' + verdict + ' »');
        }
        var proposees = (k10.suiteCharges || []).map(nombre).filter(function (v) { return v !== null; });
        var max = proposees.length ? Math.max.apply(null, proposees) : null;
        if (max === null || (max < tenue && !memeCharge(max, tenue))) {
          err('I10 suite', 'la montée a tenu à ' + tenue + ', la prochaine séance propose ' +
            (max === null ? 'aucune charge' : max) + ' (état ' + k10.suiteEtat + ')');
        }
      }
      if (/^Pas de palier/.test(verdict) && couvertes.every(suivieI10)) {
        err('I10', '« Pas de palier » alors que toutes les séries ont suivi le plan');
      }
    }

    // I8 — les rangs sont uniques par exercice : aucune ligne ne reprend le
    // rang d'une autre, figée ou non.
    var vus = {};
    couvertes.forEach(function (l) {
      if (l.rang === null || l.rang === undefined) { err('I8', 'la série ' + l.iSerie + ' est couverte sans rang'); return; }
      if (vus[l.rang] !== undefined) err('I8', 'le rang ' + l.rang + ' est porté par les séries ' + vus[l.rang] + ' et ' + l.iSerie);
      vus[l.rang] = l.iSerie;
    });

    // I7 — chaque ligne validée et couverte a EXACTEMENT UN pari DE LA
    // RÉVISION QU'ELLE AFFICHAIT À SA VALIDATION, qui reprend sa charge, sa
    // visée et son rôle ; aucun pari observé sans sa ligne. Seulement quand les
    // paris de la séance sont connus (les entrées).
    //
    // ⚠️ D'AUTRES RÉVISIONS DU MÊME RANG PEUVENT EXISTER (delta 49-14 W3,
    // 27/09/2026). « Exactement un pari » par rang contredisait §9.11 — une
    // consigne revue est un nouveau pari, écrit à côté du premier : une série
    // validée sans proposition (révision 0), dévalidée, puis revalidée sous la
    // proposition du coach (révision 1) porte les deux. La révision de la ligne
    // se lit sur le plan, par la règle même qui écrit les paris
    // (`revisionsDuPlan`).
    //
    // Un pari NON OBSERVÉ sans ligne est permis : c'est celui d'une série
    // validée puis supprimée (§9.11, 49-11 — « le pari reste, non observé »).
    // Une ligne validée que le plan ne fait rien parier (`paris` nul : pas de
    // visée) n'en attend aucun.
    if (parisSeance) {
      var siens = parisSeance.filter(function (q) {
        return q && q.exercise_slug === x.slug && q.fondement;
      });
      var revisionsI7 = racine.THMoteur.revisionsDuPlan(cour);
      couvertes.forEach(function (l) {
        if (!l.validee) return;
        var duRang = siens.filter(function (q) { return Number(q.fondement.rang) === Number(l.rang); });
        var revL = revisionsI7[l.position] || 0;
        var deSaRevision = duRang.filter(function (q) { return (Number(q.fondement.revision) || 0) === revL; });
        var attendu = l.figee || !!(x.paris && x.paris[l.iSerie]);
        if (!attendu) {
          if (duRang.length) err('I7', 'la série ' + l.iSerie + ' ne devait rien parier, et le rang ' + l.rang + ' porte ' + duRang.length + ' pari(s)');
          return;
        }
        if (deSaRevision.length !== 1) {
          err('I7', 'la série ' + l.iSerie + ' (rang ' + l.rang + ') porte ' + deSaRevision.length +
            ' pari(s) de sa révision (' + revL + '), pour un seul attendu');
          return;
        }
        var q = deSaRevision[0];
        if (q.fondement.role !== ROLE_DU_PARI[l.role]) {
          err('I7', 'le pari du rang ' + l.rang + ' dit « ' + q.fondement.role + ' » pour une ligne « ' + l.role + ' »');
        }
        if (!memeCharge(q.fondement.charge, l.charge)) {
          err('I7', 'le pari du rang ' + l.rang + ' porte ' + q.fondement.charge + ' pour une ligne à ' + l.charge);
        }
        if (nombre(q.valeur_predite) !== nombre(l.vise)) {
          err('I7', 'le pari du rang ' + l.rang + ' vise ' + q.valeur_predite + ' pour une ligne qui vise ' + l.vise);
        }
      });
      siens.forEach(function (q) {
        if (!q.set_observe) return;
        var l = couvertes.filter(function (c) { return c.id === q.set_observe; })[0];
        if (!l || !l.validee) err('I7', 'un pari (rang ' + q.fondement.rang + ') est observé sur une série qui n\'est pas une ligne validée du plan');
        else if (Number(l.rang) !== Number(q.fondement.rang)) {
          err('I7', 'un pari du rang ' + q.fondement.rang + ' est observé sur la série de rang ' + l.rang);
        }
      });
    }

    // Le message affiché est celui de la réaction, sur la bonne série.
    if ((x.message ? 1 : 0) !== (msg ? 1 : 0) ||
        (x.message && msg && x.message.iSerie !== (couvertes[msg.rang] || {}).iSerie)) {
      err('I9', 'la phrase affichée ne correspond pas au message de la réaction');
    }
  }

  // I4 — d'un plan au suivant, une ligne figée ne change jamais : même rang,
  // même rôle, même charge, même visée — et elle reste figée. On suit la
  // SÉRIE (son identifiant), pas sa position : une série ajoutée ou retirée
  // plus haut décale les positions, jamais une ligne figée. Une série
  // supprimée n'a plus de ligne : rien à comparer.
  function verifierSuite(avant, plan, erreurs) {
    ((avant && avant.exercices) || []).forEach(function (xa, i) {
      var xp = ((plan && plan.exercices) || [])[i];
      if (!xp || xp.slug !== xa.slug) return;
      var parId = {};
      (xp.lignes || []).forEach(function (l) { if (l.id) parId[l.id] = l; });
      (xa.lignes || []).forEach(function (la) {
        if (!la.figee || !la.id) return;
        var lp = parId[la.id];
        if (!lp) return;
        var nom = 'I4 — exercice ' + xa.iExo + ' (' + xa.slug + '), série ' + la.id + ' : ';
        if (!lp.figee) { erreurs.push(nom + 'figée avant, plus maintenant'); return; }
        if (lp.rang !== la.rang) erreurs.push(nom + 'rang ' + la.rang + ' → ' + lp.rang);
        if (lp.role !== la.role) erreurs.push(nom + 'rôle ' + la.role + ' → ' + lp.role);
        if (!memeCharge(lp.charge, la.charge)) erreurs.push(nom + 'charge ' + la.charge + ' → ' + lp.charge);
        if (nombre(lp.vise) !== nombre(la.vise)) erreurs.push(nom + 'visée ' + la.vise + ' → ' + lp.vise);
      });
    });
  }

  // `entrees` (facultatif) : I7 — les paris de la séance face aux lignes ;
  // I12 — mêmes entrées, même plan, et les entrées ne sont pas modifiées par
  // le calcul. `avant` (facultatif) : le plan précédent, pour I4.
  function verifierPlan(plan, entrees, avant) {
    var erreurs = [];
    var parisSeance = entrees && entrees.paris ? entrees.paris.filter(function (q) {
      return q && q.fondement && (!plan || plan.seance === null || q.fondement.seance === plan.seance);
    }) : null;
    ((plan && plan.exercices) || []).forEach(function (x) { verifierExercice(x, erreurs, parisSeance); });
    if (avant) verifierSuite(avant, plan, erreurs);
    if (entrees !== undefined) {
      var avant = JSON.stringify(entrees);
      var refait = planDeSeance(entrees);
      if (JSON.stringify(refait) !== JSON.stringify(plan)) erreurs.push('I12 — même entrée, plan différent');
      if (JSON.stringify(entrees) !== avant) erreurs.push('I12 — le calcul a modifié ses entrées');
    }
    return { ok: erreurs.length === 0, erreurs: erreurs };
  }

  // ══ LA GARDE DU COACH (49-U7, C6) — CHAQUE PLAN, HORS PRODUCTION ════════
  //
  // Hors production, chaque plan que l'app calcule passe `verifierPlan` : une
  // violation s'écrit en console (l'invariant, le plan, les entrées) et un
  // petit marqueur apparaît à l'écran. EN PRODUCTION, RIEN : ni calcul en plus
  // (`verifierPlan` refait le plan pour I12), ni affichage.
  //
  // ⚠️ L'APP SE CROIT EN PRODUCTION PAR DÉFAUT. Le domaine de production n'est
  // écrit nulle part dans le dépôt : on ne le reconnaît pas, on reconnaît ce
  // qui n'en est PAS. La garde s'allume seulement :
  //   · sur la machine du développeur ou du banc : `localhost`, `*.localhost`,
  //     `127.0.0.1`, `::1` ;
  //   · sur une PRÉVISUALISATION Cloudflare Pages : `<déploiement>.<projet>.
  //     pages.dev` — quatre étiquettes ou plus. La production servie par
  //     Cloudflare est `<projet>.pages.dev` (trois) ou un domaine à soi ;
  //   · ou par le paramètre explicite `?garde=1`, retenu sur l'appareil
  //     (`th-v2-garde`) ; `?garde=0` l'éteint, et l'emporte sur l'hôte.
  // Tout autre hôte — un domaine à soi, `<projet>.pages.dev` — est la
  // production.
  //
  // `I10 suite` n'est pas une violation : c'est la partie RAPPORTÉE de I10
  // (49-U4), en attente d'une décision de fond. Elle s'écrit en console, à
  // part, sans marqueur.
  var CLE_GARDE = 'th-v2-garde';

  function hoteDeDeveloppement(hote) {
    var h = String(hote || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    if (/\.localhost$/.test(h)) return true;
    return /\.pages\.dev$/.test(h) && h.split('.').length >= 4;
  }

  // `location` : `{ hostname, search }` ; `stockage` : `{ getItem, setItem }`
  // (ou rien). Rend `true` si la garde tourne.
  function gardeActive(location, stockage) {
    var loc = location || {};
    var m = /[?&]garde=([01])(?:&|$)/.exec(String(loc.search || ''));
    if (m) {
      try { if (stockage) stockage.setItem(CLE_GARDE, m[1]); } catch (e) { /* stockage fermé */ }
      return m[1] === '1';
    }
    var retenu = null;
    try { retenu = stockage ? stockage.getItem(CLE_GARDE) : null; } catch (e) { retenu = null; }
    if (retenu === '1') return true;
    if (retenu === '0') return false;
    return hoteDeDeveloppement(loc.hostname);
  }

  // `o` : `{ location, stockage, journal, marquer }`. `journal` : une console ;
  // `marquer(violations)` : le marqueur à l'écran (l'app le dessine). Rend
  // `{ active, verifier(plan, entrees) }` ; en production, `verifier` ne fait
  // RIEN et rend `null`.
  function creerGarde(o) {
    var e = o || {};
    var active = gardeActive(e.location, e.stockage);
    var precedent = null;
    var violations = [];
    var plans = 0;
    function verifier(plan, entrees) {
      if (!active || !plan) return null;
      // I4 : le plan d'avant, s'il est de la même séance.
      var avant = precedent && precedent.seance === plan.seance ? precedent : null;
      var v = api.verifierPlan(plan, entrees, avant);
      precedent = plan;
      plans += 1;
      var graves = v.erreurs.filter(function (x) { return x.indexOf('I10 suite') !== 0; });
      var rapports = v.erreurs.filter(function (x) { return x.indexOf('I10 suite') === 0; });
      var j = e.journal || null;
      if (rapports.length && j && j.info) j.info('[garde du coach] rapporté', rapports);
      if (graves.length) {
        violations = violations.concat(graves);
        if (j && j.error) j.error('[garde du coach] ' + graves.length + ' violation(s)', graves, { plan: plan, entrees: entrees });
        if (e.marquer) e.marquer(violations.slice());
      }
      return { violations: graves, rapports: rapports };
    }
    // Ce que la garde a vu : le banc le lit pour s'assurer que chacune de ses
    // sections a été vérifiée.
    function etat() { return { active: active, plans: plans, violations: violations.slice() }; }
    return { active: active, verifier: verifier, etat: etat };
  }

  var api = {
    planDeSeance: planDeSeance,
    planDesLignes: planDesLignes,
    rejouer: rejouer,
    verifierPlan: verifierPlan,
    gardeActive: gardeActive,
    creerGarde: creerGarde,
    seriesDites: seriesDites,
    seriesDeDepart: seriesDeDepart,
    SERIES_DEPART_PROGRESSER: SERIES_DEPART_PROGRESSER,
    SERIES_DEPART_ENTRETIEN: SERIES_DEPART_ENTRETIEN,
    // Le dernier plan calculé par l'app, et ses entrées : le banc le lit pour
    // vérifier les invariants après chaque geste. Rien ne le relit en prod.
    dernier: null
  };

  racine.THPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
