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
  function Semaine() { return racine.THSemaine; }
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
      // §14.7 — la ligne de la série de plus (après les séries de la routine).
      if (cov.ajoutee) ligne.ajoutee = true;
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
    // actuelle, où la ligne n'est pas encore figée. `enregistrerPari` n'écrit que
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
      // MOTEUR §9.16 (49-U11) — la phase GELÉE de la séance, dans le fondement
      // de chaque pari (I18). `rejouer` ne la passe pas : les cas du simulateur
      // gardent leur fondement tel quel.
      if (p.length && o.phase !== undefined) p[0].fondement.phase = o.phase;
      // MOTEUR §14.4 (49-U14) — le compteur de l'exercice À L'OUVERTURE, figé
      // dans le fondement de chaque pari : le blocage généralisé se lit dans
      // les paris des 7 jours, sans rejeu. Et la semaine allégée se dit.
      if (p.length && o.compteur !== undefined) p[0].fondement.compteur = o.compteur;
      if (p.length && o.allegee) p[0].fondement.allegee = true;
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
    return { montee: montee };
  }

  // `reference` : le début de la séance du jour — le constat dit « mardi »
  // contre elle (§20.2), jamais contre l'horloge.
  function constatDuPlan(lignes, consigne, suite, reglage, reference) {
    var couvertes = lignes.filter(function (l) { return l.role !== 'hors'; });
    if (!couvertes.length || !couvertes.every(function (l) { return l.validee; })) return null;
    if (!suite || !suite.consigne) return null;
    var c = Moteur().constatDuJour(consigne, suite.consigne, reglage || null,
      suite.cranSuivant === undefined ? null : suite.cranSuivant, faitsDuJour(lignes, consigne),
      reference === undefined ? null : reference);
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
  //
  // §20.2 (49-U9) — LE FORMATEUR DE LA VOIX EST CELUI DE `modele.js`, le même
  // que le moteur : `kgFois`, qui en recopiait un second ici, est parti.
  function Voix() { return racine.THModele; }
  function nombreFr(v) { return Voix().nombre(v); }
  var NBSP = '\u00a0';
  function kg(v) { return Voix().charge(nombre(v)); }
  function kgFois(charge, reps) { return Voix().chargeFois(nombre(charge), reps); }
  var ROLE_FEUILLE = { ligne: 'consigne', test: 'test', coach: 'proposée par le coach',
                       retour: 'retour à ta charge de travail' };

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

  // ── L'ÉTAPE DES CHAUFFES ET DE LA DÉGRESSIVE (MOTEUR §9.15, 49-U10) ──────
  //
  // « La routine (ou l'utilisateur) décide combien de chauffes et de
  // dégressives, et leurs reps ; le coach en calcule la charge. » Les lignes
  // restent HORS de la couverture (`hors`) : ni pari, ni réaction, ni
  // stagnation (§9.15.4). Elles gagnent seulement :
  //   · une ligne de chauffe : `chauffe: { charge }` — la charge de la table,
  //     `null` pour une ligne en trop — et, non validée et remplie, son
  //     fantôme (`source: 'chauffe'`) ;
  //   · la première ligne dégressive après la dernière série de travail :
  //     `degressive: { charge, vise, repos, phrase }`, et son fantôme ; À LA
  //     BARRE, un fantôme de charge VIDE — « la ligne reste vide ».
  //
  // `materiel` : `{ equipement, sol, deja_sollicite, pas, refus }`, lu au
  // catalogue par `planDeSeance` ; `null` (exercice hors catalogue) : l'étape
  // se tait. La RÉFÉRENCE des chauffes est la charge de la consigne FIGÉE (la
  // ligne, pas le test) : une montée en séance ne change aucune chauffe.
  var MATERIELS_DE_CHAUFFE = ['barre', 'machine', 'machine_smith', 'poulie', 'haltere'];

  function chauffesEtDegressive(lignes, series, consigne, materiel) {
    var sortie = { chauffes: null, proposition: null, degressive: null };
    if (!materiel) return sortie;
    var M = Moteur(), S = Seance();
    var liste = series || [];

    // La table ne connaît que la barre, la machine (Smith comprise), la poulie
    // et les haltères (§9.15.1) : élastique, disque, kettlebell, rien — pas de
    // chauffe calculée. La dégressive, elle, vaut pour tout ce qui n'est pas
    // une barre.
    var reference = consigne && consigne.etat !== 'silence' && MATERIELS_DE_CHAUFFE.indexOf(materiel.equipement) >= 0
      ? chargeDeTravail(consigne) : null;
    if (reference !== null) {
      var deChauffe = lignes.filter(function (l) { return l.type === 'echauffement'; });
      var entree = {
        equipement: materiel.equipement, reference: reference,
        deja_sollicite: !!materiel.deja_sollicite, sol: !!materiel.sol, cran: materiel.pas,
        routine: deChauffe.length ? deChauffe.map(function (l) {
          var v = nombre(liste[l.iSerie] && liste[l.iSerie].reps_visees);
          return v;
        }) : null
      };
      var r = M.chauffesDe(entree);
      if (deChauffe.length) {
        deChauffe.forEach(function (l, k) {
          var c = r.lignes[k] ? r.lignes[k].charge : null;
          l.chauffe = { charge: c };
          if (c !== null && !l.validee) l.fantome = { charge: c, reps: null, source: 'chauffe' };
        });
        sortie.chauffes = {
          situation: r.situation, reference: reference, phrase: r.phrase,
          non_remplies: r.non_remplies, prevues: M.TABLE_CHAUFFES[r.situation].length,
          iSerie: deChauffe[0].iSerie
        };
      } else if (r.proposition.length && !materiel.refus &&
                 !lignes.some(function (l) { return l.validee; })) {
        // §9.15.2 — aucune ligne de chauffe : une PROPOSITION, jamais des
        // séries insérées d'office. Tant qu'aucune série de l'exercice n'est
        // faite : après, la montée n'a plus d'objet.
        sortie.proposition = { situation: r.situation, reference: reference,
                               lignes: r.proposition, phrase: r.phrase_proposition };
      }
    }

    // §9.15.3 — LA DÉGRESSIVE : la première ligne dégressive qui suit la
    // dernière série de travail. Sa référence : cette série, faite (sa charge
    // et ses reps) ou à faire (la charge et la visée de sa ligne).
    var derniere = -1;
    lignes.forEach(function (l, i) { if (l.type === 'travail') derniere = i; });
    if (derniere < 0) return sortie;
    var deg = null;
    for (var i = derniere + 1; i < lignes.length; i++) {
      if (lignes[i].type === 'degressive') { deg = lignes[i]; break; }
    }
    if (!deg) return sortie;
    var t = lignes[derniere];
    var sr = liste[t.iSerie] || {};
    var charge, reps;
    if (t.validee) {
      charge = nombre(sr.charge_kg);
      reps = nombre(sr.reps);
    } else {
      charge = t.fantome ? nombre(t.fantome.charge) : nombre(t.charge);
      if (charge === null) charge = nombre(sr.charge_kg);
      reps = nombre(t.vise);
      if (reps === null) reps = nombre(sr.reps_visees);
    }
    if (charge === null && materiel.equipement !== 'barre') return sortie;
    var d = M.degressiveDe({ equipement: materiel.equipement, derniere_serie: charge,
                             reps_travail: reps, cran: materiel.pas });
    deg.degressive = { charge: d.charge, vise: d.vise || null,
                       repos: d.repos === undefined ? null : d.repos, phrase: d.phrase };
    if (!deg.validee) deg.fantome = { charge: d.charge, reps: null, source: 'degressive' };
    sortie.degressive = { iSerie: deg.iSerie, apres: t.iSerie, reference: charge,
                          charge: d.charge, repos: deg.degressive.repos, phrase: d.phrase };
    return sortie;
  }

  // §9.15.1 — LE REPOS DES CHAUFFES : « environ 1 minute entre deux chauffes,
  // 2 minutes avant la première série de travail (le minuteur de la séance
  // l'applique) ». Le repos de l'exercice (routine) vaut pour les séries de
  // travail, pas pour les chauffes.
  var REPOS_ENTRE_CHAUFFES = 60;
  var REPOS_APRES_CHAUFFES = 120;

  // Le repos qui suit la validation de la série `iSerie` de l'exercice `x`
  // (son plan) : `null` avant la dégressive que le coach a remplie (§9.15.3,
  // « sans repos ») ; 60 s après une chauffe, 120 s après la DERNIÈRE chauffe
  // de l'exercice ; sinon `reposExo`, le repos de l'exercice. Pure : l'app
  // la lit, et le minuteur ne calcule rien.
  function reposApres(x, iSerie, reposExo) {
    var lignes = (x && x.lignes) || [];
    var d = x && x.degressive;
    if (d && d.apres === iSerie && d.repos === 0 && d.charge !== null &&
        lignes[d.iSerie] && !lignes[d.iSerie].validee) return null;
    var l = lignes[iSerie];
    if (l && l.type === 'echauffement') {
      var derniere = -1;
      lignes.forEach(function (h, i) { if (h.type === 'echauffement') derniere = i; });
      return iSerie === derniere ? REPOS_APRES_CHAUFFES : REPOS_ENTRE_CHAUFFES;
    }
    return reposExo === undefined ? null : reposExo;
  }

  // La feuille « Pourquoi » (§9.15.1) : une routine qui prévoit plus de
  // chauffes que la table — les lignes en trop ne sont pas remplies, et la
  // feuille le dit.
  function noteDesChauffes(ch) {
    if (!ch || !ch.non_remplies) return null;
    var n = ch.non_remplies;
    return 'Ta routine prévoit ' + nombreFr(ch.prevues + n) + ' chauffes ; le coach en calcule ' +
      nombreFr(ch.prevues) + (n > 1 ? ' : les ' + nombreFr(n) + ' dernières restent à remplir.'
                                  : ' : la dernière reste à remplir.');
  }

  // ── LE PLAN D'UN EXERCICE ───────────────────────────────────────────────
  function planDExercice(exo, iExo, consigneDuSlug, paris, seanceId, reglage, suite, debut, materiel, phase, allegee, seriesRoutine, marche, routinePlus) {
    var S = Seance(), M = Moteur();
    var series = (exo && exo.series) || [];
    var c = consigneDuSlug && consigneDuSlug.consigne ? consigneDuSlug : null;
    var base = { iExo: iExo, slug: exo ? exo.exercise_slug : null, consigne: null };
    if (!c) {
      base.lignes = series.map(function (s, i) {
        return { iSerie: i, type: S.typeDe(s), role: 'hors', validee: S.partEnBase(s) };
      });
      // §9.15 — sans consigne, pas de chauffe (pas de référence) ; la
      // dégressive se cale sur la dernière série de travail faite.
      var sans = chauffesEtDegressive(base.lignes, series, null, materiel || null);
      base.materiel = materiel ? materiel.equipement || null : null;
      base.chauffes = null;
      base.proposition = null;
      base.degressive = sans.degressive;
      return base;
    }
    // La consigne figée (§9.9, delta 49-13) : c'est elle que lisent les lignes
    // figées, l'en-tête, le constat et les invariants.
    var consigne = M.consigneFigee(c.consigne);
    // MOTEUR §14.4 (49-U14) — PENDANT UNE SEMAINE ALLÉGÉE, la consigne de
    // l'exercice est la consigne allégée : même charge, 2 reps de moins, 60 %
    // des séries de la routine, rien ne monte. C'est elle que lisent les
    // lignes, l'en-tête, les paris, les chauffes et les invariants.
    if (allegee && consigne && consigne.etat !== 'silence') consigne = M.consigneAllegee(consigne, seriesRoutine);
    // MOTEUR §14.5 (49-U15) — LE REPLI (deuxième déclenchement isolé) : la
    // consigne de la séance devient celle du repli — la charge du dernier
    // palier tenu, sa visée bornée à la zone, sans ligne haute (I22). Les
    // chauffes s'y calent, les paris de consigne continuent.
    if (marche && marche.repli && !consigne.allegee && consigne.etat !== 'silence') {
      consigne = M.consigneRepli(consigne, marche.repli);
    }
    // MOTEUR §14.7 (49-U17) — LA SÉRIE DE PLUS EN COURS : la consigne sait que
    // la routine compte `routinePlus` séries ; la ligne en plus les suit, à la
    // charge et à la visée de la ligne, jamais un test.
    if (routinePlus && !consigne.allegee) consigne = M.consigneSerieDePlus(consigne, routinePlus);
    var siens = (paris || []).filter(function (l) {
      return l && l.exercise_slug === base.slug && l.fondement && l.fondement.seance === seanceId;
    });
    // ⚠️ LES LIGNES FIGÉES SE LISENT ICI, UNE FOIS, DANS LES PARIS DE LA SÉANCE
    // (§9.13, #322) — et nulle part ailleurs : elles sont une ENTRÉE du plan.
    var figees = S.figeesDe(siens, series, consigne);
    // Sans compteur (une consigne figée avant 49-U13), rien ne s'écrit : un 0
    // inventé se lirait comme un progrès (mémoire et observation, §14.4).
    var compteurOuverture = c.compteur && typeof c.compteur.compteur === 'number' ? c.compteur.compteur : undefined;
    var r = planDesLignes(series, consigne, c.contexte || null, figees, {
      slug: base.slug, seance: seanceId === undefined ? null : seanceId,
      reglage: reglage === undefined ? null : reglage, phase: phase,
      compteur: compteurOuverture, allegee: !!consigne.allegee
    });

    // L'en-tête décrit la disposition de la consigne sur les lignes de la
    // séance (ECRAN §3.12, 26/09/2026) — plus le `n` de la consigne brute.
    var disposition = r.planInitial.map(function (p) { return p && p.role === 'haut' ? 'haut' : 'ligne'; });
    var entete = M.enteteDeDisposition(consigne, disposition);
    var gris = c.libelles ? c.libelles.gris : '';
    if (consigne.allegee) {
      // « 125 kg × 3 », et en gris « 2 séries au lieu de 4, cette semaine ».
      entete = { jaune: [M.phraseAllegee(consigne)], segments: entete.segments };
      gris = M.detailAllegee(consigne);
    }
    // §14.5 — « On repart de 120 kg, ta dernière charge tenue : … le 3 févr. »
    if (consigne.repli) gris = M.phraseRepli(consigne.repli, debut);
    // §14.7 — « une série de plus, jusqu'à ton prochain progrès », en gris.
    var grisPlus = consigne.serieDePlus ? M.GRIS_SERIE_DE_PLUS : null;
    var donc = entete.jaune.length ? 'Donc ' + entete.jaune.join(', ') + '.' : null;
    var autour = chauffesEtDegressive(r.lignes, series, consigne, materiel || null);
    var pourquoi = pourquoiDuPlan(consigne, r.lignes, donc);
    var note = noteDesChauffes(autour.chauffes);
    if (pourquoi && note) pourquoi.chauffes = note;
    // §12.9 (49-U13) — le compteur de stagnation, calculé avec la consigne
    // figée (`consigneDExercice`) ; sa phrase, à 4 séances ou plus, s'écrit en
    // gris dans l'en-tête et en une ligne de la feuille « Pourquoi ».
    var compteur = c.compteur || null;
    // Pendant la semaine allégée, le compteur se tait : rien ne se juge.
    var phraseDuCompteur = compteur && !consigne.allegee ? M.phraseCompteur(compteur) : null;
    // §14.5 (49-U15) — LA MARCHE PARLE À LA PLACE DU COMPTEUR, une seule voix :
    // en sèche, la phrase grise dit qu'il n'y a rien de plus ; la carte de
    // schéma et le repli disent déjà le meilleur ; au silence, la phrase quitte
    // l'en-tête et passe une fois dans le constat.
    if (marche && compteur) {
      if (marche.marche === M.MARCHE_SECHE) phraseDuCompteur = M.phraseSeche(compteur);
      else if (marche.marche === M.MARCHE_SILENCE || marche.carte || consigne.repli) phraseDuCompteur = null;
    }
    if (pourquoi && phraseDuCompteur) pourquoi.compteur = phraseDuCompteur;
    var constat = constatDuPlan(r.lignes, consigne, suite, reglage, debut);
    if (constat && marche && marche.marche === M.MARCHE_SILENCE && marche.declenchement && compteur) {
      constat.escalier = M.phraseCompteur(compteur);
    }

    return {
      iExo: iExo, slug: base.slug,
      consigne: consigne, contexte: c.contexte || null,
      indices: r.indices, rangs: r.rangs, roles: r.roles, figees: figees,
      planInitial: r.planInitial, faites: r.faites, reaction: r.reaction,
      lignes: r.lignes, message: r.message, paris: r.paris,
      constat: constat,
      entete: { jaune: entete.jaune, gris: gris, segments: entete.segments, compteur: phraseDuCompteur, plus: grisPlus },
      // §14.5 (49-U15) — la marche de l'escalier de cet exercice, ou `null` :
      // `{ marche, n, compteur, declenchement, zone, carte?, repli?, reponse? }`.
      escalier: marche || null,
      compteur: compteur ? { compteur: compteur.compteur, meilleur: compteur.meilleur } : null,
      donc: donc,
      pourquoi: pourquoi,
      materiel: materiel ? materiel.equipement || null : null,
      chauffes: autour.chauffes, proposition: autour.proposition, degressive: autour.degressive
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

  // §9.15 (49-U10) — ce que l'étape des chauffes lit du catalogue.
  //
  // « PREMIER SUR SES MUSCLES » : aucun exercice PLACÉ AVANT lui dans la séance
  // (l'ordre de la séance, fait ou non) n'a un muscle PRIMAIRE en commun avec
  // les siens (catalogue, `muscles_primaires`). Les muscles secondaires ne
  // comptent pas. « SOULEVÉ AU SOL » : `Moteur.SOULEVES_AU_SOL` — le
  // conventionnel, le sumo, la barre hexagonale ; pas le roumain.
  function materielDe(exos, i, catalogue, consigneDuSlug, refus) {
    var slug = exos[i] && exos[i].exercise_slug;
    var cat = catalogue && slug && Object.prototype.hasOwnProperty.call(catalogue, slug) ? catalogue[slug] : null;
    // Sans matériel au catalogue, on ne devine pas : l'étape se tait.
    if (!cat || !cat.equipement) return null;
    var miens = cat.muscles_primaires || [];
    var deja = false;
    for (var k = 0; k < i && !deja; k++) {
      var autre = exos[k] && catalogue[exos[k].exercise_slug];
      var siens = (autre && autre.muscles_primaires) || [];
      deja = siens.some(function (m) { return miens.indexOf(m) >= 0; });
    }
    var pas = consigneDuSlug ? nombre(consigneDuSlug.pas) : null;
    return {
      equipement: cat.equipement || null,
      sol: Moteur().SOULEVES_AU_SOL.indexOf(slug) >= 0,
      deja_sollicite: deja,
      pas: pas,
      refus: !!(refus && refus[slug])
    };
  }

  // §9.15.2 (49-U10) — LA MÉMOIRE DES « NON MERCI », en fonctions pures : l'app
  // la garde sur l'appareil (`localStorage`, `th-v2-refus-chauffes`), jamais en
  // base. `memoire` : `{ [slug]: { n, seance } }` — `n` les refus d'affilée,
  // un par séance au plus ; `seance` celle du dernier. Rend toujours un objet
  // NEUF : l'app s'en sert comme clé de son mémo.
  var REFUS_DEFINITIFS = 3;

  function refuserChauffes(memoire, slug, seanceId) {
    var r = Object.assign({}, memoire || {});
    var x = r[slug] || { n: 0, seance: null };
    r[slug] = x.seance === seanceId ? x : { n: (Number(x.n) || 0) + 1, seance: seanceId };
    return r;
  }

  // « Ajouter » : le compte repart de zéro.
  function accepterChauffes(memoire, slug) {
    var r = Object.assign({}, memoire || {});
    delete r[slug];
    return r;
  }

  // L'entrée du plan : `{ [slug]: true }` — refusée dans CETTE séance, ou
  // trois fois d'affilée.
  function refusChauffesDe(memoire, seanceId) {
    var sortie = {};
    Object.keys(memoire || {}).forEach(function (slug) {
      var x = memoire[slug] || {};
      if (x.seance === seanceId || Number(x.n) >= REFUS_DEFINITIFS) sortie[slug] = true;
    });
    return sortie;
  }

  // MOTEUR §9.16 (49-U11) — les phases qu'un pari peut porter. Vide, ou
  // inconnue : `maintien` (« je ne sais pas »). Jamais vide dans un fondement.
  var PHASES_DU_PLAN = ['prise_de_masse', 'maintien', 'seche'];
  function phaseDuPlan(v) { return PHASES_DU_PLAN.indexOf(v) >= 0 ? v : 'maintien'; }

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
  //     séries de travail de l'exercice sont faites : le constat en a besoin ;
  //   · `catalogue` — `{ [slug]: { equipement, muscles_primaires } }`, les
  //     exercices de la séance lus au catalogue (§9.15, 49-U10) ;
  //   · `refusChauffes` — `{ [slug]: true }` : la proposition de chauffes est
  //     retirée (« Non merci » dans la séance, ou trois refus d'affilée) ;
  //   · `phase` — la phase GELÉE de la séance (MOTEUR §9.16, 49-U11), lue dans
  //     le profil par l'app quand la consigne se fige ; vide = `maintien` ;
  //   · `volume` — MOTEUR §14.6 (49-U16) : `{ [muscle]: { place, moyenne,
  //     seuil, fenetres } | null }`, la règle de volume calculée UNE FOIS par
  //     séance sur tout l'historique (`Moteur.placeDeVolume`) ; facultatif.
  //
  // Pure : mêmes entrées, même plan ; les entrées ne sont jamais modifiées.
  function planDeSeance(entrees) {
    var e = entrees || {};
    var seance = e.seance || {};
    var consignes = e.consignes || {};
    var exos = seance.exercices || [];
    var phase = phaseDuPlan(e.phase);
    var esc = escalierDuPlan(e, seance, consignes);
    var seriesRoutine = (e.escalier && e.escalier.seriesRoutine) || {};
    var isoles = marchesIsolees(e, seance, consignes, esc, phase);
    var plus = seriesDePlusActives(e, seance, consignes, esc, phase);
    // Une marche par EXERCICE (I21) : un exercice présent deux fois dans la
    // séance ne la porte que sur sa première occurrence ; le repli, lui, est la
    // consigne de l'exercice — les deux occurrences la lisent.
    var portee = {};
    return {
      seance: seance.id === undefined ? null : seance.id,
      phase: phase,
      allegee: esc.allegee,
      carte: esc.carte,
      exercices: exos.map(function (exo, i) {
        var slug = exo && exo.exercise_slug;
        var c = Object.prototype.hasOwnProperty.call(consignes, slug) ? consignes[slug] : null;
        var suites = e.suites || {};
        var suite = Object.prototype.hasOwnProperty.call(suites, slug) ? suites[slug] : null;
        var m = Object.prototype.hasOwnProperty.call(isoles, slug) ? isoles[slug] : null;
        if (m && portee[slug]) m = m.repli ? { marche: m.marche, repli: m.repli, copie: true } : null;
        if (m) portee[slug] = true;
        var x = planDExercice(exo, i, c, e.paris || [], seance.id, e.reglage, suite, seance.debut,
          materielDe(exos, i, e.catalogue || null, c, e.refusChauffes || {}), phase,
          !!esc.allegee, Object.prototype.hasOwnProperty.call(seriesRoutine, slug) ? seriesRoutine[slug] : null, m,
          Object.prototype.hasOwnProperty.call(plus, slug) ? plus[slug] : null);
        if (x.escalier && x.escalier.copie) x.escalier = null;
        // MOTEUR §14.6 (49-U16) — LA PLACE POUR UNE SÉRIE DE PLUS : de la place
        // sur CHACUN des muscles primaires de l'exercice (catalogue), lue dans
        // `entrees.volume`. Un fait, rien d'affiché : la série de plus (PR 2c)
        // le lira. `null` sans entrée de volume.
        x.placeSerieDePlus = placeDeLExercice(e, slug);
        return x;
      })
    };
  }

  // ── MOTEUR §14.4 (49-U14) — L'ÉTAPE DE L'ESCALIER : LA SEMAINE ALLÉGÉE ───
  //
  // `entrees.escalier` (facultatif, donné par l'app) :
  //   · `cartes` — les paris de l'escalier (`Moteur.cartesDesParis`) ;
  //   · `compteurs` — `[{ exercice, jour, compteur, seance, debut }]`, le
  //     compteur à l'ouverture lu dans le fondement des paris de consigne des
  //     AUTRES séances (serveur et appareil) ;
  //   · `noms` — `{ [slug]: nom }`, les noms du catalogue ;
  //   · `seriesRoutine` — `{ [slug]: n }`, les séries de travail de chaque
  //     exercice à l'ouverture, figées avec la consigne.
  // La séance du jour lit ses compteurs dans ses consignes figées. Rend
  // `{ allegee, carte }` : la période en cours, ou la carte à proposer — jamais
  // les deux (I20).
  // §14.4 (49-U14, décidé le 01/10/2026) — PENDANT LA PÉRIODE, LA SÉANCE NE
  // CONTIENT QUE LES LIGNES ALLÉGÉES. Les lignes « en trop » : les séries de
  // TRAVAIL qu'une consigne allégée ne couvre pas, et qui ne sont PAS validées
  // — une série déjà validée n'est jamais retirée. Rend `[{ iExo, iSerie }]`,
  // les indices décroissants dans chaque exercice (on retire par la fin). Pure ;
  // l'app l'applique à l'acceptation et à la création d'une séance dans la
  // période, jamais au rendu : « + Série » reste libre ensuite.
  // §14.7 (49-U17) — LA LIGNE DE LA SÉRIE DE PLUS À CRÉER : un exercice dont la
  // consigne porte une série de plus et qui n'a encore QUE les séries de sa
  // routine (autant de séries de travail que `routine`). Rend `[iExo]`. Pur ;
  // l'app l'applique à l'acceptation et à la création d'une séance, jamais au
  // rendu : une ligne retirée par la personne ne revient pas (§14.3).
  function lignesAAjouter(plan) {
    var sortie = [];
    ((plan && plan.exercices) || []).forEach(function (x) {
      var p = x && x.consigne && x.consigne.serieDePlus;
      if (!p) return;
      var travail = (x.lignes || []).filter(function (l) { return l.type === 'travail'; }).length;
      if (travail === p.routine) sortie.push(x.iExo);
    });
    return sortie;
  }

  function lignesARetirer(plan) {
    var sortie = [];
    if (!plan || !plan.allegee) return sortie;
    (plan.exercices || []).forEach(function (x) {
      if (!x || !x.consigne || !x.consigne.allegee) return;
      (x.lignes || []).filter(function (l) {
        return l.role === 'hors' && l.type === 'travail' && !l.validee;
      }).map(function (l) { return l.iSerie; }).sort(function (a, b) { return b - a; })
        .forEach(function (i) { sortie.push({ iExo: x.iExo, iSerie: i }); });
    });
    return sortie;
  }

  // Les compteurs à l'ouverture, par jour : ceux des AUTRES séances (lus dans
  // leurs paris), plus ceux de la séance qui s'ouvre (ses consignes figées).
  // Rend `{ jours, ouverts }` — `ouverts` : les exercices de la séance qui
  // s'ouvre, les seuls qui peuvent déclencher.
  function joursDesCompteurs(esc, seance, consignes, jour) {
    var jours = {};
    var poser = function (jr, slug, n) {
      var j = jours[jr] || (jours[jr] = {});
      if (j[slug] === undefined || n > j[slug]) j[slug] = n;
    };
    (esc.compteurs || []).forEach(function (x) {
      if (!x || !x.jour || x.seance === seance.id || typeof x.compteur !== 'number') return;
      poser(x.jour, x.exercice, x.compteur);
    });
    // ⚠️ LE DÉCLENCHEUR EST UN EXERCICE DE LA SÉANCE QUI S'OUVRE : une autre
    // séance du même jour ne prête que ses compteurs.
    var ouverts = [];
    Object.keys(consignes).forEach(function (slug) {
      var c = consignes[slug];
      var n = c && c.consigne && c.compteur && typeof c.compteur.compteur === 'number' ? c.compteur.compteur : null;
      if (n === null) return;
      poser(jour, slug, n);
      ouverts.push(slug);
    });
    return { jours: jours, ouverts: ouverts };
  }

  // ── MOTEUR §14.5 (49-U15) — L'ÉTAPE DE L'ESCALIER : LE BLOCAGE ISOLÉ ─────
  //
  // Pour chaque exercice de la séance qui a un DÉCLENCHEMENT (compteur à 4, 8,
  // 12…) et pour qui aucune carte de semaine allégée ne s'ouvre : le n-ième
  // déclenchement isolé, et sa marche (`Moteur.marcheIsolee`). Hors de la
  // séance d'un déclenchement, seul le silence demeure (la phrase reste hors
  // de l'en-tête). Rien pendant une semaine allégée, rien en Édition (I21).
  // Un exercice CITÉ par la carte ouverte, ou par une carte répondue dans
  // cette séance, n'a pas de marche isolée : une marche à la fois, et après
  // un refus « au prochain blocage, je regarderai exercice par exercice ».
  // `entrees.escalier.marches` : les marches déjà écrites (`marchesDesParis`).
  // Rend `{ [slug]: marche }`.
  function marchesIsolees(e, seance, consignes, esc, phase) {
    var sortie = {};
    var E = e.escalier;
    if (!E || seance.edition || esc.allegee) return sortie;
    var M = Moteur();
    var jour = M.jourCivil(seance.debut);
    if (!jour) return sortie;
    var cartes = E.cartes || [];
    var compteurs = E.compteurs || [];
    var marches = E.marches || [];
    var pris = {};
    var prendre = function (l) { (l || []).forEach(function (s) { pris[s] = true; }); };
    if (esc.carte) prendre(esc.carte.cites);
    cartes.forEach(function (k) {
      if (k && k.seance === seance.id) prendre((k.cites && k.cites.length) ? k.cites : [k.declencheur]);
    });
    var J = null;
    Object.keys(consignes).forEach(function (slug) {
      var c = consignes[slug];
      if (pris[slug] || !c || !c.consigne || !c.compteur || typeof c.compteur.compteur !== 'number') return;
      var k = c.compteur.compteur;
      var zone = c.consigne.zone;
      var n = M.nIsole(k, M.declenchementsRepondus(slug, jour, k, cartes, compteurs));
      // §14.7 (49-U17) — la place sur chacun des muscles primaires (§14.6), et
      // une série de plus déjà proposée depuis le dernier progrès.
      var place = placeDeLExercice(e, slug);
      var proposee = M.serieDePlusProposee(slug, jour, k, marches, compteurs);
      var marche = M.marcheIsolee(n, zone, phase, place, proposee);
      if (!marche) return;
      var declenche = M.estDeclenchement(k);
      if (!declenche && marche !== M.MARCHE_SILENCE) return;
      var m = { marche: marche, n: n, compteur: k, declenchement: declenche, zone: zone === undefined ? null : zone };
      if (marche === M.MARCHE_REPLI) {
        // Repli sauté (aucun palier ne remplit les cinq conditions) : le silence.
        if (c.repli) m.repli = c.repli;
        else { m.marche = M.MARCHE_SILENCE; m.saute = true; }
      }
      if (marche === M.MARCHE_SCHEMA || marche === M.MARCHE_SERIE_DE_PLUS) {
        // UNE MARCHE PROPOSÉE NE REVIENT PAS (§14.7, delta 49-35) : répondue
        // dans cette séance, ou proposée depuis le dernier progrès (une autre
        // séance du même déclenchement) — la même règle pour le schéma et la
        // série de plus. La ligne en plus acceptée se lit dans
        // `seriesDePlusActives`.
        var deja = marches.filter(function (x) {
          return x && x.seance === seance.id && x.exercice === slug && x.marche === marche;
        })[0] || M.marcheProposee(slug, jour, k, marches, compteurs, marche);
        if (deja) {
          m.reponse = deja.reponse;
        } else {
          if (J === null) J = joursDesCompteurs(E, seance, consignes, jour);
          var avancent = M.autresAvancent(J.jours, jour, slug);
          m.carte = marche === M.MARCHE_SCHEMA
            ? M.carteSchema(zone, c.compteur.meilleur, k, avancent)
            : M.carteSerieDePlus(c.compteur.meilleur, k, avancent, musclesPrimaires(e, slug));
          if (!m.carte) return;
        }
      }
      sortie[slug] = m;
    });
    return sortie;
  }

  // §14.6, §14.7 — la place pour une série de plus sur CHACUN des muscles
  // primaires de l'exercice (catalogue), lue dans `entrees.volume` ; `null`
  // sans entrée de volume.
  function placeDeLExercice(e, slug) {
    if (!e.volume) return null;
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    return Moteur().placePourExercice(e.volume, cat ? cat.muscles_primaires : null);
  }

  // Les muscles primaires de l'exercice, avec leur nom au catalogue
  // (`THSemaine.libelleMuscle`), pour la carte de la série de plus.
  function musclesPrimaires(e, slug) {
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    var Sm = Semaine();
    return ((cat && cat.muscles_primaires) || []).map(function (m) {
      return { cle: m, libelle: Sm && Sm.libelleMuscle ? Sm.libelleMuscle(m) : m };
    });
  }

  // §14.7 (49-U17) — LES SÉRIES DE PLUS EN COURS : acceptées, pas de progrès
  // depuis — à chaque séance de l'exercice jusqu'à son prochain progrès. Jamais
  // pendant une semaine allégée, jamais en sèche, jamais en zone force (I23) ;
  // la routine compte `seriesRoutine[slug]` séries (figées avec la consigne).
  // Rend `{ [slug]: n }`.
  function seriesDePlusActives(e, seance, consignes, esc, phase) {
    var sortie = {};
    var E = e.escalier;
    if (!E || seance.edition || esc.allegee || phase === 'seche') return sortie;
    var M = Moteur();
    var jour = M.jourCivil(seance.debut);
    if (!jour) return sortie;
    var routine = E.seriesRoutine || {};
    Object.keys(consignes).forEach(function (slug) {
      var c = consignes[slug];
      if (!c || !c.consigne || !c.compteur || typeof c.compteur.compteur !== 'number') return;
      if (c.consigne.zone === 'lourd' || c.consigne.zone === 'mix' || !c.consigne.zone) return;
      if (!M.serieDePlusActive(slug, jour, c.compteur.compteur, E.marches || [], E.compteurs || [])) return;
      var n = Object.prototype.hasOwnProperty.call(routine, slug) ? Number(routine[slug]) : NaN;
      if (isFinite(n) && n >= 1) sortie[slug] = n;
    });
    return sortie;
  }

  function escalierDuPlan(e, seance, consignes) {
    var vide = { allegee: null, carte: null };
    var esc = e.escalier;
    if (!esc || seance.edition) return vide;
    var M = Moteur();
    var jour = M.jourCivil(seance.debut);
    if (!jour) return vide;
    var cartes = esc.cartes || [];
    var p = M.periodeAllegee(cartes, jour);
    if (p) {
      return { allegee: { debut: p.debut, fin: p.fin, bandeau: M.bandeauAllegee(p.fin), declencheur: p.declencheur },
               carte: null };
    }
    // Une carte à laquelle cette séance a déjà répondu ne revient pas.
    if (cartes.some(function (c) { return c && c.seance === seance.id; })) return vide;
    // La démonstration du blocage isolé (`?escalier=isole`, garde active
    // seulement) suspend la carte : ses trois exercices témoins, à 4 et plus,
    // la déclencheraient, et elle masquerait les marches qu'on veut montrer.
    if (esc.carteSuspendue === true) return vide;
    var J = joursDesCompteurs(esc, seance, consignes, jour);
    var b = M.blocageGeneralise(J.jours, jour, esc.noms || null, J.ouverts);
    if (!b || !M.carteAutorisee(b.declencheur, jour, cartes, esc.compteurs || [])) return vide;
    var nom = function (s) { return esc.noms && esc.noms[s] ? esc.noms[s] : s; };
    return {
      allegee: null,
      carte: { jour: jour, declencheur: b.declencheur, compteur: b.compteur, cites: b.cites.slice(),
               phrase: M.phraseCarte(b.cites.map(nom)), detail: M.DETAIL_CARTE }
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
      else if (/sur la dernière série/.test(x)) compte += 1;
      else if (/sur une série/.test(x)) compte += 1;
      else if ((m = /sur (\d+) séries/.exec(x))) compte += Number(m[1]);
      else sansCompte += 1;
    });
    return { compte: compte, sansCompte: sansCompte };
  }

  // Le rôle qu'un pari écrit, pour le rôle d'une ligne du plan.
  var ROLE_DU_PARI = { ligne: 'ligne', test: 'haut', coach: 'coach', retour: 'retour' };

  // I16, I17 (MOTEUR §9.15.4, 49-U10) — les chauffes et la dégressive.
  //
  // I16 : les charges de chauffe que le coach remplit montent (la barre vide
  // peut se répéter), toutes SOUS la référence — sauf la barre vide, qui ne
  // descend jamais (§9.15.1 : « jamais sous la barre vide » l'emporte) ; la
  // proposition, dont le coach décide aussi les reps, a des reps qui ne
  // montent pas. Les reps des lignes sont celles de la routine : pas au coach.
  // I17 : la dégressive est sous la dernière série de travail, et jamais
  // remplie à la barre. Le fantôme d'une ligne non validée porte la charge
  // décidée — c'est ce qui s'écrit à la validation.
  function verifierAutour(x, err) {
    var lignes = x.lignes || [];
    var barre = x.materiel === 'barre';
    var ch = x.chauffes;
    var sousRef = function (c, ref) {
      return (c < ref && !memeCharge(c, ref)) || (barre && memeCharge(c, 20));
    };
    if (ch) {
      var avant = null;
      lignes.forEach(function (l) {
        if (!l.chauffe || l.chauffe.charge === null) return;
        var c = nombre(l.chauffe.charge);
        if (!sousRef(c, ch.reference)) err('I16', 'chauffe ' + c + ' pas sous la référence ' + ch.reference + ' (série ' + l.iSerie + ')');
        if (avant !== null && c < avant && !memeCharge(c, avant)) err('I16', 'chauffe ' + c + ' après ' + avant + ' : la montée redescend (série ' + l.iSerie + ')');
        if (!l.validee && (!l.fantome || !memeCharge(l.fantome.charge, c))) err('I16', 'la chauffe de la série ' + l.iSerie + ' n’est pas dans son fantôme');
        avant = c;
      });
    }
    if (x.proposition) {
      var pa = null, pr = null;
      x.proposition.lignes.forEach(function (q) {
        if (!sousRef(q[0], x.proposition.reference)) err('I16', 'chauffe proposée ' + q[0] + ' pas sous la référence ' + x.proposition.reference);
        if (pa !== null && q[0] < pa) err('I16', 'chauffe proposée ' + q[0] + ' après ' + pa);
        if (pr !== null && q[1] > pr) err('I16', 'reps proposées ' + q[1] + ' après ' + pr + ' : elles montent');
        pa = q[0]; pr = q[1];
      });
      if (lignes.some(function (l) { return l.type === 'echauffement'; })) err('I16', 'une proposition de chauffes alors que l’exercice en a');
    }
    var d = x.degressive;
    if (d) {
      var l = lignes[d.iSerie] || {};
      if (barre && d.charge !== null) err('I17', 'une dégressive remplie à la barre (' + d.charge + ')');
      if (barre && !l.validee && l.fantome && l.fantome.charge !== null) err('I17', 'la dégressive à la barre a un fantôme de charge (' + l.fantome.charge + ')');
      if (d.charge !== null && !(d.charge < d.reference && !memeCharge(d.charge, d.reference))) {
        err('I17', 'dégressive ' + d.charge + ' pas sous la dernière série de travail ' + d.reference);
      }
      if (!l.validee && (!l.fantome || !memeCharge(l.fantome.charge, d.charge))) err('I17', 'la dégressive n’est pas dans son fantôme');
    }
  }

  // `avantX` (facultatif) : le même exercice dans le plan d'avant (I7, G2).
  function verifierExercice(x, erreurs, parisSeance, avantX) {
    var nom = 'exercice ' + x.iExo + ' (' + x.slug + ')';
    var err = function (inv, texte) { erreurs.push(inv + ' — ' + nom + ' : ' + texte); };
    var lignes = x.lignes || [];

    // I1 — chaque ligne a un seul rôle ; seules les séries de travail sont couvertes.
    lignes.forEach(function (l) {
      if (!ROLES[l.role]) err('I1', 'série ' + l.iSerie + ' sans rôle valide (' + l.role + ')');
      if (l.role !== 'hors' && l.type !== 'travail') err('I1', 'série ' + l.iSerie + ' couverte mais de type ' + l.type);
      // Une ligne hors couverture (chauffe, dégressive, échec) n'a jamais de
      // pari (§9.15.4).
      if (l.role === 'hors' && x.paris && x.paris[l.iSerie]) err('I1', 'série ' + l.iSerie + ' hors couverture, avec un pari');
    });
    verifierAutour(x, err);
    // I25 (49-U18, 01/10/2026) — AUCUNE LIGNE DE TRAVAIL À FAIRE N'EST LAISSÉE
    // HORS PLAN SOUS UNE CONSIGNE : elle prend la charge du coach (§9.13), et
    // son pré-remplissage vient du plan, jamais d'une ancienne séance. Une
    // montée en charge se déclare en échauffement (rôle explicite). Seule la
    // semaine allégée laisse des lignes hors plan (`couvre`, I19).
    var k25 = x.consigne;
    if (k25 && k25.etat !== 'silence' && (k25.ligne || k25.haut) && typeof k25.couvre !== 'number') {
      lignes.forEach(function (l) {
        if (l.type === 'travail' && !l.validee && l.role === 'hors') {
          err('I25', 'la série de travail ' + l.iSerie + ' est hors plan sous une consigne « ' + k25.etat + ' »');
        }
      });
    }
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
        // §20.2 (49-U9) — la visée se dit « × 5 » (plus « vise 5 ») : la règle
        // ne change pas, seul le mot qu'elle cherche.
        var dit = (e.jaune || []).some(function (t) {
          return String(t).replace(/\u00a0/g, ' ').indexOf('\u00d7 ' + s.vise) >= 0;
        });
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
    //
    // ⚠️ G2 (delta 49-17, 28/09/2026) — UN PARI S'ÉCRIT AVANT QUE LE PLAN
    // SUIVANT SOIT CALCULÉ, ET JAMAIS APRÈS COUP. Une ligne qui VIENT d'être
    // validée — non validée dans le plan d'avant (`avantX`) — doit porter son
    // pari dès ce plan-ci. Une ligne validée sans aucun pari, qui ne vient pas
    // de l'être (séance reprise d'un autre appareil, séance d'avant 49-C,
    // série injectée), est NON PARIÉE : I7 ne l'exige pas, et personne ne
    // l'écrit après coup. Sans plan d'avant, rien ne « vient » d'être validé.
    if (parisSeance) {
      var valideeAvant = {};
      ((avantX && avantX.lignes) || []).forEach(function (la) {
        if (la && la.id) valideeAvant[la.id] = !!la.validee;
      });
      var vientDEtreValidee = function (l) {
        return !!avantX && !!l.id && valideeAvant[l.id] === false;
      };
      var siens = parisSeance.filter(function (q) {
        return q && q.exercise_slug === x.slug && q.fondement;
      });
      var revisionsI7 = racine.THMoteur.revisionsDuPlan(cour);
      couvertes.forEach(function (l) {
        if (!l.validee) return;
        var duRang = siens.filter(function (q) { return Number(q.fondement.rang) === Number(l.rang); });
        var revL = revisionsI7[l.position] || 0;
        var deSaRevision = duRang.filter(function (q) { return (Number(q.fondement.revision) || 0) === revL; });
        var aParier = !!(x.paris && x.paris[l.iSerie]);
        var attendu = l.figee || (aParier && (duRang.length > 0 || vientDEtreValidee(l)));
        if (!attendu) {
          // Non pariée (G2) : aucun pari sur ce rang, donc aucune erreur ici.
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
  // même rôle, même charge, même visée — et elle reste figée, TANT QU'ELLE
  // RESTE VALIDÉE (G1, delta 49-17, 28/09/2026) : dévalidée, elle redevient une
  // ligne du plan et peut être revalidée sous une autre révision (delta W3).
  // Le code l'interdisait depuis 49-U3, contre W3 — la garde l'a trouvé. On suit la
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
        // H1, E2 (49-18, 49-19) : tant qu'elle reste une SÉRIE DE TRAVAIL validée —
        // passée en échauffement, en dégressive ou en échec, elle sort de la
        // couverture (`hors`).
        if (!lp || !lp.validee || lp.role === 'hors') return;
        var nom = 'I4 — exercice ' + xa.iExo + ' (' + xa.slug + '), série ' + la.id + ' : ';
        if (!lp.figee) { erreurs.push(nom + 'figée avant, plus maintenant'); return; }
        if (lp.rang !== la.rang) erreurs.push(nom + 'rang ' + la.rang + ' → ' + lp.rang);
        if (lp.role !== la.role) erreurs.push(nom + 'rôle ' + la.role + ' → ' + lp.role);
        if (!memeCharge(lp.charge, la.charge)) erreurs.push(nom + 'charge ' + la.charge + ' → ' + lp.charge);
        if (nombre(lp.vise) !== nombre(la.vise)) erreurs.push(nom + 'visée ' + la.vise + ' → ' + lp.vise);
      });
    });
  }

  // I18 (MOTEUR §9.16, 49-U11) — chaque pari de la séance porte dans son
  // fondement la phase GELÉE du plan (`prise_de_masse`, `maintien` ou
  // `seche`, jamais vide), la même pour tous : ceux que le plan écrira
  // (`x.paris`) comme ceux déjà posés (`entrees.paris`).
  function verifierPhase(plan, parisSeance, erreurs) {
    if (!plan) return;
    var phase = plan.phase;
    if (PHASES_DU_PLAN.indexOf(phase) < 0) erreurs.push('I18 — la phase du plan est vide ou inconnue (' + phase + ')');
    var voir = function (q, ou) {
      var f = q && q.fondement;
      if (!f) return;
      if (PHASES_DU_PLAN.indexOf(f.phase) < 0) {
        erreurs.push('I18 — ' + ou + ' : un pari sans phase (' + f.phase + ')');
      } else if (f.phase !== phase) {
        erreurs.push('I18 — ' + ou + ' : un pari à la phase ' + f.phase + ' dans une séance à ' + phase);
      }
    };
    (plan.exercices || []).forEach(function (x) {
      (x.paris || []).forEach(function (q, i) { voir(q, 'exercice ' + x.iExo + ' (' + x.slug + '), série ' + i); });
    });
    (parisSeance || []).forEach(function (q) { voir(q, 'pari posé ' + (q.exercise_slug || '') + ' rang ' + (q.fondement && q.fondement.rang)); });
  }

  // I19, I20 (MOTEUR §14.4, 49-U14) — la semaine allégée et sa carte.
  //
  // I19 : pendant une période allégée, aucune ligne de test ni proposition de
  // montée (ni dans le plan initial, ni dans la réaction), et chaque exercice
  // avec une consigne couvre 60 % des séries de la routine, arrondi (moins
  // s'il reste moins de séries de travail) ; ses paris le disent (`allegee`).
  // I20 : au plus une carte par séance — jamais pendant une période, jamais
  // sur une séance qui y a déjà répondu. La règle n'est pas relue : I19 compte
  // les lignes, I20 lit les paris de l'escalier donnés en entrée.
  // I21, I22 (MOTEUR §14.5, 49-U15) — le blocage isolé.
  // I21 : au plus UNE marche de l'escalier par exercice et par séance (une
  // carte de semaine allégée qui le cite en est une), et jamais pendant une
  // semaine allégée.
  // I22 : une consigne de repli n'a pas de ligne haute, aucune ligne de test ni
  // proposition du coach dès le départ, et sa charge est strictement sous le
  // meilleur, à 10 % au plus sous lui. La règle n'est pas relue : I22 confronte
  // la charge au meilleur du compteur que le plan porte.
  function verifierMarches(plan, erreurs) {
    if (!plan) return;
    var cites = plan.carte && Array.isArray(plan.carte.cites) ? plan.carte.cites : [];
    var vues = {};
    (plan.exercices || []).forEach(function (x) {
      var nom = 'exercice ' + x.iExo + ' (' + x.slug + ')';
      var m = x.escalier;
      if (m) {
        if (Array.isArray(m) || !m.marche) erreurs.push('I21 — ' + nom + ' : la marche n\'est pas UNE marche');
        if (plan.allegee) erreurs.push('I21 — ' + nom + ' : une marche (' + m.marche + ') pendant une semaine allégée');
        if (cites.indexOf(x.slug) >= 0) erreurs.push('I21 — ' + nom + ' : une marche pour un exercice cité par la carte');
        if (m.carte && x.consigne && x.consigne.repli) erreurs.push('I21 — ' + nom + ' : une carte de schéma ET un repli');
        if (vues[x.slug]) erreurs.push('I21 — ' + nom + ' : une seconde marche pour le même exercice');
        vues[x.slug] = true;
      }
      // I23 (§14.7) — jamais de série de plus en sèche ni en zone force ; une
      // carte de série de plus seulement quand les muscles ont de la place.
      // I24 — la ligne en plus n'est jamais un test et suit les lignes de la
      // routine.
      var sp = x.consigne && x.consigne.serieDePlus;
      var carteSp = m && m.carte && m.carte.type === 'serie_de_plus';
      if (sp || carteSp) {
        var zSp = x.consigne ? x.consigne.zone : null;
        if (plan.phase === 'seche') erreurs.push('I23 — ' + nom + ' : une série de plus en sèche');
        if (zSp === 'lourd' || zSp === 'mix') erreurs.push('I23 — ' + nom + ' : une série de plus en zone force (' + zSp + ')');
        if (plan.allegee) erreurs.push('I23 — ' + nom + ' : une série de plus pendant une semaine allégée');
      }
      if (carteSp && x.placeSerieDePlus !== true) erreurs.push('I23 — ' + nom + ' : une série de plus proposée sans place');
      if (sp) {
        var trav = (x.lignes || []).filter(function (l) { return l.type === 'travail'; });
        trav.forEach(function (l, j) {
          if (j >= sp.routine && l.role !== 'hors' && l.role !== 'ligne' && !l.validee) {
            erreurs.push('I24 — ' + nom + ' : la ligne en plus (série ' + l.iSerie + ') est une ligne ' + l.role);
          }
          if (j >= sp.routine && l.role !== 'hors' && !l.ajoutee) {
            erreurs.push('I24 — ' + nom + ' : la série ' + l.iSerie + ', après la routine, n\'est pas la ligne en plus');
          }
          if (j < sp.routine && l.ajoutee) {
            erreurs.push('I24 — ' + nom + ' : la ligne en plus (série ' + l.iSerie + ') ne suit pas les lignes de la routine');
          }
        });
      }
      var r = x.consigne && x.consigne.repli;
      if (!r) return;
      var err = function (texte) { erreurs.push('I22 — ' + nom + ' : ' + texte); };
      if (plan.allegee) err('un repli pendant une semaine allégée');
      if (x.consigne.haut) err('une ligne haute sur la consigne de repli');
      (x.planInitial || []).forEach(function (q, i) {
        if (q && q.role === 'haut') err('la ligne ' + i + ' est un test');
      });
      var meilleur = x.compteur && x.compteur.meilleur ? Number(x.compteur.meilleur.palier) : NaN;
      var ch = x.consigne.ligne ? Number(x.consigne.ligne.charge) : NaN;
      if (!isFinite(meilleur) || !isFinite(ch)) {
        err('un repli sans meilleur ou sans charge');
      } else if (ch >= meilleur - 1e-9) {
        err(ch + ' kg n\'est pas sous le meilleur (' + meilleur + ' kg)');
      } else if (meilleur - ch > meilleur * Moteur().REPLI_MAX_REPRISE + 1e-9) {
        err(ch + ' kg est à plus de 10 % sous le meilleur (' + meilleur + ' kg)');
      }
    });
  }

  function verifierEscalier(plan, entrees, erreurs) {
    if (!plan) return;
    var M = Moteur();
    if (plan.carte && plan.allegee) erreurs.push('I20 — une carte pendant une semaine allégée');
    if (plan.carte && (Array.isArray(plan.carte) || !plan.carte.declencheur)) {
      erreurs.push('I20 — la carte n\'est pas UNE proposition (' + JSON.stringify(plan.carte) + ')');
    }
    var esc = entrees && entrees.escalier;
    if (plan.carte && esc && (esc.cartes || []).some(function (c) { return c && c.seance === plan.seance; })) {
      erreurs.push('I20 — une carte sur une séance qui y a déjà répondu');
    }
    if (!plan.allegee) return;
    (plan.exercices || []).forEach(function (x) {
      if (!x.consigne || x.consigne.etat === 'silence') return;
      var nom = 'exercice ' + x.iExo + ' (' + x.slug + ')';
      var err = function (texte) { erreurs.push('I19 — ' + nom + ' : ' + texte); };
      var a = x.consigne.allegee;
      if (!a) { err('une consigne qui n\'est pas allégée pendant la période'); return; }
      if (x.consigne.haut) err('une ligne haute pendant la période');
      (x.lignes || []).forEach(function (l) {
        if (l.role === 'test' || l.role === 'coach') err('la série ' + l.iSerie + ' est une ligne ' + l.role);
      });
      ((x.reaction && x.reaction.plan) || []).forEach(function (q, i) {
        if (q && q.source === 'coach') err('une proposition de montée (ligne ' + i + ')');
      });
      var travail = (x.lignes || []).filter(function (l) { return l.type === 'travail'; }).length;
      var couvertes = (x.lignes || []).filter(function (l) { return l.role !== 'hors'; }).length;
      var attendu = Math.min(M.seriesAllegees(a.routine), travail);
      if (couvertes !== attendu) {
        err(couvertes + ' ligne(s) couverte(s), pour ' + attendu + ' attendue(s) (60 % de ' + a.routine + ')');
      }
      (x.paris || []).forEach(function (q, i) {
        if (q && !(q.fondement && q.fondement.allegee === true)) err('le pari de la série ' + i + ' ne dit pas « allégée »');
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
    var memeSeance = !!(avant && plan && avant.seance === plan.seance);
    verifierPhase(plan, parisSeance, erreurs);
    verifierEscalier(plan, entrees, erreurs);
    verifierMarches(plan, erreurs);
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var xa = memeSeance ? (avant.exercices || [])[i] : null;
      verifierExercice(x, erreurs, parisSeance, xa && xa.slug === x.slug ? xa : null);
    });
    if (avant) verifierSuite(avant, plan, erreurs);
    if (entrees !== undefined) {
      var entreesAvant = JSON.stringify(entrees);
      var refait = planDeSeance(entrees);
      if (JSON.stringify(refait) !== JSON.stringify(plan)) erreurs.push('I12 — même entrée, plan différent');
      if (JSON.stringify(entrees) !== entreesAvant) erreurs.push('I12 — le calcul a modifié ses entrées');
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
    lignesARetirer: lignesARetirer,
    lignesAAjouter: lignesAAjouter,
    planDesLignes: planDesLignes,
    rejouer: rejouer,
    verifierPlan: verifierPlan,
    gardeActive: gardeActive,
    creerGarde: creerGarde,
    seriesDites: seriesDites,
    seriesDeDepart: seriesDeDepart,
    reposApres: reposApres,
    REPOS_ENTRE_CHAUFFES: REPOS_ENTRE_CHAUFFES,
    REPOS_APRES_CHAUFFES: REPOS_APRES_CHAUFFES,
    REFUS_DEFINITIFS: REFUS_DEFINITIFS,
    refuserChauffes: refuserChauffes,
    accepterChauffes: accepterChauffes,
    refusChauffesDe: refusChauffesDe,
    SERIES_DEPART_PROGRESSER: SERIES_DEPART_PROGRESSER,
    SERIES_DEPART_ENTRETIEN: SERIES_DEPART_ENTRETIEN,
    // Le dernier plan calculé par l'app, et ses entrées : le banc le lit pour
    // vérifier les invariants après chaque geste. Rien ne le relit en prod.
    dernier: null
  };

  racine.THPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
