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

  var ROLES = { ligne: true, test: true, coach: true, retour: true, elan: true, hors: true };

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

  // ══ §9.17 (50-1) — LA NATURE DE LA CHARGE, LUE SUR LA CONSIGNE ═══════════════
  //
  // Le poids du corps est une charge qui vaut 0, une aide une charge négative
  // (la convention de la base) : la consigne les porte déjà (`palier`), le plan
  // les LIT — il ne redevine rien (un seul coach). Un palier nul ou négatif ne
  // vient jamais d'une vraie charge : le contrat d'un exercice en `reps` le
  // fabrique (`THPalier.analyserPoidsDuCorps`).
  function estPoidsDuCorps(consigne) { return !!consigne && nombre(consigne.palier) === 0; }
  function estAide(consigne) {
    var p = consigne ? nombre(consigne.palier) : null;
    return p !== null && p < 0;
  }
  // La charge qu'une série FAITE porte pour le plan. Au poids du corps, la série
  // n'a pas de charge en base (`charge_kg` vide : `validerSerie` n'écrit que les
  // champs du gabarit) et la ligne qu'elle suit vaut 0 : sans cette lecture, une
  // série ne « suivrait » jamais sa ligne (`aSuiviSaLigne`), et le fantôme
  // recopierait la dernière série au lieu du plan.
  function chargeLue(serie, pdc) {
    var c = serie && serie.charge_kg !== undefined ? serie.charge_kg : null;
    return pdc && (c === null || c === undefined) ? 0 : c;
  }

  // Le rôle d'une ligne du plan, lu sur la réaction (ce que la ligne PROPOSE
  // maintenant) et, à défaut, sur la couverture (ce que la consigne y prévoit).
  function roleDeLigne(initiale, courante) {
    var src = courante && courante.source;
    if (src === 'coach') return 'coach';
    if (src === 'retour') return 'retour';
    // §9.14 bis (68A) — la suite portée à la charge d'une série plus lourde.
    if (src === 'elan') return 'elan';
    // §9.14 ter (68B) — une ligne « à fond » garde son rôle : un retour reste un retour.
    if (src === 'a_fond' && courante.sourceAvant === 'retour') return 'retour';
    var r = initiale && initiale.role;
    if (r === 'haut') return 'test';
    if (r === 'coach' || r === 'retour' || r === 'elan') return r;
    return 'ligne';
  }

  // ── L'ÉTAPE 4 : LE FANTÔME D'UNE LIGNE (§9.13 bis, révisé le 11/10/2026, 68A) ──
  //
  // « Le fantôme d'une ligne vient d'une seule source : la ligne du plan. »
  // Une ligne non validée affiche sa charge et sa visée. Quand l'utilisateur
  // s'écarte du plan, le plan reste affiché et la phrase du coach s'adapte
  // (MOTEUR §9.14 bis) : on ne recopie plus en silence une charge qui n'était
  // peut-être qu'un essai (la recopie de la dernière série, 49-U2, est partie :
  // le rowing du 10/10, 73 × 12 recopié, puis le plan revenu sans un mot).
  //
  // Les reps d'une ligne du coach ou d'élan se tapent : `reps` nul (la grille
  // montre la fourchette de la zone).
  //
  // « Suivre sa ligne » (`aSuiviSaLigne`) reste : le constat la lit. La même
  // charge que la ligne ; pour une ligne du coach, sa charge ou plus — « le
  // cran au-dessus » sans chiffre : toute charge au-dessus de la charge de
  // travail.
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
    if (l.role === 'coach' || l.role === 'elan') return fait >= prevue || memeCharge(fait, prevue);
    return memeCharge(fait, prevue);
  }

  function poserFantomes(lignes) {
    lignes.forEach(function (l) {
      if (l.role === 'hors') return;
      l.fantome = l.validee ? null
        : { charge: l.charge, reps: l.role === 'coach' || l.role === 'elan' ? null : l.vise, source: 'plan' };
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
    var pdc = estPoidsDuCorps(consigne);
    var liste = series || [];
    var couverture = S.couvertureSeance(liste, consigne, figees || {}, o.rangsReserves || null);
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
      faites.push({ charge_kg: chargeLue(s, pdc), reps: s.reps, rpe: s.rpe, ressenti: s.ressenti });
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
        ligne.faite = { charge: chargeLue(sr, pdc),
                        reps: sr.reps === undefined ? null : sr.reps,
                        rpe: sr.rpe === undefined ? null : sr.rpe,
                        ressenti: sr.ressenti === undefined ? null : sr.ressenti };
      }
      return ligne;
    });
    poserFantomes(lignes);

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
      // MOTEUR §9.16 (60-2b) — l'OBJECTIF gelé, jumeau de la phase (I40). `null` est
      // une valeur (« sans réponse ») : la clé s'écrit, d'où `!== undefined`.
      // `rejouer` ne le passe pas : sans clé, comme pour la phase.
      if (p.length && o.objectif !== undefined) p[0].fondement.objectif = o.objectif;
      // MOTEUR §14.4 (49-U14) — le compteur de l'exercice À L'OUVERTURE, figé
      // dans le fondement de chaque pari : le blocage généralisé se lit dans
      // les paris des 7 jours, sans rejeu. Et la semaine allégée se dit.
      if (p.length && o.compteur !== undefined) p[0].fondement.compteur = o.compteur;
      if (p.length && o.allegee) p[0].fondement.allegee = true;
      // Prérequis d'« adapter » — l'occurrence de l'exercice dans la séance :
      // un même exercice peut y figurer deux fois, et chaque pari dit à QUELLE
      // occurrence il appartient (`THSeance.parisDeLOccurrence`, l'identifiant).
      if (p.length && o.occurrence) p[0].fondement.occurrence = o.occurrence;
      paris[l.iSerie] = p.length ? p[0] : null;
    });

    // La phrase du coach : sur la ligne `message.rang` (une POSITION).
    var m = reaction.message;
    // §20 bis (49-U19) — la phrase se rédige sous capture : ses chiffres
    // déclarés restent à côté du plan (`citationsMessage`), pour I26.
    var dite = m ? Voix().capturer(function () { return M.phraseReaction(m, consigne.zone); }) : null;
    var message = m ? {
      position: m.rang, iSerie: indices[m.rang] === undefined ? null : indices[m.rang],
      type: m.type, phrase: dite.texte
    } : null;

    return {
      consigne: consigne, indices: indices, rangs: rangs, roles: roles,
      planInitial: planInitial, faites: faites, reaction: reaction,
      lignes: lignes, message: message, paris: paris,
      citationsMessage: dite ? dite.citations : []
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
      // §9.14 bis (68A) — une ligne d'élan tenue est une montée tenue du jour.
      if ((l.role !== 'coach' && l.role !== 'elan') || !l.validee || !aSuiviSaLigne(l, consigne) || !z) return;
      // MOTEUR §17.4 révisé (68B) — la montée du jour se DIT sur les reps
      // faites : prise à fond, elle a tenu (même si la suite est revenue à la
      // charge de travail, §9.14 ter).
      var comptees = nombre(l.faite.reps);
      if (comptees === null || comptees < z.bas || comptees > z.haut) return;
      if (!montee || nombre(l.faite.charge) > nombre(montee.charge)) {
        montee = { charge: l.faite.charge, reps: l.faite.reps };
      }
    });
    return { montee: montee };
  }

  // `reference` : le début de la séance du jour — le constat dit « mardi »
  // contre elle (§20.2), jamais contre l'horloge.
  //
  // `fini` : l'exercice est fini (`Seance.exerciceFini`, relevé du 01/10, PR 2)
  // — la MÊME définition que celle avec laquelle l'app calcule la suite. Elle
  // implique que chaque ligne couverte est validée (une ligne couverte est une
  // série de travail) : I10 a le vérifie.
  function constatDuPlan(lignes, consigne, suite, reglage, reference, fini) {
    var couvertes = lignes.filter(function (l) { return l.role !== 'hors'; });
    if (!couvertes.length || !fini) return null;
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
    // §20 bis (49-U19) — les lignes de la prochaine séance, telles que la
    // consigne suivante les donne : la source des cibles suivantes (I26).
    var ft = k.fondement && k.fondement.test ? k.fondement.test : null;
    c.suiteLignes = {
      ligne: k.ligne ? { charge: k.ligne.charge, vise: k.ligne.vise } : null,
      haut: k.haut ? { charge: k.haut.charge, vise: k.haut.vise } : null,
      test: ft ? { charge: ft.charge, reps: ft.reps, date: ft.date || null } : null,
      cran: suite.cranSuivant === undefined ? null : suite.cranSuivant,
      // La structure de la prochaine séance (PR 7) : la source des « sur les
      // 2 dernières séries » que le constat écrit.
      n: typeof k.n === 'number' ? k.n : null,
      k: k.haut && typeof k.haut.k === 'number' ? k.haut.k : null,
      // Ce que le constat compare (PR 7) : le niveau du jour — celui de la
      // consigne suivante, ou la meilleure série en Franc —, le haut de sa
      // zone, et la cible d'un étirement.
      niveau: typeof k.niveau === 'number' ? k.niveau : null,
      repsMax: (k.fondement && Array.isArray(k.fondement.reps) ? k.fondement.reps : [])
        .reduce(function (m, r) { return typeof r === 'number' && r > m ? r : m; }, 0),
      zoneHaut: Moteur().zoneParCle(k.zone) ? Moteur().zoneParCle(k.zone).haut : null,
      cible: k.fondement && typeof k.fondement.cible === 'number' ? k.fondement.cible : null
    };
    // I27 (relevé du 01/10, PR 2) — la zone CHOISIE de la suite : la même que
    // celle de la consigne, ou aucune des deux. Un silence n'a pas de zone :
    // rien à comparer.
    if (k.etat !== 'silence') c.suiteZoneChoisie = zoneChoisieDe(k);
    return c;
  }

  // La zone que l'utilisateur a CHOISIE pour une consigne (§9.1.1, rang 2) : le
  // moteur pose `fondement.correction` quand une correction fait la zone.
  function zoneChoisieDe(k) {
    return k && k.fondement && k.fondement.correction ? (k.zone === undefined ? null : k.zone) : null;
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
  // §20 bis (49-U19) — chaque chiffre porte sa nature et son objet (`c`).
  function nombreFr(v, c) { return Voix().nombre(v, undefined, c); }
  var NBSP = '\u00a0';
  function kg(v, c) { return Voix().charge(nombre(v), undefined, c); }
  function kgFois(charge, reps, c) { return Voix().chargeFois(nombre(charge), reps, undefined, c); }
  function cite(nature, objet) { return { nature: nature, objet: objet === undefined ? null : objet }; }
  var DU_JOUR = cite('fait_passe', { quoi: 'du_jour' });
  var ROLE_FEUILLE = { ligne: 'consigne', test: 'test', coach: 'proposée par le coach',
                       retour: 'retour à ta charge de travail', elan: 'élan' };

  // 49-U18 (02/10/2026) — SOUS « REJOINT », LES LIGNES DU HAUT NE SONT PAS UN
  // TEST : c'est la nouvelle charge de travail, que les séries restées
  // rejoignent. Leur étiquette est celle de la consigne. Le rôle interne
  // (`test`, le haut) ne change pas : les paris (I7) et la réaction le lisent.
  function libelleDeLigne(l, consigne) {
    if (l.role === 'test' && consigne && consigne.etat === 'rejoint') return ROLE_FEUILLE.ligne;
    return ROLE_FEUILLE[l.role] || l.role;
  }

  function lignesDeLaFeuille(lignes, consigne) {
    var couvertes = (lignes || []).filter(function (l) { return l.role !== 'hors'; });
    var premiereCoach = null;
    return couvertes.map(function (l, k) {
      var cL = cite('cible_du_jour', { role: l.role, rang: l.rang });
      var visee = (l.role === 'coach' || l.role === 'elan') && Array.isArray(l.fourchette) && l.fourchette.length === 2
        ? nombreFr(l.fourchette[0], cite('regle', { regle: 'zone.bas' })) + ' à ' +
          nombreFr(l.fourchette[1], cite('regle', { regle: 'zone.haut' }))
        : (l.vise === null || l.vise === undefined ? '' : nombreFr(l.vise, cite('cible_du_jour', { role: l.role, rang: l.rang, champ: 'reps' })));
      var raison = null;
      if (l.role === 'coach') {
        if (premiereCoach === null) {
          premiereCoach = l;
          var avant = couvertes[k - 1];
          raison = avant && avant.faite ? 'proposée après ' + kgFois(avant.faite.charge, avant.faite.reps, DU_JOUR) : 'proposée par le coach';
        } else {
          raison = premiereCoach.faite
            ? 'la montée a tenu à ' + kgFois(premiereCoach.faite.charge, premiereCoach.faite.reps, DU_JOUR)
            : 'la montée continue';
        }
      } else if (l.role === 'retour') {
        var montee = premiereCoach || couvertes.filter(function (c) { return c.role === 'coach'; })[0];
        raison = 'on revient à ' + kg(l.charge, cL) +
          (montee && montee.faite ? ' après ' + kgFois(montee.faite.charge, montee.faite.reps, DU_JOUR) : '');
      } else if (l.role === 'elan') {
        // §9.14 bis (68A) — sur le patron de la ligne revenue : « on garde
        // 84 kg après 84 kg × 12 ». La série dite est celle qui a porté
        // l'élan : la dernière faite à cette charge qui ne le suivait pas.
        var porteuse = null;
        for (var b = k - 1; b >= 0; b--) {
          var v = couvertes[b];
          if (!v.validee || !v.faite || !memeCharge(nombre(v.faite.charge), nombre(l.charge))) continue;
          if (!porteuse) porteuse = v;
          if (!(v.role === 'elan' && memeCharge(nombre(v.charge), nombre(l.charge)))) { porteuse = v; break; }
        }
        raison = 'on garde ' + kg(l.charge, cL) +
          (porteuse ? ' après ' + kgFois(porteuse.faite.charge, porteuse.faite.reps, DU_JOUR) : '');
      }
      return {
        rang: l.rang, role: l.role, charge: l.charge === undefined ? null : l.charge,
        vise: l.vise === undefined ? null : l.vise,
        texte: kg(l.charge, cL) + (visee ? NBSP + '\u00d7' + NBSP + visee : ''),
        libelle: libelleDeLigne(l, consigne),
        raison: raison,
        faite: l.validee && l.faite ? 'faite' + NBSP + ': ' + Voix().serieFaite(nombre(l.faite.charge), l.faite.reps, DU_JOUR) : null
      };
    });
  }

  // La part de la feuille qui décrit la SÉANCE : « Donc » et les lignes. Les
  // paragraphes (dernière séance, zone, palier, état, réglage) se lisent sur la
  // consigne figée du plan (`x.consigne`) par `pourquoiConsigne` : l'app les
  // assemble, le plan n'a pas à connaître le fondement complet d'une consigne.
  // Les paragraphes de la feuille que le plan pose (la dernière séance, la
  // zone, la charge de travail, l'état, le réglage, la fin) — « Donc » et les
  // lignes viennent de `pourquoiDuPlan`.
  var PARAGRAPHES_DU_POURQUOI = ['seance', 'zone', 'palier', 'etat', 'reglage', 'fin'];
  function texteDesParagraphes(p) {
    var t = [];
    if (p.seance) {
      t.push(p.seance.date);
      (p.seance.lignes || []).forEach(function (l) { t.push([l.texte, l.role].filter(Boolean).join(' · ')); });
    }
    ['zone', 'palier', 'etat', 'reglage', 'fin'].forEach(function (k) { if (p[k]) t.push(p[k]); });
    return t.join(' | ');
  }

  function pourquoiDuPlan(consigne, lignes, donc) {
    if (!consigne) return null;
    var muet = consigne.etat === 'silence';
    return { donc: muet ? null : donc, lignes: muet ? [] : lignesDeLaFeuille(lignes, consigne) };
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
    var sortie = { chauffes: null, proposition: null, degressive: null, citations: {} };
    if (!materiel) return sortie;
    // 119 (audit du 16/10/2026, E6) — UNE MESURE SANS CHARGE N'A NI CHAUFFES NI DÉGRESSIVE DU COACH : une planche, un
    // tapis (une durée, une distance : hors du coach, I13) ou un exercice au poids du corps (I28, §9.17 : pas de
    // dégressive sous un corps). Sans consigne, la ligne dégressive d'une planche faisait dire « Pas de charge de
    // travail pour caler la dégressive. » et proposait deux gestes. Seule `charge_reps` a une charge à baisser ; une
    // mesure inconnue (`null`, hors catalogue) garde le contrat d'avant.
    if (materiel.mesure && materiel.mesure !== 'charge_reps') return sortie;
    var M = Moteur(), S = Seance();
    var liste = series || [];
    // §9.17 — LE LEST N'A NI CHAUFFES NI DÉGRESSIVE : 2,5 kg de lest, 22,5 % de
    // moins, c'est « 0 kg » — des chiffres que la ceinture ne fait pas. La
    // montée se fait sur l'exercice libre, qui est une chauffe en soi.
    if (materiel.equipement === M.EQUIPEMENT_LEST) return sortie;

    // La table ne connaît que la barre, la machine (Smith comprise), la poulie
    // et les haltères (§9.15.1) : élastique, disque, kettlebell, rien — pas de
    // chauffe calculée. La dégressive, elle, vaut pour tout ce qui n'est pas
    // une barre.
    var reference = consigne && consigne.etat !== 'silence' && MATERIELS_DE_CHAUFFE.indexOf(materiel.equipement) >= 0
      ? chargeDeTravail(consigne) : null;
    // §9.17 — PAS DE CHAUFFES AU POIDS DU CORPS (0) NI SUR UNE AIDE (négative) :
    // la référence d'une chauffe est une charge qu'on monte, et le moteur
    // répondait « aucune » en laissant l'objet derrière lui (I30).
    if (reference !== null && reference > 0) {
      var deChauffe = lignes.filter(function (l) { return l.type === 'echauffement'; });
      var entree = {
        equipement: materiel.equipement, reference: reference,
        deja_sollicite: !!materiel.deja_sollicite, sol: !!materiel.sol, cran: materiel.pas,
        // §10 bis (108) — la salle déclarée pour l'exercice, ou `null`.
        salle: materiel.salle || null,
        routine: deChauffe.length ? deChauffe.map(function (l) {
          var v = nombre(liste[l.iSerie] && liste[l.iSerie].reps_visees);
          return v;
        }) : null
      };
      var capR = Voix().capturer(function () { return M.chauffesDe(entree); });
      var r = capR.texte;
      if (deChauffe.length) {
        deChauffe.forEach(function (l, k) {
          var rl = r.lignes[k] || {};
          var c = rl.charge === undefined ? null : rl.charge;
          l.chauffe = { charge: c };
          // §9.15.5 (94) — une chauffe que la table ne prévoyait pas et que le
          // coach ne peut pas distinguer de la précédente : vide, et dit.
          if (rl.trop_leger) l.chauffe.trop_leger = true;
          // Ses reps, quand la routine n'en porte pas : celles de la règle.
          if (rl.reps_coach) l.chauffe.reps = rl.reps;
          if (c !== null && !l.validee) l.fantome = { charge: c, reps: rl.reps_coach ? rl.reps : null, source: 'chauffe' };
        });
        // 49-U18 (02/10/2026) — LA PHRASE DES CHAUFFES DISPARAÎT DÈS QU'UNE
        // CHAUFFE DE L'EXERCICE EST VALIDÉE : « calées sur 52,5 kg : 20 · 45 »
        // restait au-dessus d'une chauffe faite à 40 × 6 — une phrase qui
        // citait des charges que la personne n'avait pas faites.
        var uneFaite = deChauffe.some(function (l) { return l.validee; });
        sortie.chauffes = {
          situation: r.situation, reference: reference, phrase: uneFaite ? null : r.phrase,
          non_remplies: r.non_remplies, prevues: r.prevues, trop_legeres: r.trop_legeres || 0,
          iSerie: deChauffe[0].iSerie
        };
        if (sortie.chauffes.phrase) sortie.citations.chauffes = capR.citations;
      } else if (r.proposition.length && !materiel.refus &&
                 !lignes.some(function (l) { return l.validee; })) {
        // §9.15.2 — aucune ligne de chauffe : une PROPOSITION, jamais des
        // séries insérées d'office. Tant qu'aucune série de l'exercice n'est
        // faite : après, la montée n'a plus d'objet.
        sortie.proposition = { situation: r.situation, reference: reference,
                               lignes: r.proposition, phrase: r.phrase_proposition };
        sortie.citations.proposition = capR.citations;
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
    // §9.17 — sans charge sur la ligne, une consigne au poids du corps ou sur
    // une aide n'a pas de dégressive du tout (I30) : ni charge, ni phrase.
    if (charge === null && consigne && consigne.etat !== 'silence') {
      var ct = nombre(chargeDeTravail(consigne));
      if (ct === null || ct <= 0) return sortie;
    }
    // §9.17 — ET PAS DE DÉGRESSIVE SOUS UN CORPS NI SOUS UNE AIDE : une baisse de
    // 22,5 % d'une charge nulle ou négative n'a pas de sens (I30). Aucun objet,
    // pas seulement aucune charge.
    if (charge !== null && charge <= 0) return sortie;
    var capD = Voix().capturer(function () {
      return M.degressiveDe({ equipement: materiel.equipement, derniere_serie: charge,
                             reps_travail: reps, cran: materiel.pas, salle: materiel.salle || null });
    });
    var d = capD.texte;
    sortie.citations.degressive = capD.citations;
    deg.degressive = { charge: d.charge, vise: d.vise || null,
                       repos: d.repos === undefined ? null : d.repos, phrase: d.phrase };
    if (!deg.validee) deg.fantome = { charge: d.charge, reps: null, source: 'degressive' };
    sortie.degressive = { iSerie: deg.iSerie, apres: t.iSerie, reference: charge,
                          charge: d.charge, repos: deg.degressive.repos, phrase: d.phrase };
    // §9.15.3 (94) — à la barre, ce qu'on enlève de chaque côté ; une ligne
    // que le coach ne peut pas remplir porte ses deux gestes (« En faire une
    // série normale », « La retirer »), tant qu'elle n'est pas faite.
    if (d.enleve !== undefined) sortie.degressive.enleve = d.enleve;
    // §10 bis (108) — à la barre fixe, on change de barre (« Prends la barre de 20 kg. »).
    if (d.barreFixe) sortie.degressive.barreFixe = true;
    if (d.gestes && !deg.validee) sortie.degressive.gestes = d.gestes.slice();
    return sortie;
  }

  // §9.15.1 — LE REPOS DES CHAUFFES : « environ 1 minute entre deux chauffes,
  // 2 minutes avant la première série de travail (le minuteur de la séance
  // l'applique) ». Le repos de l'exercice (routine) vaut pour les séries de
  // travail, pas pour les chauffes.
  // §9.15 — les repos de chauffe : une seule définition, dans le moteur
  // (l'estimation de §9.18 les lit aussi). Lus à l'appel.

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
      return iSerie === derniere ? Moteur().REPOS_APRES_CHAUFFES : Moteur().REPOS_ENTRE_CHAUFFES;
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
  function planDExercice(exo, iExo, consigneDuSlug, paris, seanceId, reglage, suite, debut, materiel, phase, allegee, seriesRoutine, marche, routinePlus, fini, precedent, objectif) {
    var S = Seance(), M = Moteur();
    var series = (exo && exo.series) || [];
    var c = consigneDuSlug && consigneDuSlug.consigne ? consigneDuSlug : null;
    // §10 bis (108) — UNE SEULE SALLE PAR EXERCICE : celle figée avec la consigne
    // (la salle déclarée, en vigueur sur son palier) ; sans consigne, celle du
    // catalogue. Chauffes, dégressive et I46 lisent la même.
    if (materiel) materiel = Object.assign({}, materiel, { salle: c ? (c.salle || null) : (materiel.salle || null) });
    var base = { iExo: iExo, slug: exo ? exo.exercise_slug : null, consigne: null,
                 occurrence: exo && exo.occurrence ? exo.occurrence : null };
    if (!c) {
      base.lignes = series.map(function (s, i) {
        return { iSerie: i, type: S.typeDe(s), role: 'hors', validee: S.partEnBase(s) };
      });
      // §9.15 — sans consigne, pas de chauffe (pas de référence) ; la
      // dégressive se cale sur la dernière série de travail faite.
      var sans = chauffesEtDegressive(base.lignes, series, null, materiel || null);
      base.materiel = materiel ? materiel.equipement || null : null;
      base.salle = materiel ? materiel.salle || null : null;
      base.chauffes = null;
      base.proposition = null;
      base.degressive = sans.degressive;
      preremplir(exo, base.lignes, null, null, precedent);
      base.phrases = [];
      if (sans.degressive && sans.degressive.phrase) {
        base.phrases.push({ ou: 'degressive', texte: sans.degressive.phrase, citations: sans.citations.degressive || [] });
      }
      return base;
    }
    // La consigne figée (§9.9, delta 49-13) : c'est elle que lisent les lignes
    // figées, l'en-tête, le constat et les invariants.
    var consigne = M.consigneFigee(c.consigne);
    // MOTEUR §14.4 (49-U14) — PENDANT UNE SEMAINE ALLÉGÉE, la consigne de
    // l'exercice est la consigne allégée : même charge, 2 reps de moins, 60 %
    // des séries de la routine, rien ne monte. C'est elle que lisent les
    // lignes, l'en-tête, les paris, les chauffes et les invariants.
    if (allegee && consigne && consigne.etat !== 'silence') consigne = M.consigneAllegee(consigne, seriesRoutine, allegee.decharge === true);
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
      reglage: reglage === undefined ? null : reglage, phase: phase, objectif: objectif,
      compteur: compteurOuverture, allegee: !!consigne.allegee,
      occurrence: base.occurrence || undefined,
      // I8 (122) — les rangs que des séries faites ont quittés (supprimées, ou passées hors du travail) : leurs
      // paris restent ; aucune autre série ne les reprend (`Seance.quitterRang`).
      rangsReserves: exo && Array.isArray(exo.rangsQuittes) ? exo.rangsQuittes : null
    });

    // L'en-tête décrit la disposition de la consigne sur les lignes de la
    // séance (ECRAN §3.12, 26/09/2026) — plus le `n` de la consigne brute.
    //
    // §20 bis (49-U19) — CHAQUE PHRASE SE RÉDIGE SOUS CAPTURE : le formateur
    // déclare la nature et l'objet de chaque chiffre (`THModele.capturer`), et
    // le plan garde les citations à côté du texte (`x.phrases`), pour I26.
    var V = Voix();
    var disposition = r.planInitial.map(function (p) { return p && p.role === 'haut' ? 'haut' : 'ligne'; });
    var capE = V.capturer(function () { return M.enteteDeDisposition(consigne, disposition); });
    var entete = capE.texte, citesJaune = capE.citations;
    // ECRAN §3.12 (68A) — « Aujourd'hui… Si ça passe… » est la phrase de
    // l'en-tête seul : le « Donc » de la feuille « Pourquoi » garde la sienne
    // (`lignesJaunes`, « puis … sur la dernière série »).
    var capD = V.capturer(function () { return M.enteteDeDisposition(consigne, disposition, true); });
    var jauneDonc = capD.texte.jaune, citesDonc = capD.citations;
    var gris = c.libelles ? c.libelles.gris : '';
    // La phrase grise vient de la consigne (`libellesConsigne`, calculée avec
    // elle) : elle se RÉDIGE À NOUVEAU sous capture, et seul un texte
    // identique prête ses citations (sinon I26 le dit).
    // Une consigne que la règle ne sait pas rédiger (forgée) n'a pas de
    // citations : la garde le dira, le plan ne tombe pas.
    var capG = null;
    if (gris) {
      try { capG = V.capturer(function () { return M.libellesConsigne(c.consigne, debut).gris; }); } catch (ex) { capG = null; }
    }
    var citesGris = capG && capG.texte === gris ? capG.citations : null;
    if (consigne.allegee) {
      // « 125 kg × 3 », et en gris « 2 séries au lieu de 4, cette semaine ».
      var capA = V.capturer(function () { return M.phraseAllegee(consigne); });
      entete = { jaune: [capA.texte], segments: entete.segments };
      citesJaune = capA.citations;
      jauneDonc = entete.jaune;
      citesDonc = citesJaune;
      // §9.22 (53-2 bis) — la décharge du programme se nomme : « Semaine de
      // décharge : mêmes charges, moins de séries. 2 séries au lieu de 4, cette semaine. »
      var capDA = V.capturer(function () { return M.grisAllegee(consigne); });
      gris = capDA.texte;
      citesGris = capDA.citations;
    }
    // §14.5 — « On repart de 120 kg, ta dernière charge tenue : … le 3 févr. »
    if (consigne.repli) {
      var capR = V.capturer(function () { return M.phraseRepli(consigne.repli, debut); });
      gris = capR.texte;
      citesGris = capR.citations;
    }
    // §14.7 — « une série de plus, jusqu'à ton prochain progrès », en gris.
    var grisPlus = consigne.serieDePlus ? M.GRIS_SERIE_DE_PLUS : null;
    var donc = jauneDonc.length ? 'Donc ' + jauneDonc.join(', ') + '.' : null;
    var autour = chauffesEtDegressive(r.lignes, series, consigne, materiel || null);
    var capP = V.capturer(function () { return pourquoiDuPlan(consigne, r.lignes, donc); });
    var pourquoi = capP.texte;
    var note = noteDesChauffes(autour.chauffes);
    if (pourquoi && note) pourquoi.chauffes = note;
    // §12.9 (49-U13) — le compteur de stagnation, calculé avec la consigne
    // figée (`consigneDExercice`) ; sa phrase, à 4 séances ou plus, s'écrit en
    // gris dans l'en-tête et en une ligne de la feuille « Pourquoi ».
    var compteur = c.compteur || null;
    // Pendant la semaine allégée, le compteur se tait : rien ne se juge.
    var capK = V.capturer(function () { return compteur && !consigne.allegee ? M.phraseCompteur(compteur) : null; });
    var phraseDuCompteur = capK.texte, citesCompteur = capK.citations;
    var capK0 = capK.texte === undefined ? null : capK.texte;
    // §14.5 (49-U15) — LA MARCHE PARLE À LA PLACE DU COMPTEUR, une seule voix :
    // en sèche, la phrase grise dit qu'il n'y a rien de plus ; la carte de
    // schéma et le repli disent déjà le meilleur ; au silence, la phrase quitte
    // l'en-tête et passe une fois dans le constat.
    if (marche && compteur) {
      if (marche.marche === M.MARCHE_SECHE) {
        capK = V.capturer(function () { return M.phraseSeche(compteur); });
        phraseDuCompteur = capK.texte;
        citesCompteur = capK.citations;
      } else if (marche.marche === M.MARCHE_SILENCE || marche.carte || consigne.repli) phraseDuCompteur = null;
    }
    if (pourquoi && phraseDuCompteur) pourquoi.compteur = phraseDuCompteur;
    // MOTEUR §13.6 (49-U20) — LE FRÈRE QUI PROGRESSE, côte à côte : figé avec
    // la consigne (`c.frere`), dit en gris après le compteur, CHAQUE FOIS QUE
    // LE COMPTEUR PARLE — sa ligne de l'en-tête (sèche comprise), ou la carte
    // de la marche, qui s'ouvre sur le meilleur. Le repli et le silence le
    // taisent avec lui ; la semaine allégée aussi. L'escalier ne le lit pas :
    // sa marche reste proposée (§13.1, ne pas conclure).
    var frere = c.frere || null;
    var compteurParle = capK0 !== null && !(marche && (marche.marche === M.MARCHE_SILENCE || consigne.repli));
    var capFr = V.capturer(function () { return frere && compteurParle ? M.phraseFrere(frere) : null; });
    var phraseDuFrere = capFr.texte, citesFrere = capFr.citations;
    if (pourquoi && phraseDuFrere) pourquoi.frere = phraseDuFrere;
    // ECRAN §3.10 — LES PARAGRAPHES DE LA FEUILLE, ICI (relevé du 01/10, PR 1
    // de la consolidation « un seul coach, un seul câblage »). Ils décrivent la
    // consigne QUE LE PLAN APPLIQUE — figée, allégée, repli, série de plus —,
    // rédigés sous capture (I26) ; l'app ne fait plus que les lire. Une
    // consigne que la feuille ne sait pas rédiger ne fait pas tomber la
    // séance : la feuille garde ses lignes, et I26 le rapporte.
    var capF = null;
    if (pourquoi) {
      try {
        capF = V.capturer(function () {
          return M.pourquoiConsigne(consigne, reglage || 'normal', debut === undefined ? null : debut, { sansDonc: true });
        });
      } catch (ex) {
        pourquoi.indisponible = String((ex && ex.message) || ex);
      }
      if (capF && capF.texte) {
        PARAGRAPHES_DU_POURQUOI.forEach(function (k) { pourquoi[k] = capF.texte[k] === undefined ? null : capF.texte[k]; });
      }
    }
    var capC = V.capturer(function () { return constatDuPlan(r.lignes, consigne, suite, reglage, debut, fini); });
    var constat = capC.texte, citesEscalier = [];
    if (constat && marche && marche.marche === M.MARCHE_SILENCE && marche.declenchement && compteur) {
      var capX = V.capturer(function () { return M.phraseCompteur(compteur); });
      constat.escalier = capX.texte;
      citesEscalier = capX.citations;
    }

    var phrases = [];
    var dire = function (ou, texte, citations) {
      if (texte === null || texte === undefined || texte === '') return;
      phrases.push({ ou: ou, texte: String(texte), citations: citations });
    };
    dire('entete.jaune', entete.jaune.join(', '), citesJaune);
    dire('entete.gris', gris, citesGris);
    dire('entete.compteur', phraseDuCompteur, citesCompteur);
    dire('entete.frere', phraseDuFrere, citesFrere);
    dire('entete.plus', grisPlus, []);
    dire('message', r.message ? r.message.phrase : null, r.citationsMessage);
    dire('donc', donc, citesDonc);
    if (pourquoi) {
      dire('pourquoi', (pourquoi.lignes || []).map(function (l) {
        return [l.texte, l.raison, l.faite].filter(Boolean).join(' · ');
      }).join(' | '), capP.citations);
      if (capF && capF.texte) dire('pourquoi.paragraphes', texteDesParagraphes(capF.texte), capF.citations);
    }
    if (constat) {
      dire('constat', [constat.verdict, constat.suite].filter(Boolean).join(' '), capC.citations);
      dire('constat.escalier', constat.escalier, citesEscalier);
    }
    if (autour.chauffes) dire('chauffes', autour.chauffes.phrase, autour.citations.chauffes || []);
    if (autour.proposition) dire('proposition', autour.proposition.phrase, autour.citations.proposition || []);
    if (autour.degressive) dire('degressive', autour.degressive.phrase, autour.citations.degressive || []);
    if (marche && marche.carte) dire('escalier.carte', marche.carte.phrase, citationsDeCarte(marche.carte));

    preremplir(exo, r.lignes, consigne, { reaction: r.reaction, figees: figees }, precedent);

    return {
      iExo: iExo, slug: base.slug, occurrence: base.occurrence,
      consigne: consigne, contexte: c.contexte || null,
      // I8 (122) — les rangs quittés par des séries faites : aucune ligne non figée ne les porte.
      rangsQuittes: exo && Array.isArray(exo.rangsQuittes) ? exo.rangsQuittes.slice() : [],
      indices: r.indices, rangs: r.rangs, roles: r.roles, figees: figees,
      planInitial: r.planInitial, faites: r.faites, reaction: r.reaction,
      lignes: r.lignes, message: r.message, paris: r.paris,
      constat: constat,
      entete: Object.assign({ jaune: entete.jaune, gris: gris, segments: entete.segments, compteur: phraseDuCompteur, plus: grisPlus },
                            phraseDuFrere ? { frere: phraseDuFrere } : {}),
      // §14.5 (49-U15) — la marche de l'escalier de cet exercice, ou `null` :
      // `{ marche, n, compteur, declenchement, zone, carte?, repli?, reponse? }`.
      escalier: marche || null,
      compteur: compteur ? { compteur: compteur.compteur, meilleur: compteur.meilleur } : null,
      // §13.6 (49-U20) — le frère dit dans l'en-tête, ou `null` : la source de
      // ses deux chiffres pour I26 (`frere.avant`, `frere.maintenant`).
      frere: phraseDuFrere ? { slug: frere.id === undefined ? null : frere.id, nom: frere.nom,
                                avant: frere.avant || null, maintenant: frere.maintenant } : null,
      donc: donc,
      pourquoi: pourquoi,
      materiel: materiel ? materiel.equipement || null : null,
      // §10 bis (108) — la salle de l'exercice, ou `null` : I46 la relit.
      salle: materiel ? materiel.salle || null : (c.salle || null),
      chauffes: autour.chauffes, proposition: autour.proposition, degressive: autour.degressive,
      phrases: phrases
    };
  }

  // ── LE PRÉ-REMPLISSAGE DE CHAQUE LIGNE (relevé du 01/10/2026, PR 3) ──────
  //
  // « Un seul coach, un seul câblage » : la valeur grisée d'une ligne — et donc
  // ce qui s'écrit en base quand on valide un champ vide — se décide ICI, pour
  // TOUTES les lignes. L'app la lit (`l.prerempli`) ; elle fusionnait jusqu'ici
  // deux sources dans `fantomeDe` (la cascade d'avant le plan, et le fantôme
  // du plan), et pouvait les faire diverger.
  //
  // L'ordre, inchangé :
  //   · une ligne COUVERTE : la charge et les reps du plan (`l.fantome`) ;
  //   · une CHAUFFE que le coach remplit : sa charge ; les reps de la routine
  //     (MOTEUR §9.15 : de la structure) ;
  //   · une DÉGRESSIVE que le coach remplit : sa charge, et les reps DU COACH
  //     — le milieu de « Vise… » (MOTEUR §9.15.3, delta 49-38 : la phrase et la
  //     ligne disent le même chiffre), jamais la routine ni la fois d'avant ;
  //   · toute autre ligne : la cascade d'avant le plan (`Seance.fantome` : ce
  //     qu'on vient de taper, la grille de la réaction, la fois d'avant, la
  //     routine) ;
  //   · la durée et la distance, qu'aucune consigne ne porte : la cascade.
  // `precedent` : la dernière séance de l'exercice (`Seance.precedent`), une
  // ENTRÉE (`entrees.precedents`) — le plan n'a pas l'historique.
  function preremplir(exo, lignes, consigne, r, precedent) {
    var S = Seance();
    var series = (exo && exo.series) || [];
    var seule = { exercices: [exo] };
    var grille = consigne && r ? S.planDe(series, consigne, r.reaction ? r.reaction.plan : null, r.figees || null) : null;
    (lignes || []).forEach(function (l, i) {
      var cascade = S.fantome(seule, 0, i, precedent || null, grille);
      var f = l.fantome;
      var p = { charge_kg: cascade.charge_kg, reps: cascade.reps, duree_s: cascade.duree_s, distance_m: cascade.distance_m };
      if (f && f.source === 'chauffe') {
        p.charge_kg = f.charge === undefined ? null : f.charge;
        // §9.15.5 (94) — sans reps à la routine, celles de la règle.
        if (f.reps !== null && f.reps !== undefined) p.reps = f.reps;
      } else if (f && f.source === 'degressive') {
        p.charge_kg = f.charge === undefined ? null : f.charge;
        p.reps = repsDeLaDegressive(l.degressive);
      } else if (consigne && l.role !== 'hors' && f) {
        p.charge_kg = f.charge === undefined ? null : f.charge;
        p.reps = f.reps === undefined ? null : f.reps;
      }
      // §9.17 — AU POIDS DU CORPS, LA LIGNE VAUT 0 ET LA SÉRIE N'A PAS DE CHARGE :
      // ce que le plan grise puis écrit à la validation n'est jamais un « 0 kg »
      // sur un exercice en `reps` (une planche à 0 kg, la même famille de défaut).
      if (estPoidsDuCorps(consigne)) p.charge_kg = null;
      l.prerempli = p;
    });
  }

  // MOTEUR §9.15.3 (delta 49-38) — les reps de la dégressive : le MILIEU de
  // la fourchette que sa phrase annonce (« Vise 6 à 8 » → 7). Sans fourchette
  // (à la barre : pas de dégressive), rien.
  function repsDeLaDegressive(d) {
    var v = d && Array.isArray(d.vise) && d.vise.length === 2 ? d.vise : null;
    if (!v || nombre(v[0]) === null || nombre(v[1]) === null) return null;
    return Math.round((nombre(v[0]) + nombre(v[1])) / 2);
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
      ? prec.series.filter(function (s) { return Voix().estTravail(s); }).length : 0;
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
      // 119 (E6) — la mesure, pour que `chauffesEtDegressive` se taise sur une mesure sans charge.
      mesure: cat.mesure || null,
      sol: Moteur().SOULEVES_AU_SOL.indexOf(slug) >= 0,
      deja_sollicite: deja,
      pas: pas,
      refus: !!(refus && refus[slug]),
      // §10 bis (108) — la salle déclarée pour cet exercice (`THProfil.
      // salleDeLExercice`, résolue par l'app au catalogue), ou `null`.
      salle: cat.salle || null
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
  // 124 (audit du 16/10/2026, 01 #14) — les phases et leur défaut sont ceux du profil (`THProfil.phaseDe`,
  // `PHASES_EN_BASE`), lus à l'appel : une liste, pas trois.
  function phasesDuPlan() { return racine.THProfil.PHASES_EN_BASE; }
  function phaseDuPlan(v) { return racine.THProfil.phaseDe({ phase: v }); }

  // MOTEUR §9.16 (60-2b) — les objectifs qu'un pari peut porter. Vide ou inconnu :
  // `null`, SANS défaut — contrairement à la phase, « sans réponse » est une réponse.
  var OBJECTIFS_DU_PLAN = ['force', 'muscle', 'les_deux', 'forme'];
  function objectifDuPlan(v) { return OBJECTIFS_DU_PLAN.indexOf(v) >= 0 ? v : null; }

  // MOTEUR §14.6 (60-2b) — les priorités du questionnaire (`profiles.priorites` :
  // des slugs d'exercice ET des clés de zone), GELÉES pour la séance avec la phase.
  // Le champ vient de la base : `null` (jamais répondu), `[]` (« Pas de priorité »)
  // et tout ce qui n'est pas une liste de chaînes valent la même chose — aucune.
  function prioritesDuPlan(v) {
    return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
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
  //     séries de travail de l'exercice sont faites : le constat en a besoin ;
  //   · `catalogue` — `{ [slug]: { equipement, muscles_primaires } }`, les
  //     exercices de la séance lus au catalogue (§9.15, 49-U10) ;
  //   · `refusChauffes` — `{ [slug]: true }` : la proposition de chauffes est
  //     retirée (« Non merci » dans la séance, ou trois refus d'affilée) ;
  //   · `phase` — la phase GELÉE de la séance (MOTEUR §9.16, 49-U11), lue dans
  //     le profil par l'app quand la consigne se fige ; vide = `maintien` ;
  //   · `objectif` — l'objectif GELÉ de la séance (MOTEUR §9.16, 60-2b, I40), lu
  //     avec la phase ; `force`, `muscle`, `les_deux`, `forme`, ou `null` (vide ou
  //     inconnu : pas de défaut). Il ne change AUCUNE consigne : il n'entre que dans
  //     le fondement des paris ;
  //   · `priorites` — MOTEUR §14.6 (60-2b) : les priorités du questionnaire,
  //     GELÉES pour la séance avec la phase (des slugs d'exercice et des clés de
  //     zone ; `null`, `[]` ou toute valeur étrangère : aucune). Un muscle dont la
  //     zone y figure a de la place jusqu'à son plus haut volume — hors sèche ;
  //   · `volume` — MOTEUR §14.6 (49-U16) : `{ [muscle]: { place, moyenne,
  //     seuil, max, fenetres } | null }`, la règle de volume calculée UNE FOIS par
  //     séance sur tout l'historique (`Moteur.placeDeVolume`) ; facultatif.
  //
  // Pure : mêmes entrées, même plan ; les entrées ne sont jamais modifiées.
  function planDeSeance(entrees) {
    var e = entrees || {};
    var seance = e.seance || {};
    var consignes = e.consignes || {};
    var exos = seance.exercices || [];
    var phase = phaseDuPlan(e.phase);
    var objectif = objectifDuPlan(e.objectif);
    var priorites = prioritesDuPlan(e.priorites);
    // §9.17 (50-1) — CE QUE LE PLAN PORTE, pour qu'I13 et I28 à I31 se vérifient
    // sur lui seul : la mesure de chaque exercice (`catalogue`), son mode
    // (`modes`, l'historique `modes_exercice` lu par l'app), l'intention qui en
    // résulte avec celle du profil, et la réponse à la carte du lest. Le plan
    // ne décide rien de nouveau : il recopie ce qu'il a reçu, et le dit.
    var intentionProfil = Moteur().coachSeTait(e.intention) ? 'entretien' : 'progresser';
    var modes = e.modes || {};
    var lestReponse = e.lestReponse === 'oui' || e.lestReponse === 'non' ? e.lestReponse : null;
    var carteLestPosee = false;
    // 60-1 (QUESTIONNAIRE-COACH-V2 §4) — « JUSTE UN CARNET » : en Entretenir
    // (le profil), aucun bandeau de décharge planifiée, aucune fenêtre de
    // semaine allégée, aucune carte. Le coach ne dit rien, il ne propose rien ;
    // la séance reste celle que la personne a posée. I13 le garde.
    var esc = intentionProfil === 'entretien' ? { allegee: null, carte: null } : escalierDuPlan(e, seance, consignes);
    var seriesRoutine = (e.escalier && e.escalier.seriesRoutine) || {};
    // §14 (111) — le DÉBUTANT (« moins d'un an », `Profil.estDebutant`), gelé
    // pour la séance par l'app : la dégressive proposée ne lui est jamais faite.
    var debutant = e.debutant === true;
    var isoles = marchesIsolees(e, seance, consignes, esc, phase, intentionProfil);
    // PR 3 (relevé du 01/10) — la dernière séance de chaque exercice, pour le
    // pré-remplissage des lignes que le plan ne couvre pas.
    var precedents = e.precedents || {};
    var plus = seriesDePlusActives(e, seance, consignes, esc, phase);
    var degPlus = degressivesActives(e, seance, consignes, esc, phase, intentionProfil);
    // Une marche par EXERCICE (I21) : un exercice présent deux fois dans la
    // séance ne la porte que sur sa première occurrence ; le repli, lui, est la
    // consigne de l'exercice — les deux occurrences la lisent.
    var portee = {};
    return {
      seance: seance.id === undefined ? null : seance.id,
      phase: phase,
      objectif: objectif,
      priorites: priorites,
      // §9.17 — l'Édition d'une séance passée, l'intention du profil et la
      // réponse du lest : trois faits que les invariants relisent (I13, I29).
      edition: !!seance.edition,
      intention: intentionProfil,
      debutant: debutant,
      lestReponse: lestReponse,
      allegee: esc.allegee,
      carte: esc.carte,
      // §9.22 (53-2) — les exercices d'un bloc en cours ce jour-là (I39).
      programme: { enBloc: enBlocDuJour(e, seance) },
      exercices: questionsDuPlan(exos.map(function (exo, i) {
        var slug = exo && exo.exercise_slug;
        // Prérequis d'« adapter » — LE COACH SUIT UNE OCCURRENCE de l'exercice
        // dans la séance (`THSeance.occurrenceCoachee` : la première, ou celle
        // qui porte déjà ses paris) ; les autres sont libres : ni ligne du
        // coach, ni pari, ni message (elles comptent pour le volume et
        // l'historique, comme d'habitude). Et chacune ne lit que SES paris.
        var coachee = Seance().occurrenceCoachee(seance, slug, e.paris || []) === i;
        // §9.20 (51-3) — « J'AI MAL » : une occurrence marquée est SANS COACH
        // pour la séance, comme en Entretenir (I33) — ni ligne du coach, ni
        // pari, ni message pour ses lignes restantes. Les paris déjà écrits
        // restent en base ; le plan n'en écrit plus.
        var douloureuse = Seance().occurrenceDouloureuse(exo);
        var c = coachee && !douloureuse && Object.prototype.hasOwnProperty.call(consignes, slug) ? consignes[slug] : null;
        // §9.20 — LA REPRISE CHOISIE dans cette séance (`seance.reprises`, le
        // brouillon) : « Plus léger, plus de reps » applique le REPLI figé au
        // choix — celui de §14.5, sinon celui de la reprise longue (§9.9, 51-3
        // bis) — sur la consigne de la zone corrigée (`consignePlusLegere`).
        // Aucune autre charge.
        var choixReprise = seance.reprises && Object.prototype.hasOwnProperty.call(seance.reprises, slug)
          ? seance.reprises[slug] : null;
        if (c && c.consigne && choixReprise && choixReprise.choix === 'leger' && choixReprise.repli) {
          c = Object.assign({}, c, { consigne: Moteur().consignePlusLegere(c.consigne, choixReprise.repli) });
        }
        var suites = e.suites || {};
        var suite = Object.prototype.hasOwnProperty.call(suites, slug) ? suites[slug] : null;
        var m = coachee && Object.prototype.hasOwnProperty.call(isoles, slug) ? isoles[slug] : null;
        if (m && portee[slug]) m = m.repli ? { marche: m.marche, repli: m.repli, copie: true } : null;
        if (m) portee[slug] = true;
        // 60-1 — « JUSTE UN CARNET » : un exercice en Entretenir (le profil, ou
        // son propre mode) n'a ni chauffes calculées ni dégressive proposée. Sans
        // matériel, `chauffesEtDegressive` se tait : une seule porte, ici.
        var modeX = Object.prototype.hasOwnProperty.call(modes, slug) && modes[slug] ? modes[slug] : null;
        var intentionX = Moteur().intentionDe(intentionProfil, modeX);
        var x = planDExercice(exo, i, c, Seance().parisDeLOccurrence(e.paris || [], seance, i), seance.id, e.reglage, suite, seance.debut,
          intentionX === 'entretien' ? null : materielDe(exos, i, e.catalogue || null, c, e.refusChauffes || {}), phase,
          esc.allegee ? { decharge: esc.allegee.source === SOURCE_DECHARGE } : null, Object.prototype.hasOwnProperty.call(seriesRoutine, slug) ? seriesRoutine[slug] : null, m,
          Object.prototype.hasOwnProperty.call(plus, slug) ? plus[slug] : null,
          Seance().exerciceFini(seance, slug),
          Object.prototype.hasOwnProperty.call(precedents, slug) ? precedents[slug] : null, objectif);
        if (x.escalier && x.escalier.copie) x.escalier = null;
        // MOTEUR §14.6 (49-U16) — LA PLACE POUR UNE SÉRIE DE PLUS : de la place
        // sur CHACUN des muscles primaires de l'exercice (catalogue), lue dans
        // `entrees.volume`. Un fait, rien d'affiché : la série de plus (PR 2c)
        // le lira. `null` sans entrée de volume.
        x.placeSerieDePlus = placeDeLExercice(e, slug, phase);
        // §14 (111) — ce que la dégressive proposée lit, porté pour I48 : la
        // classe de l'exercice (`null` hors catalogue), la ligne dégressive de
        // la routine (figée à l'ouverture), la dégressive en cours.
        x.polyarticulaire = polyarticulaireDe(e, slug);
        x.degressiveRoutine = degressiveDeLaRoutine(e, seance, slug);
        x.degressiveEnCours = !!(c && c.consigne && Object.prototype.hasOwnProperty.call(degPlus, slug));
        var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
        x.mesure = cat && cat.mesure !== undefined ? cat.mesure : null;
        x.mode = modeX;
        x.intention = intentionX;
        // §9.17 — LA CARTE DU LEST : UNE SEULE, en tête de l'exercice (le composant
        // des propositions d'exercice). Quand le moteur la dit (`carte_lest`) et
        // qu'aucune autre carte du lest n'est déjà posée dans la séance : deux
        // exercices au haut en même temps ne posent pas deux fois la même
        // question — le second tient sa ligne jusqu'à la réponse, qui est celle
        // du profil. Jamais pendant une semaine allégée (rien ne monte, I19).
        // §9.20 — la marque, et la carte de reprise : UNE, en tête de
        // l'exercice coaché, quand sa dernière séance porte la marque (la
        // consigne le dit, `c.reprise`) et tant qu'aucun choix n'est fait dans
        // cette séance. Jamais en Édition.
        x.douleur = douloureuse;
        x.carteReprise = null;
        if (c && c.reprise && c.reprise.douleur === true && !choixReprise && !seance.edition && x.consigne) {
          var M3 = Moteur(), V3 = Voix();
          var nomR = cat && cat.nom ? cat.nom : slug;
          // « Comme avant » cite la ligne du jour : elle se vérifie comme toute
          // phrase du coach (I26). « Plus léger » est le libellé d'un CHOIX —
          // sa ligne n'est pas celle du jour tant qu'on ne l'a pas choisie ;
          // une fois choisie, I22 et I35 vérifient la charge du repli.
          var capAv = V3.capturer(function () { return M3.texteRepriseAvant(x.consigne); });
          var textesR = M3.carteRepriseTextes(nomR, x.consigne, c.reprise);
          x.carteReprise = { titre: textesR.titre, phrase: textesR.phrase, choix: textesR.choix,
                             zone: c.reprise.zone, repli: c.reprise.repli || null };
          x.phrases.push({ ou: 'reprise.avant', texte: capAv.texte, citations: capAv.citations });
        }
        x.carteLest = null;
        var kl = x.consigne;
        var fl = kl && kl.fondement ? kl.fondement.carteLest : null;
        if (!carteLestPosee && fl && kl.etat === 'carte_lest' && !kl.allegee) {
          carteLestPosee = true;
          var M2 = Moteur(), V2 = Voix();
          var entreeLest = { niveau: Math.min.apply(null, fl.niveaux), bas: fl.bas };
          var capLT = V2.capturer(function () { return M2.carteLestTitre(entreeLest); });
          var capLD = V2.capturer(function () { return M2.carteLestDetail(entreeLest); });
          x.carteLest = { titre: capLT.texte, detail: capLD.texte, oui: M2.OUI_LEST, non: M2.NON_LEST,
                          niveaux: fl.niveaux.slice(), bas: fl.bas, haut: fl.haut,
                          leste: cat && cat.leste ? cat.leste : null };
          // §20 bis — le titre et le détail se vérifient comme toute phrase du coach.
          x.phrases.push({ ou: 'lest.titre', texte: capLT.texte, citations: capLT.citations });
          x.phrases.push({ ou: 'lest.detail', texte: capLD.texte, citations: capLD.citations });
        }
        return x;
      }), e.reserve, seance)
    };
  }

  // ── MOTEUR §17.2 bis (78) — LA QUESTION DE RÉSERVE ─────────────────────────
  //
  // « Il t'en restait combien ? », sur la DERNIÈRE SÉRIE DE TRAVAIL d'un exercice qui a un pari ce jour-là. La
  // règle est celle de `THReserve.questionsDeReserve` ; le plan la porte : `x.questionReserve` (`null`, `calage`,
  // `ecart` ou `rappel`) et `x.serieReserve` (l'indice de la série visée, ou `null`). L'écran la lit.
  //
  // Un exercice A UN PARI quand sa consigne parle (pas `silence`) et qu'au moins une de ses lignes est couverte :
  // ce sont les lignes qui écrivent un pari (`ROLE_DU_PARI`). Sans coach, en Entretenir, « J'ai mal », une seconde
  // occurrence : pas de pari, pas de question.
  //
  // `reserve` : `{ lancement, passes: { [slug]: passe } }`, FIGÉ POUR LA SÉANCE par l'app (`passeDeReserve`, sur
  // les séances d'avant) ; absent (le simulateur, les tests du plan), aucune question. Le jour est celui du début
  // de la séance. Jamais en Édition : on ne demande pas à chaud ce qui a été fait avant-hier.
  function aUnPari(x) {
    return !!(x && x.consigne && x.consigne.etat !== 'silence' &&
      (x.lignes || []).some(function (l) { return l && Object.prototype.hasOwnProperty.call(ROLE_DU_PARI, l.role); }));
  }

  function derniereSerieDeTravail(exo) {
    var series = (exo && exo.series) || [];
    for (var j = series.length - 1; j >= 0; j--) {
      if (racine.THModele.estTravail(series[j])) return j;
    }
    return null;
  }

  function questionsDuPlan(xs, reserve, seance) {
    var jour = reserve && !seance.edition ? Moteur().jourCivil(seance.debut) : null;
    var exos = seance.exercices || [];
    var questions = {};
    if (jour) {
      var passes = reserve.passes || {};
      var entree = { lancement: reserve.lancement, jour: jour, exercices: xs.map(function (x, i) {
        var pari = aUnPari(x) && derniereSerieDeTravail(exos[i]) !== null;
        return { slug: String(i), pari: pari,
                 passe: pari && Object.prototype.hasOwnProperty.call(passes, x.slug) ? passes[x.slug] : [] };
      }) };
      racine.THReserve.questionsDeReserve(entree).forEach(function (q) { questions[q.slug] = q.motif; });
    }
    xs.forEach(function (x, i) {
      var motif = Object.prototype.hasOwnProperty.call(questions, String(i)) ? questions[String(i)] : null;
      x.questionReserve = motif;
      x.serieReserve = motif ? derniereSerieDeTravail(exos[i]) : null;
    });
    return xs;
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

  // `iExo` (facultatif) : le seul exercice à alléger — celui qu'on vient
  // d'ajouter en pleine semaine allégée (consolidation 4/7). Sans lui, tous.
  function lignesARetirer(plan, iExo) {
    var sortie = [];
    if (!plan || !plan.allegee) return sortie;
    (plan.exercices || []).forEach(function (x) {
      if (!x || !x.consigne || !x.consigne.allegee) return;
      if (typeof iExo === 'number' && x.iExo !== iExo) return;
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
      // §10 bis (113, révisé le 16/10/2026) — AU PLAFOND DE SA SALLE, l'exercice ne déclenche pas la semaine allégée :
      // son pari (« le déclencheur progresse avant son prochain déclenchement ») parierait sur ce que la salle
      // empêche ; l'escalier du plafond lui propose ses marches. Son compteur compte pour les autres : un fait.
      if (auPlafond(c)) return;
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
  // §20 bis (49-U19) — les citations de la carte d'une marche, à côté d'elle
  // (une carte est une donnée de l'escalier : elle ne porte pas de champ de
  // plus). Une table faible : la carte morte, ses citations partent avec elle.
  var CITATIONS_DES_CARTES = typeof WeakMap === 'function' ? new WeakMap() : null;
  function retenirCitationsDeCarte(carte, citations) {
    if (CITATIONS_DES_CARTES && carte && typeof carte === 'object') CITATIONS_DES_CARTES.set(carte, citations);
  }
  function citationsDeCarte(carte) {
    return CITATIONS_DES_CARTES && carte && typeof carte === 'object' && CITATIONS_DES_CARTES.has(carte)
      ? CITATIONS_DES_CARTES.get(carte) : null;
  }

  // §10 bis (113, 16/10/2026) — l'exercice est-il AU PLAFOND de sa salle (la plus lourde, au haut de la
  // fourchette) ? La définition du moteur, sur la consigne figée et la salle déclarée (`c.salle`, figée avec elle) —
  // une lecture, jamais une seconde règle. À la plus lourde SOUS le plafond, l'escalier ordinaire (§14.5).
  function auPlafond(c) {
    return !!(c && c.consigne && c.salle && Moteur().auPlafondDeLaSalle(c.consigne, c.salle));
  }

  function marchesIsolees(e, seance, consignes, esc, phase, intentionProfil) {
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
    var enBloc = M.exercicesEnBloc(blocsDuProgramme(e), jour);
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
      // §10 bis (113, 16/10/2026) — AU PLAFOND DE SA SALLE : l'escalier du plafond (la série de plus, la dégressive,
      // un frère plus chargeable, puis le maintien) ; jamais le schéma ni le repli — c'est la salle qui bloque.
      if (auPlafond(c)) {
        var mp = marcheDuPlafond(e, seance, slug, c, zone, phase, esc, intentionProfil, jour, marches, compteurs, cartes);
        if (mp) sortie[slug] = mp;
        return;
      }
      var n = M.nIsole(k, M.declenchementsRepondus(slug, jour, k, cartes, compteurs));
      // §14.7 (49-U17) — la place sur chacun des muscles primaires (§14.6), et
      // une série de plus déjà proposée depuis le dernier progrès.
      var place = placeDeLExercice(e, slug, phase);
      var proposee = M.serieDePlusProposee(slug, jour, k, marches, compteurs);
      // §14 (111) — la dégressive proposée : ses conditions, une dégressive
      // déjà proposée depuis le dernier progrès, et répondue dans cette séance.
      var deg = {
        possible: M.degressivePossible(conditionsDegressive(e, seance, slug, zone, phase, esc, intentionProfil)),
        proposee: M.degressiveProposee(slug, jour, k, marches, compteurs),
        ici: marches.some(function (x) {
          return x && x.seance === seance.id && x.exercice === slug && x.marche === M.MARCHE_DEGRESSIVE;
        })
      };
      var marche = M.marcheIsolee(n, zone, phase, place, proposee, c.consigne.palier, deg);
      if (!marche) return;
      // §9.22 (53-2, I39) — « CHANGER DE SCHÉMA » SE TAIT pour un exercice d'un
      // bloc en cours : le bloc fixe déjà son schéma. Le repli et la série de
      // plus restent.
      if (marche === M.MARCHE_SCHEMA && enBloc[slug]) marche = M.MARCHE_SILENCE;
      var declenche = M.estDeclenchement(k);
      if (!declenche && marche !== M.MARCHE_SILENCE) return;
      var m = { marche: marche, n: n, compteur: k, declenchement: declenche, zone: zone === undefined ? null : zone };
      if (marche === M.MARCHE_REPLI) {
        // Repli sauté (aucun palier ne remplit les cinq conditions) : le silence.
        if (c.repli) m.repli = c.repli;
        else { m.marche = M.MARCHE_SILENCE; m.saute = true; }
      }
      // §14 (111) — I48 relit sur la marche qu'une série de plus a précédé la dégressive.
      if (marche === M.MARCHE_DEGRESSIVE) m.serieDePlusProposee = proposee;
      if (marche === M.MARCHE_SCHEMA || marche === M.MARCHE_SERIE_DE_PLUS || marche === M.MARCHE_DEGRESSIVE) {
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
          var capCarte = Voix().capturer(function () {
            if (marche === M.MARCHE_DEGRESSIVE) return M.carteDegressive(c.compteur.meilleur, k);
            return marche === M.MARCHE_SCHEMA
              ? M.carteSchema(zone, c.compteur.meilleur, k, avancent)
              : M.carteSerieDePlus(c.compteur.meilleur, k, avancent, musclesPrimaires(e, slug),
                  musclesParPriorite(e, slug, phase));
          });
          m.carte = capCarte.texte;
          if (!m.carte) return;
          retenirCitationsDeCarte(m.carte, capCarte.citations);
        }
      }
      sortie[slug] = m;
    });
    return sortie;
  }

  // §10 bis (113, décidé le 16/10/2026) — L'ESCALIER AU PLAFOND DE LA SALLE. Une marche par déclenchement, dans cet
  // ordre : la série de plus (si la règle de volume du §14.6 laisse de la place, hors sèche, hors zone force — §14.7),
  // la dégressive (aux conditions du §14.8), un frère plus chargeable dans la salle déclarée (le remplacement) ; une
  // marche sans objet est sautée ; au-delà, le coach maintient (`null`). Jamais le schéma ni le repli. Les objets se
  // lisent sur les entrées gelées ; l'ordre et la mémoire, `Moteur.marcheAuPlafond`. La marche porte ce qu'I47 relit :
  // le plafond, les marches déjà proposées et leurs objets, le remplaçant.
  function marcheDuPlafond(e, seance, slug, c, zone, phase, esc, intentionProfil, jour, marches, compteurs, cartes) {
    var M = Moteur();
    var k = c.compteur.compteur;
    var plafond = M.plafondDeLaConsigne(c.consigne, c.salle);
    if (!plafond || !M.estDeclenchement(k)) return null;
    var proposees = {};
    M.MARCHES_PLAFOND.forEach(function (mk) {
      proposees[mk] = marches.filter(function (x) {
        return x && x.seance === seance.id && x.exercice === slug && x.marche === mk;
      })[0] || M.marcheProposee(slug, jour, k, marches, compteurs, mk);
    });
    var palier = Number(c.consigne.palier);
    var charge = isFinite(palier) && palier > 0;
    var remplacant = M.remplacantAuPlafond(remplacantsDe(e, slug), plafond.charge);
    var objets = {};
    objets[M.MARCHE_SERIE_DE_PLUS] = charge && zone !== 'lourd' && zone !== 'mix' && !!zone && phase !== 'seche' &&
      placeDeLExercice(e, slug, phase) === true;
    objets[M.MARCHE_DEGRESSIVE] = charge &&
      M.degressivePossible(conditionsDegressive(e, seance, slug, zone, phase, esc, intentionProfil));
    objets[M.MARCHE_REMPLACEMENT] = remplacant !== null;
    var choix = M.marcheAuPlafond(k, proposees, objets);
    if (!choix) return null;
    var dejaVues = {};
    M.MARCHES_PLAFOND.forEach(function (mk) { dejaVues[mk] = !!proposees[mk]; });
    var m = { marche: choix.marche, n: M.nIsole(k, M.declenchementsRepondus(slug, jour, k, cartes, compteurs)),
              compteur: k, declenchement: true, zone: zone === undefined ? null : zone,
              plafond: { charge: plafond.charge, reps: plafond.reps }, objets: objets, proposees: dejaVues };
    if (choix.deja) {
      m.reponse = choix.deja.reponse;
      return m;
    }
    if (choix.marche === M.MARCHE_REMPLACEMENT) {
      m.remplacant = { slug: remplacant.slug, nom: remplacant.nom || remplacant.slug, mesure: remplacant.mesure,
                       salle: remplacant.salle || null };
    }
    // Le détail du remplacement se rédige HORS de la capture : il ne cite rien du plan.
    var detail = choix.marche === M.MARCHE_REMPLACEMENT ? M.detailRemplacement(m.remplacant) : null;
    var capCarte = Voix().capturer(function () {
      return M.cartePlafond(choix.marche, c.compteur.meilleur, k, {
        muscles: musclesPrimaires(e, slug), parPriorite: musclesParPriorite(e, slug, phase),
        remplacant: m.remplacant || null, detail: detail });
    });
    m.carte = capCarte.texte;
    if (!m.carte) return null;
    retenirCitationsDeCarte(m.carte, capCarte.citations);
    return m;
  }

  // Les frères proposables de l'exercice, dans l'ordre de « Remplacer », donnés par l'app (`escalier.remplacants`) :
  // `[{ slug, nom, mesure, salle, ecarte, hors, deja }]`. Sans l'entrée : aucun.
  function remplacantsDe(e, slug) {
    var r = e.escalier && e.escalier.remplacants;
    return r && Object.prototype.hasOwnProperty.call(r, slug) && Array.isArray(r[slug]) ? r[slug] : [];
  }

  // §14 (111) — LA DÉGRESSIVE PROPOSÉE : les conditions de l'exercice, lues
  // sur les entrées gelées de la séance. `Moteur.degressivePossible` décide.
  function conditionsDegressive(e, seance, slug, zone, phase, esc, intentionProfil) {
    var modes = e.modes || {};
    var modeX = Object.prototype.hasOwnProperty.call(modes, slug) && modes[slug] ? modes[slug] : null;
    return {
      polyarticulaire: polyarticulaireDe(e, slug),
      zone: zone, phase: phase,
      allegee: !!(esc && esc.allegee),
      entretien: Moteur().intentionDe(intentionProfil || 'progresser', modeX) === 'entretien',
      debutant: e.debutant === true,
      aUneDegressive: degressiveDeLaRoutine(e, seance, slug)
    };
  }

  // La classe de l'exercice au catalogue : `Moteur.estPolyarticulaire` (au
  // moins 3 muscles principaux, secondaires et stabilisateurs — la définition
  // de la salle, du raccourci, du générateur). `null` hors catalogue : ni
  // isolation ni polyarticulaire, aucune dégressive proposée.
  function polyarticulaireDe(e, slug) {
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    if (!cat) return null;
    return Moteur().estPolyarticulaire({ prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [],
                                         stab: cat.muscles_stabilisateurs || [] });
  }

  // La routine (ou la saisie) a-t-elle déjà une ligne dégressive sur
  // l'exercice ? FIGÉ À L'OUVERTURE par l'app (`escalier.degressivesRoutine`,
  // avec la consigne) : la ligne qu'ajoute « Ajouter une dégressive » ne
  // change pas la marche en pleine séance. Sans l'entrée (les tests du plan),
  // les lignes de la séance.
  function degressiveDeLaRoutine(e, seance, slug) {
    var d = e.escalier && e.escalier.degressivesRoutine;
    if (d && Object.prototype.hasOwnProperty.call(d, slug)) return d[slug] === true;
    return ((seance && seance.exercices) || []).some(function (x) {
      return x && x.exercise_slug === slug && (x.series || []).some(function (r) { return r && r.type_serie === 'degressive'; });
    });
  }

  // §14 (111) — LES DÉGRESSIVES EN COURS : acceptées, pas de progrès depuis, et
  // les conditions toujours réunies (sauf la ligne : c'est elle qu'on ajoute).
  // Rend `{ [slug]: true }`.
  function degressivesActives(e, seance, consignes, esc, phase, intentionProfil) {
    var sortie = {};
    var E = e.escalier;
    if (!E || seance.edition || esc.allegee) return sortie;
    var M = Moteur();
    var jour = M.jourCivil(seance.debut);
    if (!jour) return sortie;
    Object.keys(consignes).forEach(function (slug) {
      var c = consignes[slug];
      if (!c || !c.consigne || !c.compteur || typeof c.compteur.compteur !== 'number') return;
      var cond = conditionsDegressive(e, seance, slug, c.consigne.zone, phase, esc, intentionProfil);
      cond.aUneDegressive = false;
      if (!M.degressivePossible(cond)) return;
      if (!M.degressiveActive(slug, jour, c.compteur.compteur, E.marches || [], E.compteurs || [])) return;
      sortie[slug] = true;
    });
    return sortie;
  }

  // §14 (111) — LA LIGNE DÉGRESSIVE À CRÉER : un exercice dont la dégressive
  // proposée est en cours et qui n'a aucune ligne dégressive. Rend `[iExo]`.
  // Pur ; l'app l'applique à l'acceptation et à la création d'une séance,
  // jamais au rendu : une ligne retirée par la personne ne revient pas (§14.3).
  function degressivesAAjouter(plan) {
    var sortie = [];
    ((plan && plan.exercices) || []).forEach(function (x) {
      if (!x || !x.degressiveEnCours) return;
      if ((x.lignes || []).some(function (l) { return l.type === 'degressive'; })) return;
      sortie.push(x.iExo);
    });
    return sortie;
  }

  // §14.6, §14.7 — la place pour une série de plus sur CHACUN des muscles
  // primaires de l'exercice (catalogue), lue dans `entrees.volume` ; `null`
  // sans entrée de volume. Un muscle PRIORITAIRE (60-2b) a de la place jusqu'à
  // son plus haut volume (`Moteur.placePourExercice`).
  function placeDeLExercice(e, slug, phase) {
    if (!e.volume) return null;
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    return Moteur().placePourExercice(e.volume, cat ? cat.muscles_primaires : null,
      musclesPrioritairesDe(e, slug, phase));
  }

  // 60-2b — LES MUSCLES PRIORITAIRES d'un exercice : ceux de ses muscles
  // primaires dont la ZONE (`THSemaine.zoneDuMuscle`, la seule table muscle →
  // zone) est dans les priorités gelées de la séance. EN SÈCHE, aucun : la série
  // de plus n'y est jamais proposée (§9.16), et rien ne change.
  function musclesPrioritairesDe(e, slug, phase) {
    if (phase === 'seche') return [];
    var prio = prioritesDuPlan(e.priorites);
    var Sm = Semaine();
    if (!prio.length || !Sm || !Sm.zoneDuMuscle) return [];
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    return ((cat && cat.muscles_primaires) || []).filter(function (m) {
      var z = Sm.zoneDuMuscle(m);
      return !!z && prio.indexOf(z.cle) >= 0;
    });
  }

  // 60-2b — les muscles de l'exercice (avec leur nom au catalogue) dont la
  // place ne vient QUE de la priorité : la carte le dit à sa façon.
  function musclesParPriorite(e, slug, phase) {
    if (!e.volume) return [];
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    var cles = Moteur().musclesParPriorite(e.volume, cat ? cat.muscles_primaires : null,
      musclesPrioritairesDe(e, slug, phase));
    return musclesPrimaires(e, slug).filter(function (m) { return cles.indexOf(m.cle) >= 0; });
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
      if (M.estZoneForce(c.consigne.zone) || !c.consigne.zone) return;
      // §10 bis (113, 16/10/2026) — au plafond de la salle, la série de plus est la première marche : acceptée, elle
      // revient comme ailleurs, jusqu'au prochain progrès.
      if (!M.serieDePlusActive(slug, jour, c.compteur.compteur, E.marches || [], E.compteurs || [])) return;
      var n = Object.prototype.hasOwnProperty.call(routine, slug) ? Number(routine[slug]) : NaN;
      if (isFinite(n) && n >= 1) sortie[slug] = n;
    });
    return sortie;
  }

  // §9.22 (53-2) — les blocs du programme (la table `blocs`, lue par l'app) et
  // les derniers jours des semaines allégées acceptées.
  var SOURCE_DECHARGE = 'decharge_planifiee';
  function enBlocDuJour(e, seance) {
    var M = Moteur();
    var jour = M.jourCivil(seance && seance.debut);
    return jour ? M.exercicesEnBloc(blocsDuProgramme(e), jour) : {};
  }
  function blocsDuProgramme(e) { return (e && e.programme && e.programme.blocs) || []; }
  function finsAllegees(cartes) {
    return (cartes || []).filter(function (c) { return c && c.reponse === 'acceptee' && c.fin; })
      .map(function (c) { return c.fin; });
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
    // §9.22 (53-2) — LA DÉCHARGE PLANIFIÉE : la semaine allégée, posée par le
    // programme, SANS CARTE (un bandeau). Elle saute si une semaine allégée
    // s'est terminée moins de 14 jours avant (pas de cumul, I38).
    var blocs = blocsDuProgramme(e);
    var dp = M.dechargeDuJour(blocs, jour, finsAllegees(cartes));
    if (dp) {
      return { allegee: { debut: dp.debut, fin: dp.fin, bandeau: M.bandeauDecharge(dp.semaine, dp.semaines),
                          source: SOURCE_DECHARGE, semaine: dp.semaine, semaines: dp.semaines, bloc: dp.bloc },
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
    if (!b || !M.carteAutorisee(b.declencheur, jour, cartes, esc.compteurs || [], blocs)) return vide;
    var nom = function (s) { return esc.noms && esc.noms[s] ? esc.noms[s] : s; };
    return {
      allegee: null,
      carte: { jour: jour, declencheur: b.declencheur, compteur: b.compteur, cites: b.cites.slice(),
               phrase: M.phraseCarte(b.cites.map(nom)), detail: M.detailCarte() }
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
      // ECRAN-SAISIE §3.12 (68A) — « Si ça passe, …, à la série que tu veux ».
      else if (/à la série que tu veux/.test(x)) compte += 1;
      else if ((m = /sur (\d+) séries/.exec(x))) compte += Number(m[1]);
      else sansCompte += 1;
    });
    return { compte: compte, sansCompte: sansCompte };
  }

  // Le rôle qu'un pari écrit, pour le rôle d'une ligne du plan.
  var ROLE_DU_PARI = { ligne: 'ligne', test: 'haut', coach: 'coach', retour: 'retour', elan: 'elan' };

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
      // §9.15.5 (94) — UNE CHAUFFE DE LA ROUTINE NE RESTE JAMAIS VIDE EN
      // SILENCE : vide, elle est en trop (au-delà des marches de la règle) ou
      // trop légère, et alors la phrase le dit.
      var vues = 0;
      lignes.forEach(function (l) {
        if (!l.chauffe) return;
        vues++;
        if (l.chauffe.charge !== null || l.validee) return;
        if (l.chauffe.trop_leger) {
          if (ch.phrase !== null && (ch.phrase || '').indexOf('Trop léger pour une chauffe de plus.') < 0) err('I16', 'une chauffe trop légère sans sa phrase (série ' + l.iSerie + ')');
          return;
        }
        if (vues <= ch.prevues) err('I16', 'une chauffe de la routine restée vide (série ' + l.iSerie + ')');
      });
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
      // I17 (révisé par 94, 14/10/2026) — le coach ne pose JAMAIS de
      // dégressive : elle remplit une ligne dégressive que la routine ou
      // l'utilisateur a mise. À la barre, la phrase dit quoi enlever ; une
      // ligne que le coach ne remplit pas a sa phrase et ses deux gestes.
      if (l.type !== 'degressive') err('I17', 'une dégressive sans ligne dégressive (le coach n’en pose jamais)');
      // §10 bis (108) — à la barre fixe de la salle, on change de barre : la phrase le dit.
      if (d.barreFixe && d.charge !== null) {
        if (!d.phrase || d.phrase.indexOf('Prends la barre de ' + Voix().charge(d.charge) + '.') !== 0) {
          err('I17', 'la dégressive à la barre fixe ne dit pas quelle barre prendre (' + d.phrase + ')');
        }
      } else if (barre && d.charge !== null) {
        var enleve = d.reference !== null && d.reference !== undefined ? (d.reference - d.charge) / 2 : null;
        if (enleve === null || !d.phrase || d.phrase.indexOf('Enlève ' + Voix().charge(enleve) + ' de chaque côté') !== 0) {
          err('I17', 'la dégressive à la barre ne dit pas quoi enlever (' + d.phrase + ')');
        }
      }
      if (d.charge === null && !l.validee) {
        if (!d.phrase) err('I17', 'une dégressive vide en silence');
        if (!d.gestes || d.gestes.indexOf('serie_normale') < 0 || d.gestes.indexOf('retirer') < 0) err('I17', 'une dégressive vide sans ses gestes');
      }
      if (d.charge !== null && !(d.charge < d.reference && !memeCharge(d.charge, d.reference))) {
        err('I17', 'dégressive ' + d.charge + ' pas sous la dernière série de travail ' + d.reference);
      }
      if (!l.validee && (!l.fantome || !memeCharge(l.fantome.charge, d.charge))) err('I17', 'la dégressive n’est pas dans son fantôme');
    }
  }

  // I41, I42, I43 (MOTEUR §9.14 bis, 68A) — QUAND LA SÉRIE S'ÉCARTE DE SA
  // LIGNE. Relus sur les lignes et les séries faites, sans rappeler la
  // réaction. `avantX` (facultatif) : le même exercice dans le plan d'avant.
  //   I41 — « plus léger que prévu » : la dernière série validée est plus
  //     légère que sa ligne (sous un élan, aussi que la ligne du plan qu'il
  //     remplaçait : la charge de travail, ou le test), jamais une série à la
  //     charge de travail sur une ligne de test ; et une fois par exercice —
  //     aucune série validée avant elle n'était déjà plus légère que sa ligne ;
  //   I42 — en zone Lourd, au plus une ligne d'élan dans l'exercice ;
  //   I43 — une ligne d'élan n'est jamais plus légère que la ligne du plan
  //     initial qu'elle remplace, ne remplace jamais une ligne du coach, ne
  //     survit pas à une série validée plus légère qu'elle sur une ligne
  //     d'élan ; « élan » et la suggestion d'effort impliquent une ligne
  //     d'élan à la charge de la série commentée.
  function verifierEcarts(x, couvertes, init, cour, msg, err, avantX) {
    var k = x.consigne;
    var P = k.ligne ? nombre(k.ligne.charge) : null;
    var H = k.haut ? nombre(k.haut.charge) : null;
    var plusLegere = function (a, b) {
      var u = nombre(a), v = nombre(b);
      return u !== null && v !== null && u < v && !memeCharge(u, v);
    };
    var faite = function (l) { return l && l.validee && l.faite ? nombre(l.faite.charge) : null; };
    // Plus légère que sa ligne, au sens de la phrase : jamais le test remis à
    // plus tard ; sous un élan, plus légère aussi que ce qu'il remplaçait.
    var legereSurSaLigne = function (l) {
      var f = faite(l);
      if (f === null || !plusLegere(f, l.charge)) return false;
      if ((l.role === 'test' || l.role === 'elan') && memeCharge(f, P)) return false;
      // Sous un élan, seulement ce qui le dit à coup sûr : plus légère que la
      // charge de travail (la ligne remplacée est la charge de travail ou le test).
      if (l.role === 'elan') return plusLegere(f, P);
      return l.role === 'ligne' || l.role === 'test' || l.role === 'retour';
    };
    if (msg && msg.type === 'plus_leger') {
      var d = couvertes[msg.rang - 1];
      var f41 = faite(d);
      if (!d || f41 === null || !plusLegere(f41, d.charge)) {
        err('I41', '« plus léger » sans série plus légère que sa ligne (position ' + (msg.rang - 1) + ')');
      } else if ((d.role === 'test' || d.role === 'elan') && memeCharge(f41, P)) {
        err('I41', '« plus léger » pour une série à la charge de travail sur une ligne ' + d.role + ' (le test remis à plus tard)');
      } else if (d.role === 'elan' && !(plusLegere(f41, P) || (H !== null && plusLegere(f41, H)))) {
        err('I41', '« plus léger » sous un élan, pour une série qui n\'est pas plus légère que la ligne qu\'il remplaçait');
      }
      for (var a = 0; a < msg.rang - 1; a++) {
        if (legereSurSaLigne(couvertes[a])) {
          err('I41', '« plus léger » une seconde fois : la série de la position ' + a + ' était déjà plus légère que sa ligne');
          break;
        }
      }
    }
    var elans = couvertes.filter(function (l) { return l.role === 'elan'; });
    if (k.zone === 'lourd' && elans.length > 1) {
      err('I42', elans.length + ' lignes d\'élan en zone Lourd (une au plus)');
    }
    couvertes.forEach(function (l, j) {
      if (l.role !== 'elan') return;
      var i0 = init[j];
      if (i0 && !i0.figee && plusLegere(l.charge, i0.charge)) {
        err('I43', 'la ligne d\'élan ' + j + ' (' + l.charge + ') est plus légère que la ligne qu\'elle remplace (' + i0.charge + ')');
      }
      if (avantX && l.id && !l.validee) {
        var a43 = (avantX.lignes || []).filter(function (y) { return y && y.id === l.id; })[0];
        if (a43 && !a43.validee && a43.role === 'coach') {
          err('I43', 'la ligne d\'élan ' + j + ' remplace une ligne du coach');
        }
      }
      if (l.validee) return;
      // La dernière série validée sur une ligne d'élan, plus légère qu'elle :
      // l'élan s'est arrêté là, sauf s'il a été reposé à cette charge depuis.
      var arret = -1;
      for (var b = 0; b < j; b++) {
        var v = couvertes[b];
        if (v.role === 'elan' && faite(v) !== null && plusLegere(faite(v), v.charge)) arret = b;
      }
      if (arret < 0) return;
      var repose = false;
      for (var u = arret; u < j; u++) if (memeCharge(faite(couvertes[u]), l.charge)) repose = true;
      if (!repose) {
        err('I43', 'la ligne d\'élan ' + j + ' (' + l.charge + ') survit à la série plus légère de la position ' + arret);
      }
    });
    if (msg && (msg.type === 'elan' || msg.type === 'effort_suggere')) {
      var porte = couvertes.some(function (l, j) {
        return j >= msg.rang && !l.validee && l.role === 'elan' && memeCharge(l.charge, msg.charge);
      });
      if (!porte) err('I43', '« ' + msg.type + ' » sans ligne d\'élan à ' + msg.charge);
    }
    // I44 (MOTEUR §9.14 ter, 68B) — une ligne « à fond » (source `a_fond`) est
    // à la charge de la série validée juste avant elle, qui est à fond, et vise
    // ses reps moins une.
    couvertes.forEach(function (l, j) {
      if (l.source !== 'a_fond') return;
      var d = couvertes[j - 1];
      var f44 = d && d.validee && d.faite ? d.faite : null;
      if (!f44) { err('I44', 'la ligne « à fond » ' + j + ' sans série validée juste avant elle'); return; }
      var aFond = racine.THPalier.cranDeSerie({ rpe: f44.rpe, ressenti: f44.ressenti }) === 'max';
      if (!aFond || !memeCharge(l.charge, f44.charge) || nombre(l.vise) !== nombre(f44.reps) - 1) {
        err('I44', 'la ligne « à fond » ' + j + ' (' + l.charge + ' × ' + l.vise + ') après ' + f44.charge + ' × ' + f44.reps +
          (aFond ? '' : ', une série qui n\'est pas à fond'));
      }
    });
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
    // I27 (relevé du 01/10/2026, PR 2) — LA SUITE DU CONSTAT EST CALCULÉE AVEC
    // LA ZONE EN VIGUEUR : la zone choisie de la consigne suivante est celle de
    // la consigne du jour (ou aucune des deux). Une suite gardée en cache après
    // un changement de zone comparait la consigne de la nouvelle zone à la
    // suite de l'ancienne (couché haltères, 26/09).
    if (x.constat && x.consigne && x.constat.suiteZoneChoisie !== undefined) {
      var zJour = zoneChoisieDe(x.consigne);
      if (zJour !== x.constat.suiteZoneChoisie) {
        err('I27', 'la suite du constat a la zone choisie ' + (x.constat.suiteZoneChoisie || 'aucune') +
            ', la consigne du jour ' + (zJour || 'aucune') + ' (suite : ' + (x.constat.suiteEtat || '?') + ')');
      }
    }

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

    // I5 (§9.13 bis ; audit du 16/10/2026, 01 #7 : spécifié, jamais vérifié) — LES TESTS RESTANTS VALENT `k`
    // MOINS LES TESTS FIGÉS, SUR LES DERNIÈRES LIGNES NON FIGÉES. I6 compare l'en-tête aux lignes, mais l'en-tête est
    // rédigé sur la disposition du plan lui-même : un test perdu ou ajouté par la couverture passait. Lu sur
    // `planInitial` (le rôle de la couverture) : `k` celui de la ligne haute ; les lignes de la série de plus
    // (`ajoutee`, jamais un test, I24) sont hors du compte ; la semaine allégée (`couvre`, I19) n'a pas de test.
    if (typeof x.consigne.couvre !== 'number') {
      var k5 = x.consigne.haut ? (nombre(x.consigne.haut.k) || 0) : 0;
      var figes5 = init.filter(function (q) { return q && q.figee && q.role === 'haut'; }).length;
      var libres5 = couvertes.filter(function (l) { return init[l.position] && !init[l.position].figee && !l.ajoutee; });
      var attendus5 = Math.min(Math.max(0, k5 - figes5), libres5.length);
      var restants5 = libres5.filter(function (l) { return init[l.position].role === 'haut'; }).length;
      if (restants5 !== attendus5) {
        err('I5', restants5 + ' test(s) restant(s), ' + attendus5 + ' attendu(s) (k = ' + k5 + ', ' + figes5 + ' figé(s))');
      } else {
        libres5.forEach(function (l, j) {
          var doit = j >= libres5.length - attendus5;
          if ((init[l.position].role === 'haut') !== doit) {
            err('I5', 'la ligne ' + l.position + (doit ? ' devrait être un test' : ' est un test') + ' : les tests vont sur les dernières lignes');
          }
        });
      }
    }

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
      // §9.17 (50-1) — « 10 % sous le palier » n'a de sens que pour une charge
      // POSITIVE : sous un corps (0) ou une aide (négative), `Pal × 0,9` est au
      // niveau ou AU-DESSUS de `Pal` (−25 × 0,9 = −22,5), et toute reprise
      // longue d'aide déclenchait l'invariant à tort. Là, la reprise ne descend
      // pas du tout : la ligne est la charge de travail (I30 le dit pour l'aide).
      var plancher = Pal === null ? null
        : Pal > 0 ? Pal * (1 - racine.THMoteur.REPLI_MAX_REPRISE) : Pal;
      var dit = Pal !== null && Pal > 0 ? 'plus de 10 % sous le palier ' : 'sous la charge de travail ';
      var sous = function (v) { var n = nombre(v); return n !== null && plancher !== null && n < plancher - 1e-9; };
      if (x.consigne.ligne && sous(x.consigne.ligne.charge)) {
        err('I15', 'la consigne reprend à ' + x.consigne.ligne.charge + ', ' + dit + Pal);
      }
      (x.lignes || []).forEach(function (l) {
        if ((l.role === 'ligne' || l.role === 'retour') && sous(l.charge)) {
          err('I15', 'la série ' + l.iSerie + ' reprend à ' + l.charge + ', ' + dit + Pal);
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
    // I11 (révisé le 11/10/2026, 68A) — le fantôme d'une ligne non validée est
    // SA LIGNE : même charge ; les reps sont sa visée, sauf sur une ligne du
    // coach ou d'élan (nulles : on tape ses reps, la grille montre la
    // fourchette). Plus aucune recopie de la dernière série (49-U2).
    couvertes.forEach(function (l) {
      var f = l.fantome;
      if (l.validee) {
        if (f) err('I11', 'la série ' + l.iSerie + ' est faite et porte encore un fantôme');
        return;
      }
      if (!f) { err('I11', 'la série ' + l.iSerie + ' n\'a pas de fantôme'); return; }
      if (f.source !== 'plan') { err('I11', 'fantôme de source « ' + f.source + ' » (série ' + l.iSerie + ') : le fantôme est la ligne'); return; }
      var repsPlan = l.role === 'coach' || l.role === 'elan' ? null : nombre(l.vise);
      if (!memeCharge(f.charge, l.charge) || nombre(f.reps) !== repsPlan) {
        err('I11', 'fantôme ' + f.charge + '×' + f.reps + ' pour une ligne ' + l.charge + '×' + repsPlan + ' (série ' + l.iSerie + ')');
      }
    });

    verifierEcarts(x, couvertes, init, cour, msg, err, avantX);

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
        if (l.role === 'coach' || l.role === 'elan') return fait > prevue || memeCharge(fait, prevue);
        return memeCharge(fait, prevue);
      };
      var tenue = null;
      couvertes.forEach(function (l) {
        // §9.14 bis (68A) — une ligne d'élan tenue compte comme une montée du coach.
        if ((l.role !== 'coach' && l.role !== 'elan') || !l.validee || !suivieI10(l) || !zI10) return;
        // 68B — les reps faites, comme le constat (§17.4 révisé).
        var c = nombre(l.faite.reps);
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
    // rang d'une autre, figée ou non ; ni celui qu'une série faite a quitté
    // (supprimée, ou passée hors du travail : son pari reste — 122).
    var vus = {};
    var quittes = x.rangsQuittes || [];
    couvertes.forEach(function (l) {
      if (l.rang === null || l.rang === undefined) { err('I8', 'la série ' + l.iSerie + ' est couverte sans rang'); return; }
      if (vus[l.rang] !== undefined) err('I8', 'le rang ' + l.rang + ' est porté par les séries ' + vus[l.rang] + ' et ' + l.iSerie);
      vus[l.rang] = l.iSerie;
      if (!l.figee && quittes.indexOf(Number(l.rang)) >= 0) err('I8', 'la série ' + l.iSerie + ' reprend le rang ' + l.rang + ', quitté par une série faite');
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
  // Prérequis d'« adapter » — L'EXERCICE D'UN PLAN DANS UN AUTRE, PAR SON
  // IDENTIFIANT D'OCCURRENCE (`THSeance`), plus par sa position : déplacer un
  // exercice (flèches, Réorganiser) ou en insérer un au milieu décalait les
  // positions, et I4 cessait de suivre les lignes figées pour ce plan. Sans
  // identifiant (un plan d'avant la règle), la position et l'exercice, comme
  // avant.
  function homologue(plan, x, i) {
    var exos = (plan && plan.exercices) || [];
    if (x && x.occurrence) {
      for (var k = 0; k < exos.length; k++) if (exos[k] && exos[k].occurrence === x.occurrence) return exos[k];
      return null;
    }
    var y = exos[i];
    return y && x && y.slug === x.slug ? y : null;
  }

  function verifierSuite(avant, plan, erreurs) {
    ((avant && avant.exercices) || []).forEach(function (xa, i) {
      var xp = homologue(plan, xa, i);
      if (!xp) return;
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

  // I40 (MOTEUR §9.16, 60-2b) — chaque pari de la séance porte dans son
  // fondement l'objectif GELÉ du plan (une des quatre valeurs, ou `null` sans
  // réponse), le même pour tous : ceux que le plan écrira (`x.paris`) comme ceux
  // déjà posés (`entrees.paris`). ⚠️ `null` est LÉGITIME : l'invariant exige la
  // PRÉSENCE de la clé (un pari sans clé n'a pas été écrit par ce plan) puis
  // l'égalité — la valeur seule laisserait passer `undefined` pour « sans réponse ».
  function verifierObjectif(plan, parisSeance, erreurs) {
    if (!plan) return;
    var objectif = plan.objectif;
    if (objectif !== null && OBJECTIFS_DU_PLAN.indexOf(objectif) < 0) {
      erreurs.push('I40 — l\'objectif du plan est absent ou inconnu (' + objectif + ')');
    }
    var voir = function (q, ou) {
      var f = q && q.fondement;
      if (!f) return;
      if (!Object.prototype.hasOwnProperty.call(f, 'objectif')) {
        erreurs.push('I40 — ' + ou + ' : un pari sans objectif');
      } else if (f.objectif !== objectif) {
        erreurs.push('I40 — ' + ou + ' : un pari à l\'objectif ' + f.objectif + ' dans une séance à ' + objectif);
      }
    };
    (plan.exercices || []).forEach(function (x) {
      (x.paris || []).forEach(function (q, i) { voir(q, 'exercice ' + x.iExo + ' (' + x.slug + '), série ' + i); });
    });
    // ⚠️ En ÉDITION, les paris déjà posés sont ceux d'une séance TERMINÉE, écrits avant 60-2b
    // (sans clé `objectif`) ou à l'objectif d'alors : ils ne témoignent pas de l'objectif d'aujourd'hui,
    // et le plan d'une correction ne les réécrit pas. Les comparer ferait échouer la garde de
    // développement sur toute correction d'une séance ancienne.
    if (plan.edition !== true) {
      (parisSeance || []).forEach(function (q) { voir(q, 'pari posé ' + (q.exercise_slug || '') + ' rang ' + (q.fondement && q.fondement.rang)); });
    }
  }

  // I18 (MOTEUR §9.16, 49-U11) — chaque pari de la séance porte dans son
  // fondement la phase GELÉE du plan (`prise_de_masse`, `maintien` ou
  // `seche`, jamais vide), la même pour tous : ceux que le plan écrira
  // (`x.paris`) comme ceux déjà posés (`entrees.paris`).
  function verifierPhase(plan, parisSeance, erreurs) {
    if (!plan) return;
    var phase = plan.phase;
    if (phasesDuPlan().indexOf(phase) < 0) erreurs.push('I18 — la phase du plan est vide ou inconnue (' + phase + ')');
    var voir = function (q, ou) {
      var f = q && q.fondement;
      if (!f) return;
      if (phasesDuPlan().indexOf(f.phase) < 0) {
        erreurs.push('I18 — ' + ou + ' : un pari sans phase (' + f.phase + ')');
      } else if (f.phase !== phase) {
        erreurs.push('I18 — ' + ou + ' : un pari à la phase ' + f.phase + ' dans une séance à ' + phase);
      }
    };
    (plan.exercices || []).forEach(function (x) {
      (x.paris || []).forEach(function (q, i) { voir(q, 'exercice ' + x.iExo + ' (' + x.slug + '), série ' + i); });
    });
    // ⚠️ En ÉDITION, les paris déjà posés sont ceux d'une séance TERMINÉE : écrits à la phase d'alors
    // (ou, avant 49-U11, sans phase), ils ne témoignent pas de la phase d'aujourd'hui — la phase gelée de
    // cette séance n'existe plus, le plan lit celle du profil — et le plan d'une correction ne les réécrit
    // pas. Les comparer ferait échouer la garde de développement sur toute correction d'une séance
    // ancienne (jumeau d'I40, `verifierObjectif`, 9acf4de). Ce que le plan écrit lui-même, lui, reste vérifié.
    if (plan.edition !== true) {
      (parisSeance || []).forEach(function (q) { voir(q, 'pari posé ' + (q.exercise_slug || '') + ' rang ' + (q.fondement && q.fondement.rang)); });
    }
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
  // meilleur, à 10 % au plus sous lui, et strictement sous le palier actuel (la
  // consigne : un repli ne monte jamais, §14.2 (1), audit du 16/10/2026, 01 #5).
  // La règle n'est pas relue : I22 confronte la charge au meilleur du compteur et
  // au palier de la consigne que le plan porte.
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
        if (Moteur().estZoneForce(zSp)) erreurs.push('I23 — ' + nom + ' : une série de plus en zone force (' + zSp + ')');
        if (plan.allegee) erreurs.push('I23 — ' + nom + ' : une série de plus pendant une semaine allégée');
        // Audit du 16/10/2026, 01 #6 — sans zone, l'acceptation n'ajouterait rien : jamais proposée.
        if (!zSp) erreurs.push('I23 — ' + nom + ' : une série de plus sans zone');
      }
      if (carteSp && x.placeSerieDePlus !== true) erreurs.push('I23 — ' + nom + ' : une série de plus proposée sans place');
      // I48 (MOTEUR §14, 111) — une dégressive proposée (sa carte) ou en cours
      // seulement sur une isolation, hors sèche, hors zone force, hors semaine
      // allégée ou décharge, hors Entretenir, jamais pour un débutant ; la carte,
      // au 2e déclenchement isolé, après une série de plus, sur un exercice dont
      // la routine n'a pas de ligne dégressive.
      var carteDeg = m && m.carte && m.carte.type === 'degressive';
      if (carteDeg || x.degressiveEnCours) {
        var e48 = function (t) { erreurs.push('I48 — ' + nom + ' : ' + t); };
        var z48 = x.consigne ? x.consigne.zone : null;
        if (x.polyarticulaire !== false) e48('une dégressive proposée sur un exercice qui n\'est pas une isolation');
        if (plan.phase === 'seche') e48('une dégressive proposée en sèche');
        if (Moteur().estZoneForce(z48)) e48('une dégressive proposée en zone force (' + z48 + ')');
        if (plan.allegee) e48('une dégressive proposée pendant une semaine allégée ou une décharge');
        if (plan.intention === 'entretien' || x.intention === 'entretien') e48('une dégressive proposée en Entretenir');
        if (plan.debutant) e48('une dégressive proposée à un débutant');
      }
      if (carteDeg) {
        if (x.degressiveRoutine) erreurs.push('I48 — ' + nom + ' : une dégressive proposée alors que la routine en a une');
        // §10 bis (113) — AU PLAFOND DE LA SALLE, la dégressive suit l'escalier du plafond (une marche par
        // déclenchement, la série de plus sautée sans place) : I47 en vérifie l'ordre.
        var auPlafondI48 = !!(m.plafond && x.salle && x.consigne && Moteur().auPlafondDeLaSalle(x.consigne, x.salle));
        if (!auPlafondI48) {
          if (m.n !== 2) erreurs.push('I48 — ' + nom + ' : une dégressive proposée hors du 2e déclenchement isolé (n = ' + m.n + ')');
          if (m.serieDePlusProposee !== true) erreurs.push('I48 — ' + nom + ' : une dégressive proposée sans série de plus avant elle');
        }
      }
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
      // §9.17 — pas de repli sous un corps ni sous une aide (I28, I30 le disent) :
      // la limite de 10 % ne se lit que sur une charge positive.
      if (isFinite(meilleur) && meilleur <= 0) {
        err('un repli sous une charge nulle ou négative (' + meilleur + ' kg)');
      } else if (!isFinite(meilleur) || !isFinite(ch)) {
        err('un repli sans meilleur ou sans charge');
      } else if (ch >= meilleur - 1e-9) {
        err(ch + ' kg n\'est pas sous le meilleur (' + meilleur + ' kg)');
      } else if (meilleur - ch > meilleur * Moteur().REPLI_MAX_REPRISE + 1e-9) {
        err(ch + ' kg est à plus de 10 % sous le meilleur (' + meilleur + ' kg)');
      }
      var actuel22 = x.consigne.palier === null || x.consigne.palier === undefined ? NaN : Number(x.consigne.palier);
      if (isFinite(actuel22) && isFinite(ch) && ch >= actuel22 - 1e-9) {
        err(ch + ' kg n\'est pas sous le palier actuel (' + actuel22 + ' kg) : un repli ne monte jamais');
      }
    });
  }

  // ══ I13, I28 À I31 — LE POIDS DU CORPS, L'AIDE, LE LEST, ENTRETENIR PAR EXERCICE
  //    (MOTEUR §9.17, 50-1, 03/10/2026) ═════════════════════════════════════════
  //
  // ⚠️ I13 N'ÉTAIT PAS VÉRIFIÉ jusqu'ici : la spec le disait (« en Entretenir ou
  // en Édition : aucune ligne du coach, aucun pari, aucun message »), aucun
  // code ne le lisait — le silence tenait au seul `consigneDExercice` qui rend
  // `null`. Il se vérifie désormais sur ce que le PLAN porte : la mesure de
  // chaque exercice, son mode, l'intention du profil, l'Édition (clés ajoutées
  // en 50-1) — sans relire la règle qui les décide.
  //
  //   I13  Entretenir (le profil) ou Édition, ou une mesure en durée ou en
  //        distance : aucune consigne, aucune ligne du coach, aucun pari, aucun
  //        message. Le poids du corps en reps, lesté ou assisté, est coaché.
  //   I28  au poids du corps (charge 0), jamais une ligne haute avec une charge,
  //        ni une montée proposée.
  //   I29  la carte du lest : au plus une, jamais après une réponse, jamais sans
  //        deux séances au haut de la zone, jamais sans version lestée à poser.
  //   I30  sur une aide (charge négative) : ni chauffes, ni dégressive, ni repli,
  //        ni seconde charge, ni double saut.
  //   I31  un exercice en Entretenir (`modes_exercice`) : ce que dit I13.
  //
  // 60-1 (« JUSTE UN CARNET », QUESTIONNAIRE-COACH-V2 §4) — `jusquaLaVoix` : en
  // Entretenir, le coach ne dit RIEN, pas seulement rien sur la charge. Tout
  // ce que le plan porte d'une voix du coach compte alors : la dégressive (sa
  // phrase, son fantôme), les chauffes et leur proposition, une marche de
  // l'escalier, la carte du lest ou de reprise, une phrase. Les autres causes
  // de silence (Édition, mesure sans charge, « J'ai mal ») gardent le contrat
  // d'avant : elles ne disent pas que la dégressive se tait.
  function sansCoach(x, jusquaLaVoix) {
    var raisons = [];
    if (x.consigne) raisons.push('une consigne (' + (x.consigne.etat || '?') + ')');
    if ((x.lignes || []).some(function (l) { return l.role !== 'hors'; })) raisons.push('une ligne du coach');
    if ((x.paris || []).some(Boolean)) raisons.push('un pari');
    if (x.message) raisons.push('un message');
    if (jusquaLaVoix) {
      if (x.degressive) raisons.push('une dégressive');
      if ((x.lignes || []).some(function (l) { return l.fantome && l.fantome.source; })) raisons.push('un fantôme du coach');
      if (x.chauffes) raisons.push('des chauffes calculées');
      if (x.proposition) raisons.push('une proposition de chauffes');
      if (x.escalier) raisons.push('une marche de l’escalier');
      if (x.carteLest) raisons.push('la carte du lest');
      if (x.carteReprise) raisons.push('la carte de reprise');
      if ((x.phrases || []).length) raisons.push('une phrase du coach');
    }
    return raisons;
  }

  // I33 À I35 (MOTEUR §9.20, 51-3) — « J'AI MAL ».
  //   I33  une occurrence marquée « douleur » : aucune ligne du coach, aucun
  //        pari, aucun message pour ses lignes restantes ;
  //   I34  une consigne ne lit jamais une séance-exercice marquée pour sa
  //        charge : ni la séance qui fonde la ligne (`fondement.date`), ni
  //        celle d'un repli ;
  //   I35  la carte de reprise n'apparaît que si la dernière séance de
  //        l'exercice porte la marque, et n'a pas de point d'interrogation ;
  //        « Plus léger, plus de reps » ne pose que la charge du repli.
  function verifierDouleur(plan, entrees, erreurs) {
    if (!plan) return;
    var consignes = (entrees && entrees.consignes) || {};
    var reprises = (entrees && entrees.seance && entrees.seance.reprises) || {};
    (plan.exercices || []).forEach(function (x) {
      var nom = 'exercice ' + x.iExo + ' (' + x.slug + ')';
      var err = function (inv, texte) { erreurs.push(inv + ' — ' + nom + ' : ' + texte); };
      if (x.douleur) sansCoach(x).forEach(function (r) { err('I33', 'occurrence marquée « douleur » : ' + r); });
      var c = x.slug && Object.prototype.hasOwnProperty.call(consignes, x.slug) ? consignes[x.slug] : null;
      var marquees = (c && c.douleurs) || [];
      var k = x.consigne;
      if (k && marquees.length) {
        var f = k.fondement || {};
        if (f.date && marquees.indexOf(f.date) >= 0) err('I34', 'la charge se fonde sur une séance marquée (' + f.date + ')');
        if (k.repli && marquees.indexOf(k.repli.debut) >= 0) err('I34', 'le repli lit une séance marquée (' + k.repli.debut + ')');
      }
      if (x.carteReprise) {
        var rp = c && c.reprise;
        if (!rp || rp.douleur !== true || marquees.indexOf(rp.derniere) < 0) {
          err('I35', 'une carte de reprise sans dernière séance marquée');
        }
        var textes = [x.carteReprise.titre, x.carteReprise.phrase].concat((x.carteReprise.choix || []).map(function (q) { return q.texte; }));
        if (textes.some(function (t) { return /\?/.test(String(t)); })) err('I35', 'la carte de reprise pose une question');
      }
      var r = Object.prototype.hasOwnProperty.call(reprises, x.slug) ? reprises[x.slug] : null;
      if (k && r && r.choix === 'leger' && r.repli && !memeCharge(k.ligne && k.ligne.charge, r.repli.ligne[0])) {
        err('I35', '« Plus léger » pose ' + (k.ligne && k.ligne.charge) + ', le repli est à ' + r.repli.ligne[0]);
      }
    });
  }

  // I32 (MOTEUR §9.18, 51-1) — UNE SÉANCE RACCOURCIE GARDE CHAQUE MUSCLE, SON
  // PREMIER EXERCICE ET SES CHARGES. Sur `entrees.raccourci` (`complet`, la
  // structure de la routine ; `raccourcie`, celle de la carte acceptée) :
  //   · chaque muscle principal de la routine garde au moins une série de
  //     travail ;
  //   · le premier exercice (le premier qui a des muscles) garde au moins 2
  //     séries de travail (ou toutes, s'il en avait moins) et toutes ses
  //     chauffes ;
  //   · aucune charge ne diffère de la consigne de la séance complète, et la
  //     semaine allégée et la série de plus lisent les séries de la routine
  //     COMPLÈTE (51-1 ter) — jamais celles de la séance raccourcie.
  // Les deux premiers portent sur la structure du raccourci, pas sur la séance
  // telle que la personne la modifie ensuite : retirer une série en séance est
  // son geste, pas celui du coach.
  function verifierRaccourci(plan, entrees, erreurs) {
    var rc = entrees.raccourci;
    if (!rc || !rc.complet || !rc.raccourcie) return;
    var M = Moteur();
    var liste = function (v) { return Array.isArray(v) ? v.filter(Boolean) : String(v || '').split('/').filter(Boolean); };
    var complet = rc.complet, court = rc.raccourcie;
    var gardes = {};
    court.forEach(function (e) { if (e && e.tr > 0) liste(e.prim).forEach(function (m) { gardes[m] = true; }); });
    var signales = {};
    complet.forEach(function (e) {
      if (!e || !(e.tr > 0)) return;
      liste(e.prim).forEach(function (m) {
        if (gardes[m] || signales[m]) return;
        signales[m] = true;
        erreurs.push('I32 — le muscle ' + m + ' n\'a plus aucune série de travail dans la séance raccourcie');
      });
    });
    var p = -1;
    // Le premier exercice qui a des muscles — dans les trois listes, comme `aDesMuscles` (65).
    complet.forEach(function (e, i) {
      if (p < 0 && e && liste(e.prim).length + liste(e.sec).length + liste(e.stab).length > 0) p = i;
    });
    if (p >= 0) {
      var a = complet[p], b = court[p] || {};
      var min = Math.min(2, a.tr || 0);
      if ((b.tr || 0) < min) {
        erreurs.push('I32 — le premier exercice (' + a.slug + ') garde ' + (b.tr || 0) + ' série(s) de travail, pour au moins ' + min);
      }
      if ((b.ch || 0) !== (a.ch || 0)) {
        erreurs.push('I32 — le premier exercice (' + a.slug + ') garde ' + (b.ch || 0) + ' chauffe(s) sur ' + (a.ch || 0));
      }
    }
    var completDe = {};
    complet.forEach(function (e) { if (e && !Object.prototype.hasOwnProperty.call(completDe, e.slug)) completDe[e.slug] = e; });
    var cs = entrees.consignes || {};
    ((plan && plan.exercices) || []).forEach(function (x) {
      if (!x || !x.consigne || !Object.prototype.hasOwnProperty.call(completDe, x.slug)) return;
      var tr = completDe[x.slug].tr || 0;
      if (!tr) return;
      var nom = 'I32 — exercice ' + x.iExo + ' (' + x.slug + ') : ';
      var c = Object.prototype.hasOwnProperty.call(cs, x.slug) ? cs[x.slug] : null;
      if (c && typeof c.seriesRoutine === 'number' && c.seriesRoutine > 0 && c.seriesRoutine !== tr) {
        erreurs.push(nom + 'la consigne lit ' + c.seriesRoutine + ' séries de routine, la routine complète en a ' + tr);
      }
      if (x.consigne.allegee && x.consigne.allegee.routine !== tr) {
        erreurs.push(nom + 'la semaine allégée part de ' + x.consigne.allegee.routine + ' séries, la routine complète en a ' + tr);
      }
      if (x.consigne.serieDePlus && x.consigne.serieDePlus.routine !== tr) {
        erreurs.push(nom + 'la série de plus part de ' + x.consigne.serieDePlus.routine + ' séries, la routine complète en a ' + tr);
      }
      if (!x.consigne.repli && c && c.consigne) {
        var ref = M.consigneFigee(c.consigne);
        var chargeDe = function (k) { var l = k && (k.ligne || k.haut); return l ? l.charge : null; };
        if (!memeCharge(chargeDe(x.consigne), chargeDe(ref))) {
          erreurs.push(nom + 'la charge ' + chargeDe(x.consigne) + ' diffère de la consigne de la séance complète (' + chargeDe(ref) + ')');
        }
      }
    });
  }

  function verifierPoidsDuCorps(plan, erreurs) {
    if (!plan) return;
    var M = Moteur();
    var cartes = 0;
    (plan.exercices || []).forEach(function (x) {
      var nom = 'exercice ' + x.iExo + ' (' + x.slug + ')';
      var err = function (inv, texte) { erreurs.push(inv + ' — ' + nom + ' : ' + texte); };
      var k = x.consigne || null;

      // I13 — et I31, qui n'en est que le même silence pour un exercice choisi.
      var horsMesure = x.mesure === 'temps' || x.mesure === 'distance_temps';
      var causes = [];
      if (plan.intention === 'entretien') causes.push('Entretenir (profil)');
      if (plan.edition === true) causes.push('Édition');
      if (horsMesure) causes.push('une mesure en ' + (x.mesure === 'temps' ? 'durée' : 'distance'));
      // 119 (audit du 16/10/2026, E6) — sur une mesure en durée ou en distance, le coach ne dit RIEN, comme en
      // Entretenir : ni dégressive, ni chauffe, ni phrase (« Pas de charge de travail pour caler la dégressive. »
      // passait sous I13, qui ne regardait pas la dégressive).
      if (causes.length) {
        sansCoach(x, plan.intention === 'entretien' || horsMesure).forEach(function (r) { err('I13', causes.join(', ') + ' : ' + r); });
      }
      // I28 (119, E6) — au poids du corps (mesure en reps), jamais de dégressive : §9.17, « pas de dégressive sous un
      // corps », avec ou sans consigne.
      if (x.mesure === 'reps' && x.degressive) err('I28', 'une dégressive au poids du corps');
      if (x.mode === 'entretien') {
        sansCoach(x, true).forEach(function (r) { err('I31', 'Entretenir (cet exercice) : ' + r); });
      }

      // I28 — au poids du corps, jamais une ligne haute avec une charge.
      if (estPoidsDuCorps(k)) {
        if (k.haut) err('I28', 'une ligne haute (' + k.haut.charge + ') au poids du corps');
        (x.planInitial || []).forEach(function (q, i) {
          if (q && q.role === 'haut') err('I28', 'la ligne ' + i + ' est un test au poids du corps');
        });
        ((x.reaction && x.reaction.plan) || []).forEach(function (q, i) {
          if (q && q.source === 'coach') err('I28', 'la ligne ' + i + ' porte une montée du coach (' + q.charge + ') au poids du corps');
        });
        (x.lignes || []).forEach(function (l) {
          if (l.role === 'hors') return;
          if (nombre(l.charge) !== 0 && l.charge !== null) err('I28', 'la série ' + l.iSerie + ' porte une charge (' + l.charge + ') au poids du corps');
          if (l.role === 'test' || l.role === 'coach') err('I28', 'la série ' + l.iSerie + ' est une ligne ' + l.role + ' au poids du corps');
        });
      }

      // I29 — la carte du lest.
      var fl = k && k.fondement ? k.fondement.carteLest : null;
      if (k && k.etat === 'carte_lest') {
        if (plan.lestReponse !== null && plan.lestReponse !== undefined) {
          err('I29', 'la consigne dit la carte du lest après une réponse (' + plan.lestReponse + ')');
        }
        if (!fl || !Array.isArray(fl.niveaux) || fl.niveaux.length !== 2 ||
            !fl.niveaux.every(function (n) { return typeof n === 'number' && n >= fl.haut; })) {
          err('I29', 'la carte du lest sans deux séances au haut de la zone (' + JSON.stringify(fl ? fl.niveaux : null) + ')');
        }
        if (x.carteLest === undefined) err('I29', 'le plan ne dit pas où est la carte du lest');
      }
      if (x.carteLest) {
        cartes += 1;
        if (!k || k.etat !== 'carte_lest') err('I29', 'une carte du lest sans consigne « carte_lest »');
        if (plan.lestReponse !== null && plan.lestReponse !== undefined) {
          err('I29', 'la carte du lest revient après une réponse (' + plan.lestReponse + ')');
        }
        var nv = x.carteLest.niveaux;
        if (!Array.isArray(nv) || nv.length !== 2 || !nv.every(function (n) { return typeof n === 'number' && n >= x.carteLest.haut; })) {
          err('I29', 'une carte du lest sans deux séances au haut de la zone (' + JSON.stringify(nv) + ')');
        }
        if (!x.carteLest.leste) err('I29', 'une carte du lest sans version lestée à poser');
        if (/\?/.test(String(x.carteLest.titre) + String(x.carteLest.detail))) err('I29', 'un point d’interrogation dans la carte du lest (§20.2)');
        if (k && k.allegee) err('I29', 'la carte du lest pendant une semaine allégée');
      }

      // I30 — sur une aide : ni chauffes, ni dégressive, ni repli, ni seconde
      // charge, ni double saut.
      if (estAide(k)) {
        if (x.chauffes || x.proposition) err('I30', 'des chauffes sur une aide');
        if (x.degressive) err('I30', 'une dégressive sur une aide');
        if (k.repli || (x.escalier && x.escalier.marche === M.MARCHE_REPLI)) err('I30', 'un repli sur une aide');
        if (k.etat === 'reprise_longue' && k.ligne && !memeCharge(k.ligne.charge, k.palier)) {
          err('I30', 'un repli de reprise longue sur une aide (' + k.ligne.charge + ' pour ' + k.palier + ')');
        }
        if (x.contexte && x.contexte.haut) err('I30', 'une seconde charge sur une aide');
        var msg = x.reaction && x.reaction.message;
        if (msg && Array.isArray(msg.charges) && msg.charges.length > 1) err('I30', 'une seconde charge dans le message sur une aide');
        if (k.fondement && k.fondement.preuve) err('I30', 'un double saut sur une aide (' + k.fondement.preuve + ')');
      }
    });
    if (cartes > 1) erreurs.push('I29 — ' + cartes + ' cartes du lest dans la même séance : au plus une');
    // I13, le plan lui-même (60-1, « Juste un carnet ») : en Entretenir, ni
    // bandeau de décharge planifiée, ni fenêtre de semaine allégée, ni carte.
    if (plan.intention === 'entretien') {
      if (plan.allegee) erreurs.push('I13 — Entretenir (profil) : un bandeau de semaine allégée ou de décharge');
      if (plan.carte) erreurs.push('I13 — Entretenir (profil) : une carte de semaine allégée');
    }
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

  // ══ I36 à I39 — LES PROGRAMMES À CYCLES (MOTEUR §9.22, 53-2) ═══════════════
  //
  // Sur `entrees.programme` : `{ blocs, lignes }` — les blocs (table `blocs`) et
  // les lignes de zone du compte (`zones_exercice`, celles d'origine « bloc »
  // y sont lues).
  //   · I36 — un bloc ne change que la zone de SES exercices : chaque ligne
  //     d'origine « bloc » désigne un bloc, un de ses exercices, sa zone, et
  //     son début (00:00) — ni exercice, ni ordre, ni série, ni charge ;
  //   · I37 — une zone de bloc est Lourd ou Mix ;
  //   · I38 — jamais deux réductions à la fois : une décharge planifiée qui
  //     aurait lieu pendant (ou moins de 14 jours après) une semaine allégée
  //     acceptée, ou une carte de semaine allégée pendant la décharge ;
  //   · I39 — « Changer de schéma » absent pour un exercice d'un bloc en cours.
  function verifierProgramme(plan, entrees, erreurs) {
    if (!plan) return;
    var M = Moteur();
    var pr = (entrees && entrees.programme) || {};
    var blocs = pr.blocs || [];
    var parId = {};
    blocs.forEach(function (b) {
      if (!b) return;
      if (b.id) parId[b.id] = b;
      if (M.ZONES_DE_BLOC.indexOf(b.zone) < 0) erreurs.push('I37 — le bloc ' + (b.id || '?') + ' porte la zone « ' + b.zone + ' »');
    });
    (pr.lignes || []).forEach(function (l) {
      if (!l || l.origine !== 'bloc') return;
      var b = l.bloc_id ? parId[l.bloc_id] : null;
      var dit = 'la ligne de zone ' + (l.id || '?') + ' (' + l.exercise_slug + ')';
      // Le début du bloc à 00:00, heure locale — compté ici, sans `zonesPosees`.
      if (!b) { erreurs.push('I36 — ' + dit + ' : d’origine « bloc » sans bloc connu'); return; }
      if ((b.exercices || []).indexOf(l.exercise_slug) < 0) erreurs.push('I36 — ' + dit + ' : un exercice hors du bloc');
      var md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(M.jourCivil(b.debut) || ''));
      var minuit = md ? new Date(+md[1], +md[2] - 1, +md[3]).getTime() : null;
      var t = new Date(l.corrigee_a).getTime();
      // §9.22 (53-2 ter) — UNE LIGNE POSÉE (datée du début du bloc) porte la
      // zone du bloc ; TOUTE AUTRE est celle d'un arrêt : d'un bloc qui n'est
      // plus en cours, après son début, sans zone ou avec la zone d'avant le
      // programme (une zone connue, pas forcément Lourd ou Mix).
      if (minuit !== null && t === minuit) {
        if (M.ZONES_DE_BLOC.indexOf(l.zone) < 0) erreurs.push('I37 — ' + dit + ' pose « ' + l.zone + ' »');
        else if (l.zone !== b.zone) erreurs.push('I36 — ' + dit + ' : « ' + l.zone + ' » pour un bloc ' + b.zone);
        return;
      }
      if (b.statut === 'en_cours') {
        erreurs.push('I36 — ' + dit + ' : datée ' + l.corrigee_a + ', hors du début d’un bloc encore en cours (' + b.debut + ')');
      }
      if (minuit !== null && !(t > minuit)) {
        erreurs.push('I36 — ' + dit + ' : l’arrêt daté ' + l.corrigee_a + ', avant le début du bloc ' + b.debut);
      }
      if (l.zone !== null && l.zone !== undefined && !M.zoneParCle(l.zone)) {
        erreurs.push('I37 — ' + dit + ' : l’arrêt rend une zone inconnue « ' + l.zone + ' »');
      }
    });
    var cartes = ((entrees && entrees.escalier && entrees.escalier.cartes) || []).filter(function (c) {
      return c && c.reponse === 'acceptee' && c.debut && c.fin;
    });
    // ⚠️ SANS RELIRE LA RÈGLE CONTRÔLÉE (ni `dechargePlanifiee`, ni
    // `carteAllegeeAutorisee`) : les jours se comptent ici, à part.
    var jour = M.jourCivil(entrees && entrees.seance && entrees.seance.debut);
    var num = function (j) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(M.jourCivil(j) || ''));
      return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
    };
    var a = plan.allegee;
    if (a && a.source === SOURCE_DECHARGE) {
      var d0 = num(a.debut);
      cartes.forEach(function (c) {
        var f = num(c.fin);
        if (d0 !== null && f !== null && f > d0 - M.SANS_CUMUL_JOURS && f < d0 + 7) {
          erreurs.push('I38 — la décharge planifiée du ' + a.debut + ' suit de moins de ' + M.SANS_CUMUL_JOURS +
            ' jours la semaine allégée finie le ' + c.fin);
        }
      });
    }
    if (plan.carte && jour) {
      blocs.forEach(function (b) {
        if (!b || b.statut !== 'en_cours' || b.decharge !== true) return;
        var d1 = num(b.debut) + 7 * (Number(b.semaines) - 1), j = num(jour);
        if (j >= d1 - M.SANS_CUMUL_JOURS && j <= d1 + 6) {
          erreurs.push('I38 — une carte de semaine allégée à ' + (d1 - j) + ' jour(s) d’une décharge planifiée');
        }
      });
    }
    var enBloc = (plan.programme && plan.programme.enBloc) || {};
    (plan.exercices || []).forEach(function (x) {
      if (x && x.escalier && x.escalier.marche === M.MARCHE_SCHEMA && enBloc[x.slug]) {
        erreurs.push('I39 — exercice ' + x.iExo + ' (' + x.slug + ') : « Changer de schéma » dans un bloc en cours');
      }
    });
  }

  // ══ I26 — LA COHÉRENCE DES PHRASES (MOTEUR §20 bis, 49-U19) ═════════════
  //
  // « Chaque chiffre que le coach écrit a une origine dans le plan ; et deux
  // phrases du même plan ne disent jamais deux choses différentes. » La garde
  // LIT LES DÉCLARATIONS du formateur (`x.phrases`, capturées par le plan) :
  // elle n'analyse pas le texte, sauf pour y trouver ce que personne n'a
  // déclaré — un chiffre écrit à la main, un « null ».
  //
  // Trois vérifications, plus les mots interdits :
  //   1. le jaune colle aux chiffres : une cible du jour est une ligne du plan ;
  //   2. le gris colle aux chiffres : un fait passé égale sa source (le
  //      fondement de la consigne, le compteur, les séries faites du jour),
  //      une cible suivante égale la consigne suivante, une règle sa valeur ;
  //   3. le jaune et le gris disent la même chose : même nature et même objet,
  //      mêmes chiffres, dans les deux sens ; un mot d'ordre égale le rang.
  //
  // ⚠️ EN MODE RAPPORT (49-U19). Un écart ne rend pas le plan faux (`ok` ne le
  // compte pas) : il se liste, se compare à la liste d'attente, et se tranche
  // ensuite — la phrase, ou la garde. ⚠️ AUCUNE SOURCE N'EST RECALCULÉE PAR
  // LA RÈGLE CONTRÔLÉE : le rang d'une série restée se relit dans le
  // fondement, la cible suivante dans la consigne suivante que l'app a donnée.
  //
  // `faits` (facultatif) : `{ [slug]: { [quoi]: { charge, reps, date } } }`,
  // des faits de l'historique qui remplacent ceux que le plan porte.
  // Rend `[{ iExo, exercice, ou, phrase, citation, attendu, cause }]`.
  var MOTS_INTERDITS = /\b(?:null|undefined|NaN)\b/;
  var NATURES_I26 = { cible_du_jour: true, fait_passe: true, cible_suivante: true, regle: true };
  // Des citations de même clé qui disent des choses DIFFÉRENTES par nature :
  // chaque série du jour, chaque chauffe, les deux bornes d'une visée.
  var SANS_CROISEMENT = { 'fait_passe|du_jour': true, 'regle|chauffe': true, 'regle|chauffe.reps': true,
                          'regle|degressive.vise': true, 'fait_passe|seance': true, 'regle|constante': true,
                          // Les nombres de séries de chaque segment (PR 7) : « sur les 2
                          // dernières » et « sur les 3 d'avant » disent deux segments.
                          'regle|series': true };

  function texteDuChiffre(v) {
    return v === null || v === undefined ? String(v) : (typeof v === 'number' ? Voix().nombre(v) || String(v) : String(v));
  }
  function memesReps(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (nombre(a[i]) === null || nombre(a[i]) !== nombre(b[i])) return false;
    return true;
  }
  function memeJour(a, b) {
    if (!a || !b) return false;
    return String(a) === String(b) || String(a).slice(0, 10) === String(b).slice(0, 10);
  }
  function decrire(src) {
    if (!src) return 'aucune source';
    var b = [];
    if (src.charge !== undefined) b.push(src.charge === null ? 'charge inconnue' : texteDuChiffre(src.charge) + ' kg');
    if (Array.isArray(src.reps)) b.push('× ' + src.reps.map(texteDuChiffre).join(', '));
    if (src.date) b.push(String(src.date).slice(0, 10));
    if (src.valeur !== undefined) b.push(texteDuChiffre(src.valeur));
    if (Array.isArray(src.valeurs)) b.push('une de : ' + src.valeurs.map(texteDuChiffre).join(', '));
    return b.join(' ') || 'aucune source';
  }

  // La citation contre UNE source `{ charge?, reps?, date?, valeur?, valeurs? }` :
  // `null` si elle l'égale, sinon ce qui diffère.
  function contreSource(q, src) {
    if (!src) return 'aucune source';
    var champ = q.objet && q.objet.champ;
    if (q.valeur !== undefined) {
      var v = nombre(q.valeur);
      if (champ === 'reps') {
        var l = Array.isArray(src.reps) ? src.reps.map(nombre) : [];
        return l.indexOf(v) >= 0 ? null : 'reps';
      }
      if (src.libre === true) return null;
      if (champ && src[champ] !== undefined) return v !== null && v === nombre(src[champ]) ? null : champ;
      if (Array.isArray(src.valeurs)) return src.valeurs.map(nombre).indexOf(v) >= 0 ? null : 'valeur';
      return v !== null && v === nombre(src.valeur) ? null : 'valeur';
    }
    if (q.charge !== undefined && src.charge !== undefined) {
      if (q.charge === null ? nombre(src.charge) !== null : !memeCharge(q.charge, src.charge)) return 'charge';
    }
    if (q.reps !== undefined && Array.isArray(src.reps) && !memesReps(q.reps, src.reps)) return 'reps';
    if (q.date !== undefined && src.date && !memeJour(q.date, src.date)) return 'date';
    return null;
  }

  // Une citation du jour contre les séries faites à une charge : la charge, et
  // des reps qui sont TOUTES parmi celles de cette charge (un multi-ensemble).
  function dansLeJour(q, g) {
    if (q.objet && q.objet.champ === 'charge') return q.valeur !== undefined && memeCharge(q.valeur, g.charge);
    if (q.charge !== undefined && !(q.charge !== null && memeCharge(q.charge, g.charge))) return false;
    var reste = g.reps.map(nombre);
    var dites = Array.isArray(q.reps) ? q.reps : (q.valeur !== undefined ? [q.valeur] : []);
    return dites.every(function (r) {
      var i = reste.indexOf(nombre(r));
      if (i < 0) return false;
      reste.splice(i, 1);
      return true;
    });
  }

  function sourcesDeLExercice(x, faits) {
    var M = Moteur();
    var k = x.consigne || {};
    var f = k.fondement || {};
    var couvertes = (x.lignes || []).filter(function (l) { return l.role !== 'hors'; });
    var lignes = couvertes.map(function (l) { return { charge: l.charge, vise: l.vise }; })
      .concat((x.planInitial || []).filter(Boolean).map(function (p) { return { charge: p.charge, vise: p.vise }; }));
    // 122 (le défaut trouvé au 115) — UNE LIGNE D'ÉLAN FIGÉE TIENT LA PLACE D'UNE LIGNE DE LA CONSIGNE (§9.14 bis :
    // l'élan remplace une ligne, jamais une ligne du coach) : l'en-tête, qui décrit la consigne sur la disposition
    // (l'élan y compte comme une ligne, I6), garde cette cible du jour. Non figée, la ligne de la consigne est déjà
    // dans `planInitial` ; figée, elle n'y était plus — et quand la ligne faite à la charge de la consigne était
    // supprimée, « Aujourd'hui : 60 kg × 5 » ne trouvait plus de ligne (60 kg × 5, puis 70 en élan, la première
    // supprimée : il restait l'élan à 70 et le test à 100).
    if (k.ligne && (x.planInitial || []).some(function (p) { return p && p.figee && p.source === 'elan'; })) {
      lignes.push({ charge: k.ligne.charge, vise: k.ligne.vise });
    }
    // Un exercice sans aucune série (toutes supprimées) n'a pas de ligne : ses
    // phrases disent alors la consigne elle-même, sa ligne et sa ligne haute.
    if (!lignes.length) {
      lignes = [k.ligne, k.haut].filter(Boolean).map(function (l) { return { charge: l.charge, vise: l.vise }; });
    }
    // Les séries faites du jour, par charge : une citation « 80 kg × 10, 10, 6 »
    // en prend une partie (une série, ou celles d'une même charge).
    var parCharge = [];
    couvertes.filter(function (l) { return l.validee && l.faite; }).forEach(function (l) {
      var g = parCharge.filter(function (x) { return memeCharge(x.charge, l.faite.charge); })[0];
      if (!g) parCharge.push(g = { charge: l.faite.charge, reps: [] });
      g.reps.push(l.faite.reps);
    });
    var jour = parCharge;
    var fait = {};
    if (f.date || k.palier !== undefined) {
      fait.palier = { charge: k.palier, reps: Array.isArray(f.reps) ? f.reps : undefined, date: f.date || null,
                      niveau: k.niveau === undefined ? undefined : k.niveau };
    }
    if (f.test) fait.test = { charge: f.test.charge, reps: [f.test.reps], date: f.test.date || null, niveau: f.test.niveau };
    if (f.zoneFigee) fait.zone_figee = { date: f.zoneFigee.date || null };
    // §9.10 (53-1) — la séance d'où la charge se reporte (tenue, ou estimée).
    if (f.report && f.report.depuis) {
      fait.report = { charge: f.report.depuis.palier, reps: [f.report.depuis.niveau], date: f.report.depuis.date || null };
    }
    // La dernière séance, série par série (la feuille « Pourquoi ») : par charge.
    var seanceParCharge = [];
    (f.seance || []).forEach(function (sr) {
      var c = nombre(sr && sr.charge_kg);
      if (c === null) return;
      var g = seanceParCharge.filter(function (x) { return memeCharge(x.charge, c); })[0];
      if (!g) seanceParCharge.push(g = { charge: c, reps: [] });
      g.reps.push(sr.reps);
    });
    if (f.palierPrecedent !== undefined && f.palierPrecedent !== null) fait.reste = { charge: f.palierPrecedent };
    if (f.serieAFond) fait.a_fond = { charge: f.serieAFond.charge, reps: [f.serieAFond.reps] };
    var meilleur = x.compteur && x.compteur.meilleur;
    if (meilleur) fait.meilleur = { charge: meilleur.palier, reps: [meilleur.niveau] };
    // §13.6 (49-U20) — le frère qui progresse : « avant » et « maintenant ».
    if (x.frere && x.frere.avant) fait['frere.avant'] = { charge: x.frere.avant.palier, reps: [x.frere.avant.niveau] };
    if (x.frere && x.frere.maintenant) fait['frere.maintenant'] = { charge: x.frere.maintenant.palier, reps: [x.frere.maintenant.niveau] };
    if (k.repli) fait.repli = { charge: k.repli.palier, reps: (k.repli.reps || []).slice(), date: k.repli.debut || null };
    var suite = x.constat && x.constat.suiteLignes ? x.constat.suiteLignes : null;
    if (suite && suite.test) fait.test_du_jour = { charge: suite.test.charge, reps: [suite.test.reps], date: suite.test.date };
    var autres = faits && x.slug && faits[x.slug] ? faits[x.slug] : {};
    Object.keys(autres).forEach(function (q) { fait[q] = autres[q]; });

    var z = M.zoneParCle(k.zone);
    var chauffes = [], chauffesReps = [];
    (x.lignes || []).forEach(function (l) { if (l.chauffe && l.chauffe.charge !== null) chauffes.push(l.chauffe.charge); });
    if (x.proposition) (x.proposition.lignes || []).forEach(function (q) { chauffes.push(q[0]); chauffesReps.push(q[1]); });
    var degVise = [];
    (x.lignes || []).forEach(function (l) { if (l.degressive && Array.isArray(l.degressive.vise)) degVise = degVise.concat(l.degressive.vise); });
    var msgR = x.reaction && x.reaction.message;
    // Les nombres de séries que l'en-tête, « Donc » et le constat écrivent
    // (PR 7) : ceux de la consigne du jour, de ses segments, et de la suite.
    var nbSeries = [];
    var structure = function (n, kk) {
      if (typeof kk === 'number') nbSeries.push(kk);
      if (typeof n === 'number' && typeof kk === 'number') nbSeries.push(n - kk);
      if (typeof n === 'number') nbSeries.push(n);
    };
    structure(k.n, k.haut ? k.haut.k : null);
    if (suite) structure(suite.n, suite.k);
    ((x.entete && x.entete.segments) || []).forEach(function (sg) { nbSeries.push(sg.nombre); });
    // Et les séries faites aujourd'hui à une même charge (« ta nouvelle charge
    // tient sur 2 séries »).
    jour.forEach(function (g) { nbSeries.push(g.reps.length); });
    var niveauxDuJour = suite ? [suite.niveau, suite.repsMax].filter(function (v) { return typeof v === 'number'; }) : [];
    var regle = {
      compteur: x.compteur ? { valeur: x.compteur.compteur } : null,
      'zone.bas': z ? { valeur: z.bas } : null,
      'zone.haut': z ? { valeur: z.haut } : null,
      chauffe: { charge: undefined, valeurs: chauffes },
      'chauffe.reps': { valeurs: chauffesReps },
      reference: x.chauffes ? { charge: x.chauffes.reference } : x.proposition ? { charge: x.proposition.reference } : null,
      degressive: x.degressive ? { charge: x.degressive.charge } : null,
      'degressive.enleve': x.degressive && x.degressive.enleve !== undefined ? { charge: x.degressive.enleve } : null,
      // Une constante du moteur écrite dans la phrase (10 %, 3 reps, 15 %) :
      // déclarée, elle n'a pas d'autre source qu'elle-même.
      constante: { libre: true },
      'zone.bas+1': z ? { valeur: z.bas + 1 } : null,
      'habitude.seances': f.habitude ? { valeur: f.habitude.seances } : null,
      'habitude.valeur': f.habitude ? { valeur: f.habitude.valeur } : null,
      seuil: f.seuil === undefined ? null : { valeur: f.seuil },
      cible: f.cible === undefined ? null : { valeur: f.cible },
      'allegee.series': k.allegee ? { valeur: k.allegee.series } : null,
      'allegee.routine': k.allegee ? { valeur: k.allegee.routine } : null,
      ecart: k.haut && k.ligne && k.haut.charge !== null ? { charge: k.haut.charge - k.ligne.charge } : null,
      'ecart.pourcent': k.haut && k.ligne && k.haut.charge !== null && k.ligne.charge
        ? { valeur: Math.round((k.haut.charge - k.ligne.charge) / k.ligne.charge * 1000) / 10 } : null,
      cran_suivant: x.constat && x.constat.suiteLignes ? { charge: x.constat.suiteLignes.cran } : null,
      'degressive.vise': { valeurs: degVise },
      'a_fond.comptees': f.serieAFond ? { valeur: f.serieAFond.comptees } : null,
      // La réaction du jour (§9.14) : la marge et le numéro de la série.
      'reaction.marge': msgR && msgR.marge !== undefined ? { valeur: msgR.marge } : null,
      'reaction.rang': msgR && typeof msgR.rang === 'number' ? { valeur: msgR.rang + 1 } : null,
      // §9.14 bis (68A) — l'élan : le nombre de lignes passées à sa charge, et
      // la charge qu'avait la ligne suivante juste avant (la suggestion d'effort).
      'reaction.series': msgR && typeof msgR.series === 'number' ? { valeur: msgR.series } : null,
      'reaction.retour': msgR && msgR.retour !== undefined && msgR.retour !== null ? { charge: msgR.retour } : null,
      series: { valeurs: nbSeries },
      'niveau.avant': typeof k.niveau === 'number' ? { valeur: k.niveau } : null,
      'niveau.jour': { valeurs: niveauxDuJour },
      manque: suite && typeof suite.zoneHaut === 'number'
        ? { valeurs: niveauxDuJour.map(function (n) { return suite.zoneHaut - n; }) } : null,
      'suite.cible': suite && suite.cible !== null ? { valeur: suite.cible } : null,
      // §9.17 — la carte du lest : le niveau des deux séances (le plus bas, pour
      // que « sur toutes tes séries, deux séances de suite » soit vrai des deux),
      // et le saut de lest que le moteur seul écrit.
      'lest.niveau': f.carteLest && Array.isArray(f.carteLest.niveaux)
        ? { valeur: Math.min.apply(null, f.carteLest.niveaux) } : null,
      'lest.saut': { charge: M.SAUT_LEST }
    };
    var msg = x.reaction && x.reaction.message;
    return { lignes: lignes, jour: jour, fait: fait, regle: regle, suite: suite,
             seconde: msg && Array.isArray(msg.charges) && msg.charges.length > 1 ? { charge: msg.charges[1] } : null,
             fondement: f, seance: seanceParCharge };
  }

  // Le rang de la série restée, relu dans le fondement (sa dernière séance),
  // jamais dans la phrase : `{ rang, sur }`, ou `null` s'il n'est pas unique.
  var ROLES_ECHELLE = { palier: true, travail: true, exploration: true, rampe: true };
  function rangDuResteLu(f) {
    var echelle = (f.seance || []).filter(function (s) { return s && ROLES_ECHELLE[s.role] === true; });
    var ou = [];
    echelle.forEach(function (s, i) { if (memeCharge(nombre(s.charge_kg), nombre(f.palierPrecedent))) ou.push(i); });
    return ou.length === 1 ? { rang: ou[0], sur: echelle.length } : null;
  }

  function cleDeCroisement(q) {
    var o = q.objet || {};
    var base = q.nature + '|' + (o.role || o.quoi || o.regle || '');
    if (SANS_CROISEMENT[base]) return null;
    // Les reps d'une liste (« 15, 15, 10 ») se déclarent une à une : elles ne
    // se comparent pas entre elles — la série entière, si elle est citée, oui.
    if (o.champ === 'reps') return null;
    return base + '|' + (o.rang === undefined ? '' : o.rang) + '|' + (o.champ || '');
  }
  function memesChiffres(a, b) {
    if (a.valeur !== undefined || b.valeur !== undefined) {
      return a.valeur === undefined || b.valeur === undefined || nombre(a.valeur) === nombre(b.valeur);
    }
    if (a.charge !== undefined && b.charge !== undefined && a.charge !== null && b.charge !== null &&
        !memeCharge(a.charge, b.charge)) return false;
    if (a.reps !== undefined && b.reps !== undefined && !memesReps(a.reps, b.reps)) return false;
    if (a.date !== undefined && b.date !== undefined && !memeJour(a.date, b.date)) return false;
    return true;
  }

  function verifierPhrases(plan, faits) {
    var ecarts = [];
    var ajouter = function (x, p, citation, attendu, cause) {
      ecarts.push({ iExo: x ? x.iExo : null, exercice: x ? x.slug : null, ou: p.ou, phrase: p.texte,
                    citation: citation, attendu: attendu, cause: cause });
    };
    // Les phrases du plan entier (le bandeau et la carte de la semaine
    // allégée) : leur capture est REFAITE ici, depuis ce que le plan porte
    // (`fin`, `cites`). Une capture qui ne redonne pas le texte du plan ne
    // prouve rien (`citations: null`) ; la phrase de la carte se compare
    // depuis « : », les noms affichés n'étant pas dans le plan.
    var duPlan = [];
    var refaite = function (ou, texte, fn, pareil) {
      var cap = null;
      try { cap = Voix().capturer(fn); } catch (ex) { cap = null; }
      var ok = cap && typeof cap.texte === 'string' && pareil(cap.texte);
      duPlan.push({ ou: ou, texte: texte, citations: ok ? cap.citations : null });
    };
    var queue = function (t) { var i = String(t).lastIndexOf(' : '); return i < 0 ? String(t) : String(t).slice(i); };
    if (plan && plan.allegee && plan.allegee.bandeau) {
      var b = plan.allegee.bandeau;
      refaite('allegee.bandeau', b, function () {
        return plan.allegee.source === SOURCE_DECHARGE
          ? Moteur().bandeauDecharge(plan.allegee.semaine, plan.allegee.semaines)
          : Moteur().bandeauAllegee(plan.allegee.fin);
      }, function (t) { return t === b; });
    }
    if (plan && plan.carte) {
      var ca = plan.carte;
      if (ca.phrase) {
        refaite('carte.phrase', ca.phrase, function () { return Moteur().phraseCarte(ca.cites || []); },
                function (t) { return queue(t) === queue(ca.phrase); });
      }
      if (ca.detail) {
        refaite('carte.detail', ca.detail, function () { return Moteur().detailCarte(); },
                function (t) { return t === ca.detail; });
      }
    }
    duPlan.forEach(function (p) { verifierTexte(null, p, ajouter); });

    ((plan && plan.exercices) || []).forEach(function (x) {
      // Une consigne SANS FONDEMENT n'est jamais rendue par l'app : seuls le
      // simulateur et les tests en forgent (ni niveau, ni séance d'avant). Les
      // paragraphes de sa feuille n'ont rien à dire, et ne se vérifient pas.
      var f = x.consigne && x.consigne.fondement;
      var forgee = !!x.consigne && (!f || !Object.keys(f).length);
      var phrases = (x.phrases || []).filter(function (p) { return !(forgee && p.ou === 'pourquoi.paragraphes'); });
      if (x.pourquoi && x.pourquoi.indisponible && !forgee) {
        ajouter(x, { ou: 'pourquoi.paragraphes', texte: '' }, x.pourquoi.indisponible, 'la feuille rédigée', 'feuille_indisponible');
      }
      if (!x.consigne) { phrases.forEach(function (p) { verifierTexte(x, p, ajouter); }); return; }
      var src = sourcesDeLExercice(x, faits);
      var vues = [];
      phrases.forEach(function (p) {
        verifierTexte(x, p, ajouter);
        (p.citations || []).forEach(function (q) {
          var dit = q.texte;
          var o = q.objet || {};
          if (!NATURES_I26[q.nature]) { ajouter(x, p, dit, 'une nature', 'sans_nature'); return; }
          // Une déclaration que la phrase n'écrit pas : un fragment rédigé
          // d'avance, puis laissé de côté — il ne prouve rien.
          if (dit && p.texte.indexOf(dit) < 0) { ajouter(x, p, dit, 'un fragment écrit dans la phrase', 'citation_non_ecrite'); return; }
          if (Array.isArray(q.reps) && q.reps.some(function (r) { return nombre(r) === null; })) {
            ajouter(x, p, dit, 'des reps', 'valeur_nulle'); return;
          }
          if (q.valeur !== undefined && nombre(q.valeur) === null) { ajouter(x, p, dit, 'un nombre', 'valeur_nulle'); return; }
          var cause = null, attendu = null;
          if (q.nature === 'cible_du_jour') {
            var cands = o.role === 'seconde' ? (src.seconde ? [src.seconde] : []) : src.lignes.map(function (l) {
              return { charge: l.charge, reps: l.vise === null || l.vise === undefined ? undefined : [l.vise] };
            });
            if (!cands.some(function (c) { return contreSource(q, c) === null; })) {
              cause = 'cible_hors_lignes';
              attendu = cands.map(decrire).join(' / ') || 'aucune ligne';
            }
          } else if (q.nature === 'cible_suivante') {
            var s = src.suite;
            var l = !s ? null : o.role === 'haut' ? (s.haut || s.ligne) : (s.ligne || s.haut);
            var sl = l ? { charge: l.charge, reps: l.vise === null || l.vise === undefined ? undefined : [l.vise] } : null;
            if (contreSource(q, sl) !== null) { cause = 'suivante_differente'; attendu = decrire(sl); }
          } else if (q.nature === 'fait_passe') {
            var parSerie = o.quoi === 'du_jour' || o.quoi === 'seance';
            var fs = o.quoi === 'du_jour' ? src.jour : o.quoi === 'seance' ? src.seance
              : (src.fait[o.quoi] ? [src.fait[o.quoi]] : []);
            var egal = parSerie ? function (c) { return dansLeJour(q, c); }
              : function (c) { return contreSource(q, c) === null; };
            if (!fs.some(egal)) {
              cause = fs.length ? 'fait_different' : 'fait_sans_source';
              attendu = fs.map(decrire).join(' / ') || 'aucune source';
            } else if (o.quoi === 'reste' && o.ordre) {
              var r = rangDuResteLu(src.fondement);
              var juste = r && (o.ordre === 'première' ? r.rang === 0 : r.rang === r.sur - 1);
              if (!juste) {
                cause = 'mot_ordre';
                attendu = r ? 'rang ' + (r.rang + 1) + ' sur ' + r.sur : 'un rang unique';
              }
            }
          } else {
            var rs = Object.prototype.hasOwnProperty.call(src.regle, o.regle) ? src.regle[o.regle] : undefined;
            if (rs === undefined) { cause = 'regle_sans_source'; attendu = 'aucune source'; }
            else if (contreSource(q, rs) !== null) { cause = 'regle_differente'; attendu = decrire(rs); }
          }
          if (cause) ajouter(x, p, dit, attendu, cause);
          vues.push({ q: q, p: p });
        });
      });
      // 3. Le jaune et le gris disent la même chose — dans les deux sens.
      var parCle = {};
      vues.forEach(function (v) {
        var cle = cleDeCroisement(v.q);
        if (cle === null) return;
        (parCle[cle] = parCle[cle] || []).push(v);
      });
      Object.keys(parCle).forEach(function (cle) {
        var l = parCle[cle];
        for (var i = 1; i < l.length; i++) {
          if (!memesChiffres(l[0].q, l[i].q)) {
            ajouter(x, l[i].p, l[i].q.texte, l[0].q.texte + ' (' + l[0].p.ou + ')', 'jaune_gris');
          }
        }
      });
    });
    return ecarts;
  }

  // Ce que le texte seul suffit à dire : un mot interdit, et chaque chiffre
  // qu'aucune citation ne couvre (écrit hors du formateur). Une phrase dont la
  // capture n'a pas pu être refaite (`citations: null`) se dit une fois.
  function verifierTexte(x, p, ajouter) {
    var m = MOTS_INTERDITS.exec(p.texte);
    if (m) ajouter(x, p, m[0], 'aucun « ' + m[0] + ' »', 'mot_interdit');
    if (p.citations === null || p.citations === undefined) {
      if (/\d/.test(p.texte)) ajouter(x, p, null, 'les citations de la phrase', 'sans_citations');
      return;
    }
    var reste = p.texte;
    p.citations.map(function (q) { return q.texte || ''; }).filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; })
      .forEach(function (t) {
        // Le fragment entier, jamais un morceau d'un autre nombre (« 10 »
        // dans « 110,4 »).
        var motif = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        reste = reste.replace(new RegExp('(^|[^\\d,])' + motif + '(?![\\d])', 'g'), '$1 ');
      });
    // Un nombre, pas un chiffre collé à une lettre : « U14 » est un nom.
    var nombres = /(^|[^A-Za-zÀ-ÿ\d,.])(\d+(?:[,.]\d+)?)(?![A-Za-zÀ-ÿ\d])/g;
    var m2;
    while ((m2 = nombres.exec(reste))) ajouter(x, p, m2[2], 'un chiffre écrit par le formateur', 'hors_formateur');
  }

  // I13, ce que la BIBLIOTHÈQUE montre d'un dossier (60-2a, précisé le
  // 07/10/2026) : au profil « Juste un carnet », ni badge de bloc ni carte de
  // fin de bloc — des faits du programme entier, que le plan n'a pas — ni, depuis le
  // 08/10/2026 (60-2b), la rangée « Faire de ce dossier un programme » : un bloc créé en
  // carnet serait invisible et impossible à arrêter. `vue` : ce que rend
  // `programmeDuDossier` (`{ badge?, fin?, creer? }`, ou `null`).
  function verifierSilenceDuProgramme(intentionProfil, vue) {
    var erreurs = [];
    if (!vue || !Moteur().coachSeTait(intentionProfil)) return erreurs;
    if (vue.badge) erreurs.push('I13 — Entretenir (profil) : un badge de bloc (' + vue.badge + ')');
    if (vue.fin) erreurs.push('I13 — Entretenir (profil) : une carte de fin de bloc');
    if (vue.creer) erreurs.push('I13 — Entretenir (profil) : la rangée « Faire de ce dossier un programme »');
    return erreurs;
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
    verifierObjectif(plan, parisSeance, erreurs);
    verifierEscalier(plan, entrees, erreurs);
    verifierProgramme(plan, entrees, erreurs);
    verifierMarches(plan, erreurs);
    verifierPoidsDuCorps(plan, erreurs);
    if (entrees && entrees.raccourci) verifierRaccourci(plan, entrees, erreurs);
    verifierDouleur(plan, entrees, erreurs);
    verifierReserve(plan, entrees, erreurs);
    verifierSalle(plan, erreurs);
    verifierEscalierSalle(plan, entrees, erreurs);
    // Prérequis d'« adapter » — LES PARIS D'UNE OCCURRENCE, et seulement d'elle
    // (I7) : la seconde occurrence d'un exercice ne doit pas se voir reprocher
    // les paris de la première.
    var seanceEntree = entrees && entrees.seance && entrees.seance.exercices ? entrees.seance : null;
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var xa = memeSeance ? homologue(avant, x, i) : null;
      var siens = parisSeance && seanceEntree
        ? Seance().parisDeLOccurrence(parisSeance, seanceEntree, i)
        : parisSeance;
      verifierExercice(x, erreurs, siens, xa);
    });
    if (avant) verifierSuite(avant, plan, erreurs);
    if (entrees !== undefined) {
      var entreesAvant = JSON.stringify(entrees);
      var refait = planDeSeance(entrees);
      if (JSON.stringify(refait) !== JSON.stringify(plan)) erreurs.push('I12 — même entrée, plan différent');
      if (JSON.stringify(entrees) !== entreesAvant) erreurs.push('I12 — le calcul a modifié ses entrées');
    }
    // I26 — BLOQUANTE depuis la PR 7 de la consolidation (02/10/2026) : la
    // liste d'attente s'est vidée, chaque écart est une violation. Le détail
    // reste à côté (`ecartsPhrases`), pour le rejeu.
    var ecartsPhrases = verifierPhrases(plan, null);
    ecartsPhrases.forEach(function (e) { erreurs.push(texteI26(e)); });
    return { ok: erreurs.length === 0, erreurs: erreurs, ecartsPhrases: ecartsPhrases };
  }

  // I45 (MOTEUR §17.2 bis, 78) — LA QUESTION DE RÉSERVE : posée seulement sur la dernière série de travail d'un
  // exercice qui a un pari ; au plus quatre par plan ; un motif connu. « Même entrée, mêmes questions » est I12.
  // Le plafond de l'invariant est écrit ici, à part de la règle : une règle qui dériverait ne le déplace pas.
  var MOTIFS_RESERVE = ['calage', 'ecart', 'rappel'];
  var I45_AU_PLUS = 4;
  function verifierReserve(plan, entrees, erreurs) {
    var xs = (plan && plan.exercices) || [];
    var exos = entrees && entrees.seance && entrees.seance.exercices ? entrees.seance.exercices : null;
    var n = 0;
    xs.forEach(function (x, i) {
      var q = x.questionReserve === undefined ? null : x.questionReserve;
      if (q === null) {
        if (x.serieReserve !== null && x.serieReserve !== undefined) {
          erreurs.push('I45 — exercice ' + i + ' (' + x.slug + ') : une série visée sans question');
        }
        return;
      }
      n++;
      if (MOTIFS_RESERVE.indexOf(q) < 0) erreurs.push('I45 — exercice ' + i + ' (' + x.slug + ') : motif inconnu « ' + q + ' »');
      if (!aUnPari(x)) erreurs.push('I45 — exercice ' + i + ' (' + x.slug + ') : une question sans pari');
      if (exos && x.serieReserve !== derniereSerieDeTravail(exos[i])) {
        erreurs.push('I45 — exercice ' + i + ' (' + x.slug + ') : la question sur la série ' + x.serieReserve +
          ', pas sur la dernière série de travail (' + derniereSerieDeTravail(exos[i]) + ')');
      }
    });
    if (n > I45_AU_PLUS) erreurs.push('I45 — ' + n + ' questions de réserve dans le plan (au plus ' + I45_AU_PLUS + ')');
  }

  // I46 (MOTEUR §10 bis, 108) — LA SALLE : pour un exercice dont la salle déclarée est en vigueur, aucune charge que
  // le coach propose n'en sort — ni la ligne ni la ligne haute de la consigne, ni une proposition de la réaction, ni
  // le fantôme d'une ligne qu'il couvre, d'une chauffe ou d'une dégressive qu'il remplit. Les séries faites et le
  // pré-remplissage d'après la dernière séance (ce que la personne a fait) ne sont pas des propositions.
  function verifierSalle(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var salle = x && x.salle;
      if (!salle) return;
      var nom = 'I46 — exercice ' + i + ' (' + x.slug + ') : ';
      var hors = function (v, ou) {
        var c = nombre(v);
        if (c !== null && c > 0 && !M.dansLaSalle(salle, c)) erreurs.push(nom + ou + ' à ' + c + ' kg, une charge que la salle n’a pas');
      };
      var k = x.consigne;
      if (k && k.etat !== 'silence' && nombre(k.palier) !== null && M.salleEnVigueur(salle, k.palier)) {
        if (k.ligne) hors(k.ligne.charge, 'la ligne de la consigne');
        if (k.haut) hors(k.haut.charge, 'la ligne haute de la consigne');
        if (k.haut && k.haut.charge === null) erreurs.push(nom + 'un test sans chiffre alors que la salle est déclarée');
      }
      // La salle vaut sur la référence de ce que le coach calcule : la charge de travail de la consigne pour ses
      // lignes, la référence des chauffes, la dernière série de travail pour la dégressive (une barre chargée au-delà
      // de la plus lourde barre fixe n'est pas concernée). Une ligne d'élan reprend une série faite (§9.14 bis).
      var enVigueur = function (ref) { return nombre(ref) !== null && !!M.salleEnVigueur(salle, ref); };
      (x.lignes || []).forEach(function (l) {
        if (l.validee || !l.fantome) return;
        var src = l.fantome.source;
        if (l.role === 'elan') return;
        if (l.role === 'hors' && src !== 'chauffe' && src !== 'degressive') return;
        var ref = src === 'chauffe' ? (x.chauffes && x.chauffes.reference)
          : src === 'degressive' ? (x.degressive && x.degressive.reference) : (k && k.palier);
        if (enVigueur(ref)) hors(l.fantome.charge, 'la série ' + l.iSerie + ' (' + (src || l.role) + ')');
      });
      var attente = x.reaction && x.reaction.attente;
      if (attente && Array.isArray(attente.charges)) {
        attente.charges.forEach(function (c) {
          if (c === null) erreurs.push(nom + 'une proposition sans chiffre alors que la salle est déclarée');
          else hors(c, 'la proposition de la réaction');
        });
      }
      ((x.reaction && x.reaction.plan) || []).forEach(function (q, j) {
        if (q && q.source === 'coach') hors(q.charge, 'la ligne du coach ' + j);
      });
    });
  }

  // I47 (MOTEUR §10 bis, révisé le 16/10/2026, 113) — AU PLAFOND DE LA SALLE (la plus lourde, au haut de la
  // fourchette), L'ESCALIER NE PROPOSE QUE SES TROIS MARCHES : la série de plus, la dégressive, un frère plus
  // chargeable — jamais le changement de schéma ni le repli (ni la phrase de sèche, ni le silence de l'escalier
  // ordinaire), aucune consigne de repli, et la carte de semaine allégée ne le prend pas pour déclencheur. Une carte
  // proposée est la première marche APRÈS la dernière proposée qui a un objet (les marches entre les deux sont sans
  // objet), jamais une marche déjà proposée ; un remplacement va vers un exercice plus chargeable que le plafond.
  // Un repli posé ferait descendre la charge demandée : on lit alors le palier seul.
  //
  // 120 (D11, décision d'Aurélien du 16/10/2026, audit 01 #1) — « « Plus léger » (après une douleur) passe avant la
  // règle « pas de repli au plafond de la salle » ; I47 l'exempte. » Le repli que la PERSONNE a choisi sur la carte de
  // reprise (§9.20, `seance.reprises[slug]` : `leger`, à la charge de son repli — I35 la vérifie) n'est pas une marche
  // de l'escalier : I47 ne le juge pas. Les autres règles du plafond (les marches, la semaine allégée) restent.
  function verifierEscalierSalle(plan, entrees, erreurs) {
    var M = Moteur();
    var reprises = (entrees && entrees.seance && entrees.seance.reprises) || {};
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      if (!k || !x.salle) return;
      var lue = k.repli ? Object.assign({}, k, { ligne: null }) : k;
      if (!M.auPlafondDeLaSalle(lue, x.salle)) return;
      var nom = 'I47 — exercice ' + i + ' (' + x.slug + ') : ';
      var m = x.escalier;
      if (m && M.MARCHES_PLAFOND.indexOf(m.marche) < 0) {
        erreurs.push(nom + 'une marche de l’escalier (' + m.marche + ') au plafond de sa salle');
      }
      var r = x.slug && Object.prototype.hasOwnProperty.call(reprises, x.slug) ? reprises[x.slug] : null;
      var choisi = !!(r && r.choix === 'leger' && r.repli && r.repli.ligne && k.ligne &&
        memeCharge(k.ligne.charge, r.repli.ligne[0]));
      if (k.repli && !choisi) erreurs.push(nom + 'un repli au plafond de sa salle');
      if (plan.carte && plan.carte.declencheur === x.slug) {
        erreurs.push(nom + 'la carte de semaine allégée déclenchée par un exercice au plafond de sa salle');
      }
      if (!m || !m.carte || M.MARCHES_PLAFOND.indexOf(m.marche) < 0) return;
      if (!m.plafond || !m.objets || !m.proposees) {
        erreurs.push(nom + 'une carte au plafond sans son plafond, ses objets ou ses marches proposées');
        return;
      }
      var iM = M.MARCHES_PLAFOND.indexOf(m.marche), iD = -1;
      M.MARCHES_PLAFOND.forEach(function (mk, j) { if (m.proposees[mk]) iD = j; });
      if (iM <= iD) erreurs.push(nom + 'la marche ' + m.marche + ' proposée de nouveau (déjà proposée, ou une marche d’après l’a été)');
      for (var j = iD + 1; j < iM; j++) {
        if (m.objets[M.MARCHES_PLAFOND[j]] === true) {
          erreurs.push(nom + 'la marche ' + M.MARCHES_PLAFOND[j] + ' sautée alors qu’elle avait un objet');
        }
      }
      if (m.objets[m.marche] !== true) erreurs.push(nom + 'la marche ' + m.marche + ' proposée sans objet');
      if (m.marche === M.MARCHE_REMPLACEMENT &&
          !(m.remplacant && m.carte.vers === m.remplacant.slug && M.plusChargeableALaSalle(m.remplacant, m.plafond.charge))) {
        erreurs.push(nom + 'un remplacement vers un exercice qui ne se charge pas plus que le plafond (' +
          (m.remplacant ? m.remplacant.slug : 'aucun') + ')');
      }
    });
  }

  function texteI26(e) {
    return 'I26 — ' + (e.exercice ? 'exercice ' + e.iExo + ' (' + e.exercice + ')' : 'le plan') + ', ' + e.ou +
      ' : « ' + e.citation + ' » (' + e.cause + ', attendu : ' + e.attendu + ')';
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
  //
  // I26 (MOTEUR §20 bis, 49-U19) — LA COHÉRENCE DES PHRASES : une violation
  // comme les autres depuis la PR 7 de la consolidation.
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
    var plans = 0, relectures = 0;
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
        if (j && j.error) j.error('[garde du coach] ' + graves.length + ' violation(s)', graves,
          { plan: plan, entrees: entrees, ecartsPhrases: v.ecartsPhrases || [] });
      }
      if (graves.length && e.marquer) e.marquer(violations.slice());
      return { violations: graves, rapports: rapports };
    }
    // I13 sur ce que la bibliothèque montre d'un dossier (60-2a) : même registre
    // de violations, même console, même marqueur ; en production, rien.
    function verifierProgramme(intentionProfil, dossier, vue) {
      if (!active) return null;
      var graves = verifierSilenceDuProgramme(intentionProfil, vue);
      var j = e.journal || null;
      if (graves.length) {
        violations = violations.concat(graves);
        if (j && j.error) j.error('[garde du coach] ' + graves.length + ' violation(s)', graves, { dossier: dossier, vue: vue });
        if (e.marquer) e.marquer(violations.slice());
      }
      return { violations: graves };
    }
    // R1-R4 sur chaque relecture de la semaine (66B, QUESTIONNAIRE §5 ter.1) : le générateur, lu À L'APPEL ; même
    // registre de violations, même console, même marqueur ; en production, rien.
    function verifierRelecture(entree, sortie) {
      if (!active) return null;
      var G = racine.THGenerateur;
      var graves = G ? G.verifierRelecture(entree, sortie) : [];
      relectures += 1;
      var j = e.journal || null;
      if (graves.length) {
        violations = violations.concat(graves);
        if (j && j.error) j.error('[garde du coach] ' + graves.length + ' violation(s)', graves, { entree: entree, sortie: sortie });
        if (e.marquer) e.marquer(violations.slice());
      }
      return { violations: graves };
    }
    // 121 (audit du 16/10/2026, 05 #18) — une violation constatée AILLEURS que dans le coach (la garde du social : une
    // lecture d'un autre compte qui porterait une donnée interdite) : même registre, même console, même marqueur ; en
    // production, rien. La règle elle-même vit chez qui la constate (`Social.champsInterditsDans`), pas ici.
    function signaler(graves, contexte) {
      if (!active || !graves || !graves.length) return null;
      violations = violations.concat(graves);
      var j = e.journal || null;
      if (j && j.error) j.error('[garde] ' + graves.length + ' violation(s)', graves, contexte || null);
      if (e.marquer) e.marquer(violations.slice());
      return { violations: graves };
    }
    // Ce que la garde a vu : le banc le lit pour s'assurer que chacune de ses
    // sections a été vérifiée.
    function etat() { return { active: active, plans: plans, relectures: relectures, violations: violations.slice() }; }
    return { active: active, verifier: verifier, verifierProgramme: verifierProgramme,
             verifierRelecture: verifierRelecture, signaler: signaler, etat: etat };
  }

  var api = {
    planDeSeance: planDeSeance,
    lignesARetirer: lignesARetirer,
    lignesAAjouter: lignesAAjouter,
    degressivesAAjouter: degressivesAAjouter,
    planDesLignes: planDesLignes,
    rejouer: rejouer,
    verifierPlan: verifierPlan,
    verifierSilenceDuProgramme: verifierSilenceDuProgramme,
    verifierPhrases: verifierPhrases,
    gardeActive: gardeActive,
    creerGarde: creerGarde,
    seriesDites: seriesDites,
    seriesDeDepart: seriesDeDepart,
    reposApres: reposApres,
    get REPOS_ENTRE_CHAUFFES() { return Moteur().REPOS_ENTRE_CHAUFFES; },
    get REPOS_APRES_CHAUFFES() { return Moteur().REPOS_APRES_CHAUFFES; },
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
