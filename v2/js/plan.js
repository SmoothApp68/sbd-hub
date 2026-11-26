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
  // 124 (audit du 16/10/2026, 01 #14) — « MÊME CHARGE » : l'arithmétique (au centième) est celle du moteur
  // (`THMoteur.memeCharge`, deux charges connues). Le plan compare aussi des lignes SANS charge : deux vides y sont
  // « la même », et le nom le dit — `memeCharge` du moteur rend faux dès qu'une charge manque.
  function memeChargeOuVides(a, b) {
    var x = nombre(a), y = nombre(b);
    if (x === null || y === null) return x === null && y === null;
    return Moteur().memeCharge(x, y);
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
      return travail !== null && fait > travail && !memeChargeOuVides(fait, travail);
    }
    if (l.role === 'coach' || l.role === 'elan') return fait >= prevue || memeChargeOuVides(fait, prevue);
    return memeChargeOuVides(fait, prevue);
  }

  function poserFantomes(lignes) {
    lignes.forEach(function (l) {
      if (l.role === 'hors') return;
      l.fantome = l.validee ? null
        : { charge: l.charge, reps: l.role === 'coach' || l.role === 'elan' ? null : l.vise, source: 'plan' };
    });
  }

  // 179 (A-F-03) — la consigne que l'en-tête décrit : celle du moteur, dont la visée du TEST se lit sur la ligne de test telle que
  // le plan l'affiche (même charge). Rien d'autre ne change : la charge, la ligne de travail et les états restent ceux de la consigne.
  function consigneDeLEntete(consigne, lignes) {
    if (!consigne || consigne.etat === 'silence' || consigne.allegee || !consigne.haut) return consigne;
    var ch = nombre(consigne.haut.charge), vise = nombre(consigne.haut.vise);
    if (ch === null || vise === null) return consigne;
    var derniere = null;
    (lignes || []).forEach(function (l) {
      if (l && l.role === 'test' && nombre(l.vise) !== null && nombre(l.charge) !== null && memeChargeOuVides(nombre(l.charge), ch)) derniere = l;
    });
    if (!derniere || nombre(derniere.vise) === vise) return consigne;
    return Object.assign({}, consigne, { haut: Object.assign({}, consigne.haut, { vise: nombre(derniere.vise) }) });
  }

  // ── LE CŒUR : LES LIGNES D'UN EXERCICE, À PARTIR D'UNE CONSIGNE DONNÉE ────
  //
  // `series` : les séries de l'exercice telles qu'elles sont (validées ou non) ;
  // `consigne`, `contexte` : ceux de l'exercice, FIGÉS pour la séance ;
  // `figees` : `{ [id de série]: { rang, role, ligne } }`, les lignes figées
  // relues dans les paris (`THSeance.figeesDe`) ; `options` : `{ slug,
  // seance, reglage }`, ce que porte le pari. Pur : ne lit rien d'autre.
  // « Une seule garde » (19/11/2026, MOTEUR §9.39, I232, I216) — LA GARDE DES LIGNES DE TRAVAIL d'un exercice : la réserve AFFICHÉE au rôle `ligne`
  // (`Moteur.reserveAffichee`), pour un exercice à charge × reps et palier > 0 (`Moteur.effortViseEligible`), sinon `null`. UNE fonction, appelée une
  // fois par exercice (avant la porte du cran), exposée sur `x.gardeDeLigne` et lue par la réaction au raté (`gardeAffichee` et le plancher), la
  // porte et `reactionPour`. DISTINCTE de `x.reserveAffichee`, la garde de la VISÉE (la dernière ligne, parfois un test : la puce, le pari).
  //   o = { mesure, reglage, protegee, famille } (Lot F, A1, I241 : `famille`, la barre de l'exercice, `familleDeLExercice`, ou `null`)
  // Contradicteur final (C3, 19/11/2026) — après un zéro rep (`Moteur.estApresZero` : la descente, la tenue, le silence au plancher), aucune garde
  // de ligne : le plan n'affiche aucun effort visé (I154 : 2 ou rien), la réaction au raté garde sa propre garde (l'échec allège).
  function gardeDeLigne(consigne, o) {
    var M = Moteur(), x = o || {};
    if (M.estApresZero(consigne)) return null;
    return consigne && M.effortViseEligible(consigne.palier, x.mesure) ? M.reserveAffichee({ zone: consigne.zone, role: 'ligne', reglage: x.reglage,
      protegee: x.protegee === true, repriseLongue: M.enRepriseLongue(consigne), famille: x.famille || null }) : null;
  }
  // Lot F, A1 (MOTEUR §9.26 ter, I241) — LA BARRE D'UN EXERCICE du plan : `Generateur.familleDeBarre` sur le catalogue des entrées (la barre, ou un frère à
  // la barre), `null` sinon (et sans générateur chargé). UNE fonction, lue par le plan et ses vérificateurs (jamais un champ du plan relu).
  function familleDeLExercice(e, slug) {
    var G = racine.THGenerateur;
    if (!slug || !G || !G.familleDeBarre) return null;
    return G.familleDeBarre(slug, (e && e.catalogue) || {}) || null;
  }

  function planDesLignes(series, consigneDonnee, contexte, figees, options) {
    var o = options || {};
    var S = Seance(), M = Moteur();
    // L'ÉTAPE DE LA CONSIGNE FIGÉE (§9.9, delta 49-13) : le repli de la
    // reprise longue ne descend jamais de plus de 10 % sous le dernier palier.
    var consigne = M.consigneFigee(consigneDonnee);
    var pdc = estPoidsDuCorps(consigne);
    var liste = series || [];
    // 251 (D2) — `o.sansTest` : la porte du cran est fermée ; la source des rôles (`couvertureSeance`) ne pose plus de test.
    var couverture = S.couvertureSeance(liste, consigne, figees || {}, o.rangsReserves || null, { sansTest: o.sansTest === true });
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
    // « Garde 0 » (19/11/2026) — la réserve AFFICHÉE de la ligne (`gardeDeLigne`, UNE fonction : le plancher des populations protégées et de la
    // reprise longue la relève, donc 0 ne reste que pour qui a choisi d'aller à l'échec). À garde 0, « à fond » est la cible : la réaction ne le
    // traite plus comme un doute (`Moteur.reactionPour`, `gardeAffichee`). Le plan d'exercice la calcule une fois et la passe (`o.gardeDeLigne`).
    var gardeLigne = o.gardeDeLigne !== undefined ? o.gardeDeLigne : gardeDeLigne(consigne, o);
    var contexteR = gardeLigne === 0 ? Object.assign({}, contexte || {}, { gardeAffichee: 0 }) : (contexte || null);
    // « Une seule voix après un zéro » (19/11/2026, I157) — sous une série à 0 rep, la réaction au zéro (`Moteur.reactionAuZero`) parle SEULE : la réaction §9.14 (le
    // message, l'élan, « plus léger ») ne se lit pas sur les séries d'avant ; les lignes qui restent sont celles de la consigne (`planInitial`). Lot F (CONTRA-723 B1) :
    // les séries faites sont passées, avec `apresUnZero` : `reactionPour` n'en tire aucune voix, seulement les bornes « à fond » à garde 0 déjà posées (I243).
    var reaction = M.reactionPour(consigne, faites, o.apresUnZero === true ? Object.assign({}, contexteR || {}, { apresUnZero: true }) : contexteR, planInitial);

    var lignes = liste.map(function (sr, i) {
      var cov = couverture[i];
      var ligne = { iSerie: i, id: sr && sr.id ? sr.id : null, type: racine.THModele.typeLu(sr), typeBase: S.typeDe(sr), validee: S.partEnBase(sr) };
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
        reactionsAvant[n] = M.reactionPour(consigne, faites.slice(0, n), contexteR, planInitial);
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
      // 154 (MOTEUR §9.26) — la RÉSERVE VISÉE de la ligne, dans le fondement de chaque pari qu'elle couvre.
      if (p.length && o.reglage !== undefined) {
        // PR 4a (§9.26 bis) — le pari écrit la visée AFFICHÉE (le plancher pour la population protégée) ; une ligne de test protégée n'en écrit aucune.
        var rvLigne = M.reserveAffichee({ zone: consigne ? consigne.zone : null, role: roles[j], reglage: o.reglage, protegee: o.protegee === true, repriseLongue: M.enRepriseLongue(consigne), famille: o.famille || null });
        if (rvLigne !== null) p[0].fondement.reserve_visee = rvLigne;
      }
      paris[l.iSerie] = p.length ? p[0] : null;
    });

    // La phrase du coach : sur la ligne `message.rang` (une POSITION).
    var m = reaction.message;
    // 175 — « ≈ » : la charge de la série est celle d'une ligne (ou du test) que la consigne marque approchée (163) ; la
    // réaction l'écrit comme elle, sans rien recalculer.
    if (m && consigne) {
      var marqueeM = [consigne.ligne, consigne.haut].some(function (l) {
        return !!l && l.approchee === true && nombre(l.charge) !== null && nombre(m.charge) !== null && memeChargeOuVides(nombre(m.charge), nombre(l.charge));
      });
      if (marqueeM) m = Object.assign({}, m, { approchee: true });
    }
    // §20 bis (49-U19) — la phrase se rédige sous capture : ses chiffres
    // déclarés restent à côté du plan (`citationsMessage`), pour I26.
    var dite = m ? Voix().capturer(function () { return M.phraseReaction(m, consigne.zone); }) : null;
    var message = m ? {
      position: m.rang, iSerie: indices[m.rang] === undefined ? null : indices[m.rang],
      type: m.type, phrase: dite.texte
    } : null;
    // Lot F, étape 1 (I243) — « à fond » à garde 0, au bas de la zone ou dessous : le message CÈDE la parole à la réaction au raté (D, L) quand elle parle.
    if (message && m.cede === true) message.cede = true;

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
    // 179 (A-F-06) — les séries de travail FAITES du jour, dans l'ordre : le constat ne cite que ce que la personne a fait.
    var series = couvertes.filter(function (l) { return l.validee && l.faite; }).map(function (l) {
      return { charge_kg: nombre(l.faite.charge), reps: nombre(l.faite.reps) };
    });
    return { montee: montee, series: series };
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
    // 165 — une séance allégée ne se juge pas et ne sert pas de référence : pas de constat (la suite lirait la dernière
    // séance normale, qui n'est pas ce que la personne vient de faire).
    if (consigne && consigne.allegee) return null;
    var c = Moteur().constatDuJour(consigne, suite.consigne, reglage || null,
      suite.cranSuivant === undefined ? null : suite.cranSuivant, faitsDuJour(lignes, consigne),
      reference === undefined ? null : reference, suite.cranSuivantApprochee === true, suite.testConfirme === true, suite.regime || null);
    if (!c) return null;
    // PR 5b-1 (I169) — le régime à venir dont l'annonce dit la date (`{ genre, debut }`), calculé au rendu, jamais écrit ; `suiteEcart` : l'écart habituel dont la fenêtre est tirée.
    c.regime = suite.regime || null;
    c.suiteEcart = typeof suite.ecart === 'number' ? suite.ecart : null;
    // PR 5a (I164, sens 4) — la condition de « Il te manque N reps » a été REJOUÉE par le moteur (`suiteDExercice`) : le plan la porte pour que I164 la relise.
    c.testConfirme = suite.testConfirme === true;
    // Ce que la prochaine séance proposera, en charges : de quoi vérifier
    // qu'elle ne propose pas moins qu'une montée tenue (I10 b).
    var k = suite.consigne;
    c.suiteCharges = [k.ligne ? k.ligne.charge : null, k.haut ? k.haut.charge : null];
    c.suiteEtat = k.etat || null;
    // PR 5a-bis (I167, MOTEUR §9.48 bis) — LA SUITE LIT AUJOURD'HUI : le jour civil de la consigne dont l'annonce est écrite, le jour civil de la séance, et
    // « une charge est répétée aujourd'hui » (§7.6 : au moins deux séries de travail faites à la même charge). `verifierSuiteAujourdhui` les relit.
    var M167 = Moteur();
    var charges167 = {}, repetee167 = false;
    faitsDuJour(lignes, consigne).series.forEach(function (q) {
      if (q.charge_kg === null || q.charge_kg === undefined) return;
      var cle = String(q.charge_kg);
      charges167[cle] = (charges167[cle] || 0) + 1;
      if (charges167[cle] >= 2) repetee167 = true;
    });
    c.suiteDate = k.fondement && k.fondement.date ? M167.jourCivil(k.fondement.date) : null;
    c.jourDuConstat = reference ? M167.jourCivil(reference) : null;
    c.chargeRepetee = repetee167;
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
      // §9.2 ter — la cible d'avant de la consigne suivante (ce qu'elle avait demandé à la séance du jour) : « une rep de plus » ne se dit que devant une visée qui la dépasse.
      cibleAvant: k.fondement && typeof k.fondement.cibleAvant === 'number' ? k.fondement.cibleAvant : null,
      niveauAvant: k.fondement && k.fondement.chuteDeFin && typeof k.fondement.chuteDeFin.niveauAvant === 'number' ? k.fondement.chuteDeFin.niveauAvant : null,
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
        raison = 'je reviens à ' + kg(l.charge, cL) +
          (montee && montee.faite ? ' après ' + kgFois(montee.faite.charge, montee.faite.reps, DU_JOUR) : '');
      } else if (l.role === 'elan') {
        // §9.14 bis (68A) — sur le patron de la ligne revenue : « je garde
        // 84 kg après 84 kg × 12 ». La série dite est celle qui a porté
        // l'élan : la dernière faite à cette charge qui ne le suivait pas.
        var porteuse = null;
        for (var b = k - 1; b >= 0; b--) {
          var v = couvertes[b];
          if (!v.validee || !v.faite || !memeChargeOuVides(nombre(v.faite.charge), nombre(l.charge))) continue;
          if (!porteuse) porteuse = v;
          if (!(v.role === 'elan' && memeChargeOuVides(nombre(v.charge), nombre(l.charge)))) { porteuse = v; break; }
        }
        raison = 'je garde ' + kg(l.charge, cL) +
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

  // 201 — « D'OÙ ÇA VIENT » : les sources des règles que ce « Pourquoi » applique, lues au registre `SOURCES` du moteur. Le plan
  // choisit les CLÉS (ce qu'il applique), le moteur les dit ; une clé sans source n'ajoute rien — jamais une source devinée.
  // Absent quand aucune règle du « Pourquoi » n'a de source ; l'écran le lit, il ne calcule rien.
  function clesDeSources(x) {
    var c = x.consigne, cles = [];
    if (!c) return cles;
    if (c.zone) cles.push('zone.bas');
    if (c.allegee) cles.push('allegee', 'bloc.semaines');
    if (x.reserveAffichee !== null && x.reserveAffichee !== undefined && x.reserveAffichee >= 1) cles.push('reserve');
    if (x.reculs && x.reculs.mode === 'max_du_jour') {
      cles.push('recul.max');
      if (x.reculs.derniere) cles.push('recul.correction');
    }
    if (x.degressive) cles.push('degressive');
    if (x.reposLong) cles.push('repos_long');
    if (x.escalier && x.escalier.carte) cles.push('marche.seuil');
    if (x.semaineDeTest) cles.push('test');
    return cles;
  }
  function poserLesSources(x) {
    if (!x.pourquoi) return;
    var s = Moteur().sourcesDeRegles(clesDeSources(x));
    if (s.length) x.pourquoi.sources = s;
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
  // se tait. La RÉFÉRENCE des chauffes est UNE (15/11/2026, MOTEUR §9.41 bis,
  // I184, `Moteur.referenceDesChauffes`) : la première charge SAISIE de la
  // première ligne de travail ; à défaut la charge de la consigne FIGÉE (la
  // ligne, pas le test) ; à défaut rien. Une chauffe faite reste figée (§9.15.7).
  var MATERIELS_DE_CHAUFFE = ['barre', 'machine', 'machine_smith', 'poulie', 'haltere', 'haltere_seul'];   // 16/11/2026 : haltere_seul = un exercice à un bras (l'haltère tenu)

  // 237 (§9.41) — pose la proposition du moteur dans la sortie de l'étape : la phrase et le Pourquoi sont citées.
  function proposerChauffes(sortie, cap, reference) {
    var r = cap.texte;
    if (!r || r.mode === 'rien' || !r.lignes.length) return;
    var capW = Voix().capturer(function () { return Moteur().pourquoiDesChauffes(r); });
    sortie.proposition = { situation: r.situation, reference: reference, lignes: r.lignes, phrase: r.phrase,
                           pourquoi: capW.texte, raison: r.raison, mode: r.mode, annulable: r.annulable, peuDeTemps: !!r.peuDeTemps,
                           programme: r.programme === true };
    sortie.citations.proposition = cap.citations;
    sortie.citations.pourquoiChauffes = capW.citations;
  }

  // 237 (§9.41, règle 6) — « Annuler » ; 15/11/2026 (§9.41 bis, règle 11, I190) — POUR LES TROIS SOURCES : l'ajout automatique (`chauffes_auto`), « Ajouter »
  // et « + Chauffe » (`chauffes_ajoutees`). Tant qu'une ligne de chauffe posée reste à faire, le plan EXPOSE le geste ; le DERNIER des gestes (pose,
  // `chauffes_annulees`) fait foi. `null` sinon. Un fait de la séance, lu sur ses gestes ; la phrase se rédige sous capture (I26) et entre dans
  // `x.phrases`. `origine` : `auto` (compte comme un « Non merci » à l'annulation) ou `posee` (jamais).
  function chauffesPoseesDe(gestes, slug, x) {
    var gs = Array.isArray(gestes) ? gestes : [], origine = null;
    gs.forEach(function (g) {
      if (!g || g.slug !== slug) return;
      if (g.geste === 'chauffes_auto') origine = 'auto';
      else if (g.geste === 'chauffes_ajoutees') origine = 'posee';
      else if (g.geste === 'chauffes_annulees') origine = null;
    });
    var enAttente = (x.lignes || []).some(function (l) { return l.type === 'echauffement' && !l.validee; });
    if (!origine || !enAttente) return null;
    var ref = x.chauffesReference ? { charge: x.chauffesReference.charge, source: x.chauffesReference.source } : null;
    var cap = Voix().capturer(function () { return Moteur().phraseDesChauffesPosees(origine, ref); });
    if (Array.isArray(x.phrases)) x.phrases.push({ ou: 'chauffes.posees', texte: cap.texte, citations: cap.citations });
    return { slug: slug, origine: origine, texte: cap.texte, annuler: 'Annuler' };
  }

  // 237-bis (§9.41, règle 6) — LE SILENCE ANNONCÉ : au 2e « Non merci » (ou « Annuler » des chauffes automatiques), le geste `chauffes_silence`
  // est noté ; tant qu'aucune série de l'exercice n'est faite et que la personne n'a pas annulé (`chauffes_silence_annule`, le DERNIER des
  // deux fait foi), le plan expose la phrase du moteur (une seule source) et « Annuler ». `null` sinon.
  function silenceChauffesDe(gestes, slug, nomExo, x) {
    var gs = Array.isArray(gestes) ? gestes : [], etat = null;
    gs.forEach(function (g) {
      if (g && g.slug === slug && g.geste === 'chauffes_silence') etat = true;
      else if (g && g.slug === slug && g.geste === 'chauffes_silence_annule') etat = false;
    });
    // 15/11/2026 (I130 complété) — dès qu'une ligne de chauffe est posée, la phrase se retire : elle dirait « je ne te les propose plus » à côté
    // de chauffes posées. Elle revient si elles sont retirées.
    if (etat !== true || (x.lignes || []).some(function (l) { return l.validee || l.type === 'echauffement'; })) return null;
    return { slug: slug, texte: Moteur().phraseDuSilenceDesChauffes(nomExo), annuler: 'Annuler' };
  }

  // 15/11/2026 (§9.41 bis, règle 8) — LA CHARGE SAISIE de la première ligne de travail (`Modele.estTravail`, jamais le type en dur) : une valeur
  // non nulle de `charge_kg` est tapée par la personne (le fantôme n'est jamais écrit). Une ligne posée par le coach (`test_pose`) n'est pas
  // une saisie. Première ligne vide, deuxième tapée : on ne devine pas (`null`).
  function premiereChargeSaisie(lignes, liste) {
    for (var i = 0; i < lignes.length; i++) {
      var s = liste[lignes[i].iSerie];
      if (s && racine.THModele.estTravail(s) && s.test_pose !== true) return nombre(s.charge_kg);
    }
    return null;
  }

  // 15/11/2026 (§9.41 bis, règle 9) — la montée DEMANDÉE (« + Chauffe ») : la même décision que la proposition, lue sous `x.surDemande`. Sans
  // `phrase` : l'écran ne la dit pas (il pose les lignes et le plan les remplit en fantôme).
  function poserSurDemande(sortie, cap, reference) {
    var r = cap.texte;
    if (!r || r.mode === 'rien' || !r.lignes.length) return;
    sortie.surDemande = { situation: r.situation, reference: reference, lignes: r.lignes, raison: r.raison, mode: r.mode, peuDeTemps: !!r.peuDeTemps };
  }

  // 20/11/2026 (MOTEUR §9.15 delta) — LES REPS VISÉES DE LA 1RE LIGNE DE TRAVAIL (la zone de la dernière marche, les reps du mouvement au poids
  // du corps) : la visée de la ligne ; à défaut les reps tapées ; à défaut celles de la routine ; sinon rien.
  function repsDeLaPremiereLigne(lignes, liste) {
    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i], s = liste[l.iSerie];
      if (!s || !racine.THModele.estTravail(s) || s.test_pose === true || l.type === 'echauffement') continue;
      var v = nombre(l.vise);
      if (v === null) v = nombre(s.reps);
      if (v === null) v = nombre(s.reps_visees);
      return v;
    }
    return null;
  }

  // Pose ce que `chauffesDe` a rendu sur les lignes de chauffe (charge, fantôme, phrase) — une fonction pour la barre, le lest et le poids du corps.
  function poserLesChauffes(sortie, deChauffe, capR, reference, liste) {
    var r = capR.texte;
    deChauffe.forEach(function (l, k) {
      var rl = r.lignes[k] || {};
      var c = rl.charge === undefined ? null : rl.charge;
      l.chauffe = { charge: c };
      // §9.15.5 (94) — une chauffe que la règle ne peut pas distinguer de la précédente : vide, et dit.
      if (rl.trop_leger) l.chauffe.trop_leger = true;
      if (rl.trop_proche) l.chauffe.trop_proche = true;
      if (rl.peu_de_temps) l.chauffe.peu_de_temps = true;
      if (rl.corps) l.chauffe.corps = true;
      if (rl.barre) l.chauffe.barre = true;
      if (rl.ajoutee) l.chauffe.ajoutee = true;
      if (Array.isArray(rl.entre)) l.chauffe.entre = rl.entre.slice();
      l.chauffe.repsDites = rl.reps === undefined ? null : rl.reps;
      // Ses reps, quand la routine n'en porte pas : celles de la règle.
      if (rl.reps_coach) l.chauffe.reps = rl.reps;
      if (!l.validee && (c !== null || (rl.corps && rl.reps_coach))) l.fantome = { charge: c, reps: rl.reps_coach ? rl.reps : null, source: 'chauffe' };
    });
    // 49-U18 (02/10/2026) — LA PHRASE DES CHAUFFES DISPARAÎT DÈS QU'UNE CHAUFFE DE L'EXERCICE EST VALIDÉE ; reste celle d'une chauffe
    // ajoutée par « + Chauffe » (20/11/2026) ou « trop proche » (265).
    var uneFaite = deChauffe.some(function (l) { return l.validee; });
    sortie.chauffes = {
      situation: r.situation, reference: reference, phrase: uneFaite ? (r.phrase_apres_faites || null) : r.phrase,
      non_remplies: r.non_remplies, prevues: r.prevues, trop_legeres: r.trop_legeres || 0, trop_proches: r.trop_proches || 0,
      peu_de_temps: r.peu_de_temps || 0, derniere: r.derniere === undefined ? null : r.derniere, origine: r.origine || null,
      iSerie: deChauffe[0].iSerie
    };
    if (sortie.chauffes.phrase) sortie.citations.chauffes = uneFaite ? (r.citations_apres_faites || []) : capR.citations;
  }

  function chauffesEtDegressive(lignes, series, consigne, materiel) {
    var sortie = { chauffes: null, proposition: null, surDemande: null, reference: null, degressive: null, citations: {} };
    if (!materiel) return sortie;
    // 119 (audit du 16/10/2026, E6) — UNE MESURE SANS CHARGE N'A NI CHAUFFES NI DÉGRESSIVE DU COACH : une planche, un
    // tapis (une durée, une distance : hors du coach, I13) ou un exercice au poids du corps (I28, §9.17 : pas de
    // dégressive sous un corps). Seule `charge_reps` a une charge à baisser ; une mesure inconnue (`null`, hors
    // catalogue) garde le contrat d'avant.
    var M = Moteur();
    var liste = series || [];
    // 21/11/2026 — LES LIGNES POSÉES PAR LA SEMAINE DE MESURE (`test_pose` : la montée vers l'essai, aux charges de `Moteur.testMontee`) portent leur
    // charge et ne sont pas des chauffes calées sur la charge de travail : ni fantôme, ni phrase « Chauffes calées sur 100 kg : … » qui contredirait
    // les lignes posées, ni proposition par-dessus. Les chauffes d'une autre main restent lues comme avant.
    var duTest = function (l) { var sr = liste[l.iSerie]; return !!sr && sr.test_pose === true; };
    var montee = lignes.filter(function (l) { return l.type === 'echauffement' && duTest(l); });
    var deChauffe = lignes.filter(function (l) { return l.type === 'echauffement' && !duTest(l); });
    if (montee.length && !deChauffe.length) return sortie;
    var rienDeFait = !lignes.some(function (l) { return l.validee; });
    var repsVisees = repsDeLaPremiereLigne(lignes, liste);
    // 20/11/2026 — les lignes ajoutées par « + Chauffe » (le geste `chauffe_plus` nomme la série) : hors de la montée, au milieu du dernier saut.
    var plusIds = Array.isArray(materiel.plusIds) ? materiel.plusIds : [];
    var routineDe = function () {
      return deChauffe.map(function (l) { return nombre(liste[l.iSerie] && liste[l.iSerie].reps_visees); });
    };
    var faitesDe = function () {
      return deChauffe.map(function (l) {
        if (!l.validee) return null;
        var sr = liste[l.iSerie] || {};
        return { charge: nombre(sr.charge_kg), reps: nombre(sr.reps) };
      });
    };
    // 237 (§9.41, règle 3) — AU POIDS DU CORPS ; 20/11/2026 (§9.17 delta) — une série du mouvement à ⌈visée / 3⌉ reps (2 à 5), la même
    // décision que les barres (`monteeDeChauffe`).
    if (materiel.corps === true) {
      if (deChauffe.length) {
        var capCo = Voix().capturer(function () {
          return M.chauffesDe({ nature: 'corps', reps: repsVisees, routine: routineDe(), faites: faitesDe() });
        });
        poserLesChauffes(sortie, deChauffe, capCo, null, liste);
        return sortie;
      }
      if (!rienDeFait) return sortie;
      var entreeCorps = Object.assign({}, materiel, { corps: true, reference: null, premier: !materiel.deja_sollicite, silence: !!materiel.refus, e1rm: null, reps: repsVisees });
      var capC = Voix().capturer(function () { return M.propositionDeChauffes(entreeCorps); });
      proposerChauffes(sortie, capC, null);
      poserSurDemande(sortie, Voix().capturer(function () { return M.propositionDeChauffes(Object.assign({}, entreeCorps, { demande: true })); }), null);
      return sortie;
    }
    if (materiel.mesure && materiel.mesure !== 'charge_reps') return sortie;
    // 196 (MOTEUR §9.33) — LES MINI-SÉRIES DU REST-PAUSE ne sont jamais des dégressives du coach (pas de baisse de charge, pas de
    // phrase) : la charge est celle de la série de travail qui les précède, en fantôme tant qu'elles ne sont pas faites.
    // 21/11/2026 : le coach n'en POSE plus (décision du fondateur) ; cette lecture reste pour ce qui se lit « rest-pause » (une dégressive
    // faite à la même charge, `Modele.restPauseDe`) et pour un brouillon en cours qui porte encore une marque `rest_pause` : affichée, neutre.
    var rp = racine.THModele.restPauseDe(liste);
    lignes.forEach(function (l, i) {
      if (!rp[i] || rp[i].role !== 'mini') return;
      l.restPause = true;
      var j = i - 1;
      while (j > 0 && rp[j] && rp[j].role === 'mini') j--;
      var tete = lignes[j];
      if (!tete || l.validee) return;
      var c = tete.validee ? nombre((liste[j] || {}).charge_kg) : (tete.fantome ? nombre(tete.fantome.charge) : nombre(tete.charge));
      if (c === null) c = nombre((liste[j] || {}).charge_kg);
      if (c !== null && c > 0) l.fantome = { charge: c, reps: null, source: 'rest_pause' };
    });
    var refPlan = consigne && consigne.etat !== 'silence' ? chargeDeTravail(consigne) : null;
    // §9.17 — LE LEST N'A PAS DE DÉGRESSIVE : 2,5 kg de lest, 22,5 % de moins, c'est « 0 kg ». 20/11/2026 (§9.17 delta, décision d'Aurélien) :
    // il a des CHAUFFES — l'ancienne raison (« la montée se fait sur l'exercice libre, qui est une chauffe en soi ») ne tient plus depuis que
    // le lesté REMPLACE l'exercice libre (« J'ai du lest ») : une traction à +20 kg démarrait à froid. La série du mouvement au poids du corps
    // (lest 0), puis, dès 20 kg de lest, la moitié du lest × 2 — la moitié reste à 10 kg et plus, loin des « 0 kg » d'un petit lest.
    if (materiel.lest === true || materiel.equipement === M.EQUIPEMENT_LEST) {
      var refL = M.referenceDesChauffes({ saisie: premiereChargeSaisie(lignes, liste), plan: refPlan });
      var lest = refL.charge !== null ? refL.charge : (refPlan === 0 ? 0 : null);
      if (lest === null) return sortie;
      if (refL.charge !== null) sortie.reference = refL;
      if (deChauffe.length) {
        var capLe = Voix().capturer(function () {
          return M.chauffesDe({ nature: 'lest', reference: lest, reps: repsVisees, routine: routineDe(), faites: faitesDe(), peuDeTemps: materiel.peuDeTemps === true });
        });
        poserLesChauffes(sortie, deChauffe, capLe, lest, liste);
      } else if (rienDeFait) {
        var entreeL = { lest: true, reference: lest, reps: repsVisees, premier: !materiel.deja_sollicite, premierExercice: materiel.premierExercice,
                        menagee: materiel.menagee, forme: materiel.forme, peuDeTemps: materiel.peuDeTemps, silence: !!materiel.refus,
                        ajoutees: materiel.ajoutees, muscle: materiel.muscle, pompes: materiel.pompes, duCoach: materiel.duCoach };
        if (consigne) proposerChauffes(sortie, Voix().capturer(function () { return M.propositionDeChauffes(entreeL); }), lest);
        poserSurDemande(sortie, Voix().capturer(function () { return M.propositionDeChauffes(Object.assign({}, entreeL, { demande: true })); }), lest);
      }
      return sortie;
    }

    // La montée ne connaît que la barre, la machine (Smith comprise), la poulie et les haltères (§9.15.1) : élastique, disque, kettlebell,
    // rien — pas de chauffe calculée. La dégressive, elle, vaut pour tout ce qui n'est pas une barre.
    // 15/11/2026 (I184) — la référence est celle du moteur : la saisie d'abord, la consigne figée en repli (jamais celle d'une consigne « silence »).
    var refObj = MATERIELS_DE_CHAUFFE.indexOf(materiel.equipement) >= 0
      ? M.referenceDesChauffes({ saisie: premiereChargeSaisie(lignes, liste), plan: refPlan })
      : { charge: null, source: null, plan: null };
    var reference = refObj.charge;
    if (reference !== null) sortie.reference = refObj;
    // §9.17 — PAS DE CHAUFFES AU POIDS DU CORPS (0) NI SUR UNE AIDE (négative) : la référence d'une chauffe est une charge qu'on monte (I30).
    if (reference !== null && reference > 0) {
      var commun = {
        equipement: materiel.equipement, reference: reference,
        deja_sollicite: !!materiel.deja_sollicite, sol: !!materiel.sol, cran: materiel.pas,
        // §10 bis (108) — la salle déclarée pour l'exercice, ou `null`.
        salle: materiel.salle || null,
        isolation: materiel.isolation, premierExercice: materiel.premierExercice,
        // 20/11/2026 — la zone (les reps visées de la 1re ligne de travail), « peu de temps », et ce qui borne la chauffe ajoutée (I247).
        reps: repsVisees, peuDeTemps: materiel.peuDeTemps === true, protegee: materiel.protegee === true, repriseLongue: M.enRepriseLongue(consigne)
      };
      if (deChauffe.length) {
        var entree = Object.assign({}, commun, {
          // CONTRA-725 D5 — des lignes sont « du coach » seulement s'il les a posées dans cette séance (« Ajouter », l'ajout automatique, le
          // programme : `materiel.coach` lit le geste) ; des lignes que la personne a écrites, même sur un exercice d'un programme du coach,
          // sont un nombre fixé (88 %), jamais lues à la part de la zone.
          coach: materiel.coach === true,
          routine: routineDe(),
          plus: deChauffe.map(function (l) { var sr = liste[l.iSerie]; return !!(sr && sr.id && plusIds.indexOf(sr.id) >= 0); }),
          // 265 (§9.15.7) — les chauffes FAITES (charge et reps réelles), à leur place ; `null` pour une ligne pas faite.
          faites: faitesDe()
        });
        poserLesChauffes(sortie, deChauffe, Voix().capturer(function () { return M.chauffesDe(entree); }), reference, liste);
      } else if (rienDeFait) {
        // §9.41 — aucune ligne de chauffe : une PROPOSITION (ou, après deux séances où la personne les a ajoutées, ou dans un programme du
        // coach, un ajout avec « Annuler »), jamais des séries insérées d'office par le plan. Tant qu'aucune série de l'exercice n'est faite.
        var entreeP = Object.assign({}, commun, {
          e1rm: materiel.e1rm, premier: !materiel.deja_sollicite, dejaTravaille: materiel.deja_travaille === true, menagee: materiel.menagee,
          forme: materiel.forme, silence: !!materiel.refus, ajoutees: materiel.ajoutees, muscle: materiel.muscle, duCoach: materiel.duCoach === true,
          referenceSource: refObj.source, referencePlan: refObj.plan
        });
        // La carte non sollicitée n'existe que pour un exercice que le coach suit (une consigne) ; la demande, un geste de la personne, calcule toujours.
        if (consigne) proposerChauffes(sortie, Voix().capturer(function () { return M.propositionDeChauffes(entreeP); }), reference);
        poserSurDemande(sortie, Voix().capturer(function () { return M.propositionDeChauffes(Object.assign({}, entreeP, { demande: true })); }), reference);
      }
    }

    // §9.15.3 — LA DÉGRESSIVE : la première ligne dégressive qui suit la
    // dernière série de travail. Sa référence : cette série, faite (sa charge
    // et ses reps) ou à faire (la charge et la visée de sa ligne).
    var derniere = -1;
    // 193-1 — la référence de la dégressive : la dernière série de travail OU de recul (la dernière faite ou proposée).
    lignes.forEach(function (l, i) { if (l.type === 'travail' || l.type === 'recul') derniere = i; });
    if (derniere < 0) return sortie;
    var deg = null, suivantes = [];
    for (var i = derniere + 1; i < lignes.length; i++) {
      if (lignes[i].type !== 'degressive' || (rp[i] && rp[i].role === 'mini')) continue;
      if (!deg) deg = lignes[i]; else suivantes.push(lignes[i]);
    }
    if (!deg) return sortie;
    // 174 — « alléger » retire la dégressive : une ligne dégressive pas encore faite n'a plus de phrase ni de fantôme.
    if (consigne && consigne.alleger && !deg.validee) return sortie;
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
                          charge: d.charge, repos: deg.degressive.repos, phrase: d.phrase,
                          // 259 — l'annonce de la série d'avant (reps visées de la série, charge déjà calculée) ; l'écran la pose sur la ligne `apres`.
                          annonce: M.phraseAvantDegressive(reps, d.charge) };
    // §9.15.3 (94) — à la barre, ce qu'on enlève de chaque côté ; une ligne
    // que le coach ne peut pas remplir porte ses deux gestes (« En faire une
    // série normale », « La retirer »), tant qu'elle n'est pas faite.
    if (d.enleve !== undefined) sortie.degressive.enleve = d.enleve;
    // 245 (I132) — hors barre : la cible et les charges disponibles de la fenêtre, pour que l'invariant vérifie le choix.
    // Non énumérable : le plan garde sa forme (les comparaisons, les copies JSON) ; l'invariant le lit sur le plan vivant.
    if (d.choix) Object.defineProperty(sortie.degressive, 'choix', { value: d.choix, enumerable: false });
    // §10 bis (108) — à la barre fixe, on change de barre (« Prends la barre de 20 kg. »).
    if (d.barreFixe) sortie.degressive.barreFixe = true;
    if (d.gestes && !deg.validee) sortie.degressive.gestes = d.gestes.slice();
    if (materiel.lourde) sortie.degressive.lourde = true;

    // 151 (MOTEUR §9.15.3, 23/10/2026, décision d'Aurélien) — LA SECONDE BAISSE : la ligne dégressive qui suit la
    // première (posée par la routine ou l'utilisateur ; le coach n'en ajoute jamais), −20 % de la charge de la
    // première (faite, ou à faire), « Vise 4 à 6 ». La chaîne s'arrête si la première est validée sous 4 reps ; à la
    // barre lourde, une seule baisse ; une troisième ligne n'est jamais remplie. Une ligne vide dit pourquoi et porte
    // ses deux gestes.
    var plus = [];
    var precedente = deg, refPrec = sortie.degressive.charge;
    if (deg.validee) {
      var faite = nombre((liste[deg.iSerie] || {}).charge_kg);
      refPrec = faite;
    }
    var repsPremiere = deg.validee ? nombre((liste[deg.iSerie] || {}).reps) : null;
    suivantes.forEach(function (ligne, k) {
      var rang = k + 2;
      var dk, citK = [];
      if ((refPrec === null || refPrec === undefined) && rang === 2 && !materiel.lourde) {
        // La première n'a pas de charge (« Trop léger… ») : la suivante le dit aussi, avec les mêmes gestes.
        dk = { charge: null, vise: null, repos: null, phrase: d.phrase, gestes: ['serie_normale', 'retirer'] };
      } else {
        var capK = Voix().capturer(function () {
          return M.degressiveDe({ equipement: materiel.equipement, derniere_serie: refPrec, reps_travail: reps,
                                  cran: materiel.pas, salle: materiel.salle || null, rang: rang,
                                  lourde: !!materiel.lourde, reps_premiere: repsPremiere });
        });
        dk = capK.texte;
        citK = capK.citations;
      }
      ligne.degressive = { charge: dk.charge, vise: dk.vise || null,
                           repos: dk.repos === undefined ? null : dk.repos, phrase: dk.phrase };
      if (!ligne.validee) ligne.fantome = { charge: dk.charge, reps: null, source: 'degressive' };
      var item = { iSerie: ligne.iSerie, apres: precedente.iSerie, rang: rang, reference: refPrec,
                   charge: dk.charge, repos: ligne.degressive.repos, phrase: dk.phrase,
                   premiereReps: repsPremiere, lourde: !!materiel.lourde };
      if (dk.enleve !== undefined) item.enleve = dk.enleve;
      if (dk.choix) Object.defineProperty(item, 'choix', { value: dk.choix, enumerable: false });
      if (dk.barreFixe) item.barreFixe = true;
      if (dk.gestes && !ligne.validee) item.gestes = dk.gestes.slice();
      item.citations = citK;
      plus.push(item);
      // La suivante se cale sur celle-ci, faite (sa charge) ou à faire (sa ligne).
      precedente = ligne;
      refPrec = ligne.validee ? nombre((liste[ligne.iSerie] || {}).charge_kg) : dk.charge;
      repsPremiere = null;
    });
    if (plus.length) sortie.degressivesPlus = plus;
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
    var chaine = (x && x.degressive ? [x.degressive] : []).concat((x && x.degressivesPlus) || []);
    for (var c = 0; c < chaine.length; c++) {
      var d = chaine[c];
      if (d.apres === iSerie && d.repos === 0 && d.charge !== null &&
          lignes[d.iSerie] && !lignes[d.iSerie].validee) return null;
    }
    var l = lignes[iSerie];
    if (l && l.type === 'echauffement') {
      var derniere = -1;
      lignes.forEach(function (h, i) { if (h.type === 'echauffement') derniere = i; });
      return iSerie === derniere ? Moteur().REPOS_APRES_CHAUFFES : Moteur().REPOS_ENTRE_CHAUFFES;
    }
    return reposExo === undefined ? null : reposExo;
  }

  // 151 — la référence d'une ligne dégressive : la dernière série de travail pour la première baisse, la baisse
  // d'avant pour la suivante.
  function refDeLaDegressive(x, iSerie) {
    var q = ((x && x.degressivesPlus) || []).filter(function (p) { return p.iSerie === iSerie; })[0];
    return q ? q.reference : (x && x.degressive ? x.degressive.reference : null);
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
  // ── 187 — LE CALAGE DE LA PREMIÈRE SÉANCE (MOTEUR §9.21 bis) ─────────────────────────────────────────
  //
  // S'ouvre SEULEMENT sur une consigne « première fois » (aucune séance de l'exercice) qui n'a pas de charge de départ
  // (sinon la consigne est `depart_routine`), pour une charge × reps au matériel connu. Le plan lit les séries de travail
  // déjà validées (leur charge, leurs reps, leur réserve), appelle `Moteur.calagePremiereFois` et PROPOSE la suivante en
  // gris sur la première ligne de travail non validée (`prerempli`, jamais une série écrite) ; une série validée est figée.
  // `x.calage` : le résultat, ses mots, la ligne qui porte la proposition (`iSerie`), la série dont on demande la réserve
  // (`question`), la charge habituelle déclarée. Aucune charge devinée par le poids du corps, le sexe ou la machine.
  // Mix (6-8) : au-dessus de la zone Lourd (3-5), MOTEUR §9.1 — lu sur `Moteur.ZONES` (mix.bas), jamais recopié.
  function repsSansLourd() {
    return Moteur().ZONES.filter(function (q) { return q.cle === 'mix'; })[0].bas;
  }
  function calageDuPlan(x, exo, c, e, slug, seance) {
    var M = Moteur(), S = Seance();
    var cs = c && c.consigne;
    if (!cs || cs.etat !== 'silence' || cs.raison !== 'premiere_fois') return null;
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    if (!cat || !cat.equipement || (cat.mesure && cat.mesure !== 'charge_reps')) return null;
    var series = (exo && exo.series) || [];
    // La structure VIVANTE de la séance : les séries de travail et les chauffes de l'exercice à cet instant (routine, personne
    // ou coach, en plus ou en moins). Le calage n'en crée, n'en ajoute ni n'en retire aucune.
    var travail = [], faites = [], porteuse = null, prochain = null;
    series.forEach(function (sr, j) {
      var chauffe = S.typeDe(sr) === 'echauffement';
      // 193-1 — un recul n'est pas une série de travail du calage (il suit une grosse série qui n'existe pas encore).
      var tr = racine.THModele.estTravail(sr) && !racine.THModele.estRecul(sr);
      if (!chauffe && !tr) return;
      if (tr) travail.push(j);
      if (S.partEnBase(sr)) faites.push({ j: j, chauffe: chauffe });
      else if (porteuse === null) { porteuse = j; prochain = chauffe ? 'chauffe' : 'travail'; }
    });
    if (!travail.length) return null;
    var reps = null;
    travail.forEach(function (j) {
      var v = nombre(series[j].reps_visees);
      if (reps === null && v !== null && v >= 1) reps = v;
    });
    // 187 (A4) — un exercice qui charge une zone à ménager ne reçoit pas de série lourde : jamais moins de 6 reps (Mix).
    var zmCal = e.zonesMenagees && Object.prototype.hasOwnProperty.call(e.zonesMenagees, slug);
    if (zmCal && (reps === null || reps < repsSansLourd())) reps = repsSansLourd();
    var habs = e.habituelles && typeof e.habituelles === 'object' ? e.habituelles : {};
    var habituelle = Object.prototype.hasOwnProperty.call(habs, slug) ? nombre(habs[slug]) : null;
    // PR 2 (MOTEUR §9.42) — une première séance toute à zéro rep : le calage recommence SOUS la charge échouée. Une charge habituelle déjà
    // déclarée à cette charge ou au-dessus ne se rejoue pas (elle vient d'échouer) : on retrouve la charge par les approches.
    var zeroPremiere = cs.fondement && cs.fondement.zeroRep ? nombre(cs.fondement.zeroRep.charge) : null;
    var habEcartee = zeroPremiere !== null && habituelle !== null && habituelle >= zeroPremiere - 1e-9;
    if (habEcartee) habituelle = null;
    var r = M.calagePremiereFois({
      debutant: e.debutant === true, prudence: prudenceDuPlan(e), equipement: cat.equipement, salle: c.salle || null, mesure: cat.mesure || 'charge_reps',
      reps: reps, habituelle: habituelle, prochain: prochain,
      // PR 3 (B5-03) — la charge restée à 0 rep à la séance d'avant : le calage ne la reprend ni ne la dépasse (I153).
      borne: zeroPremiere,
      series: faites.map(function (f) {
        var sr = series[f.j];
        return { charge: nombre(sr.charge_kg), reps: nombre(sr.reps), ressenti: sr.ressenti || null, chauffe: f.chauffe };
      })
    });
    if (!r) return null;
    // Rien à proposer quand toutes les lignes sont validées : la personne a la main, le calage se tait.
    if (porteuse === null) { r.suivante = null; r.question = false; }
    r.libelles = M.libellesCalage(r);
    // La ligne qui porte la proposition : la première ligne (chauffe ou travail) non validée ; la série dont on demande la
    // réserve : la dernière validée, quand la personne n'a pas encore répondu.
    r.iSerie = r.suivante && porteuse !== null ? porteuse : null;
    r.question = r.question && faites.length ? faites[faites.length - 1].j : null;
    // « Ta charge habituelle ? » : posée d'abord à qui n'est pas débutant, tant qu'il n'a ni répondu ni dit « je ne sais pas »
    // (`habituelles[slug] = 0`). En attendant, rien n'est proposé : on ne devine pas.
    var declinee = habEcartee || (Object.prototype.hasOwnProperty.call(habs, slug) && habs[slug] === 0);
    r.demandeHabituelle = e.debutant !== true && r.faites === 0 && r.habituelle === null && !declinee;
    // 26/11/2026 (lot 5 n° 6, MOTEUR §9.42 delta) — où se tape la réponse : dans la case de charge de la LIGNE 1 (la première ligne non validée), SEULEMENT si c'est une série de travail ;
    // si c'est une chauffe (la routine en porte déjà), la ✓ validerait une approche, pas la charge de travail : la carte garde son champ et « Partir de là ».
    r.saisieEnLigne = r.demandeHabituelle && prochain === 'travail' && porteuse !== null;
    r.iReponse = r.saisieEnLigne ? porteuse : null;
    // 21/11/2026 (« Simplifier », décision 4) — tant que la question de la charge habituelle est posée, le mode d'emploi des deux séries de chauffe (`consigne`) et le « Commence au plus
    // petit cran » (`pourquoi`) décrivent un chemin PAS ENCORE CHOISI : ils ne se disent qu'après « Je ne sais pas » (la demande levée, ils reviennent tels quels, du moteur).
    if (r.demandeHabituelle) { r.suivante = null; r.iSerie = null; r.libelles = Object.assign({}, r.libelles, { consigne: null, pourquoi: null,
      // 256 — aux haltères la charge notée est la PAIRE (`THModele.chargeEstLaPaire`, MOTEUR §10.1) : la question le dit, le calcul ne change pas.
      // 16/11/2026 — à un bras (`haltere_seul`, le matériel effectif du catalogue du plan) : l'haltère tenu, un seul.
      question: racine.THModele.chargeEstLaPaire(cat) ? 'Ta charge habituelle, les deux haltères ensemble ?'
        : (cat.equipement === Moteur().EQUIPEMENT_HALTERE_SEUL ? 'Ta charge habituelle, avec un haltère ?' : 'Ta charge habituelle ?'), pour: 'Pour ' + r.n + ' reps environ', passer: 'Je ne sais pas : on la trouve ensemble' }); }
    return r;
  }

  // 191 — LA PRUDENCE DE MONTÉE du plan : celle que l'app a gelée avec la séance (`e.prudence`, âge et ancienneté lus UNE fois), sinon
  // celle du seul débutant. Une seule lecture, pour le calage, le dépassement et les invariants (I71, I73).
  function prudenceDuPlan(e) { return Moteur().prudenceEffective(e && e.debutant === true, e && e.prudence); }

  // 26/11/2026 (lot 5 n° 6) — la ligne dont la case de charge sert de réponse à « Ta charge habituelle ? » (cernée d'ambre à l'écran) : jamais une proposition, aucun prérempli.
  function poserLaReponseDuCalage(x) {
    var k = x && x.calage;
    if (!k || !k.saisieEnLigne || k.iReponse === null || k.iReponse === undefined) return;
    (x.lignes || []).forEach(function (l) { if (l.iSerie === k.iReponse) l.reponseCalage = true; });
  }

  // Le gris du calage : posé APRÈS `preremplir`, sur la ligne porteuse seulement — la proposition, jamais une série.
  function poserLeCalage(x) {
    var k = x && x.calage;
    if (!k || k.iSerie === null || !k.suivante) return;
    (x.lignes || []).forEach(function (l) {
      if (l.iSerie !== k.iSerie) return;
      l.prerempli = Object.assign({}, l.prerempli || {}, { charge_kg: k.suivante.charge, reps: k.suivante.reps });
      l.calage = true;
    });
  }

  // 188-2 (I76) — le fait du repos d'un gros mouvement : `{ chutes, reposS, phrase }` ou `null`. La phrase passe par la voix (sous
  // capture, I26) et entre dans le « Pourquoi » (`x.pourquoi.repos`).
  function reposDuPlan(x, exo, c, e, slug, actif) {
    if (!actif || !c || !c.compteur || typeof c.compteur.compteur !== 'number') return null;
    var chutes = e.chutesDeReps && Object.prototype.hasOwnProperty.call(e.chutesDeReps, slug) ? e.chutesDeReps[slug] : null;
    var cat = (e.catalogue || {})[slug];
    if (!chutes || !cat) return null;
    var M = Moteur();
    // 233 — le repos RÉEL (l'écart entre deux séries validées du même exercice), plus la valeur du minuteur : en superset, 90 s réglées
    // font ~3 min. Sans mesure (séries importées, une seule série validée), rien à dire : on ne devine pas.
    var reel = e.reposReels && Object.prototype.hasOwnProperty.call(e.reposReels, slug) ? e.reposReels[slug] : null;
    var reposS = reel !== null && reel !== undefined ? Number(reel) : null;
    var fait = { grand: M.estGrandMouvement({ slug: slug, prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [], stab: cat.muscles_stabilisateurs || [],
                                             equipement: cat.equipement }),
                 stagne: c.compteur.compteur >= M.SEUIL_COMPTEUR, chutes: chutes, reposS: reposS };
    if (!M.reposAConseiller(fait)) return null;
    var cap = Voix().capturer(function () { return M.phraseReposLong(); });
    if (x.pourquoi) x.pourquoi.repos = cap.texte;
    x.phrases.push({ ou: 'pourquoi.repos', texte: cap.texte, citations: cap.citations });
    return { grand: true, stagne: true, chutes: chutes.slice(0, M.SEANCES_DE_CHUTE), reposS: reposS, phrase: cap.texte };
  }

  // ── 20/11/2026 (MOTEUR §9.52, I256 à I266) — LE REPOS CONSEILLÉ DE BASE, dans la molette du minuteur ───────────────────────────────────────
  //
  // Une valeur par exercice (`x.reposConseille = { s, cas, pourquoi, … }`), le porteur du tour pour un superset (le dernier membre ; les
  // autres : `null`). Le plan la calcule UNE fois (`Moteur.reposConseilleDeBase`) ; la molette la lit, rien n'est écrit : ni le minuteur
  // (le conseil n'ARME jamais), ni `repos_cible_s`, ni la routine. Silence (`null`) : sans reps visées (une durée), sans famille (aucun muscle au
  // catalogue), en Entretenir (profil ou exercice), en Édition, et là où le coach se tait pour l'exercice (« J'ai mal », « Sans coach cette fois »).
  // Les chauffes automatiques (60 s, puis 120 s) ne passent pas ici. L'adaptation en séance (+1 min après un raté) est un autre chantier.
  function nombreDeSeriesDeTravail(x, liste) {
    return (x.lignes || []).filter(function (l) {
      var s = liste[l.iSerie];
      return l.type === 'travail' && s && racine.THModele.estTravail(s) && s.test_pose !== true;
    }).length;
  }
  function reposConseillesDuPlan(plan, e, seance) {
    var M = Moteur();
    var exos = seance.exercices || [];
    var cat = e.catalogue || {};
    var xs = plan.exercices || [];
    var muet = plan.intention === 'entretien' || !!plan.edition || !!seance.edition;
    // Le mode de la mesure de l'exercice (`'max'` | `'serie'`), seulement s'il est mesuré aujourd'hui ; `null` sinon (accessoire, autre barre, pas d'essai).
    var modeDeTestDe = function (x) {
      var t = x && x.semaineDeTest;
      return t && t.testee === true && (t.mode === 'max' || t.mode === 'serie') ? t.mode : null;
    };
    var fiche = function (slug) {
      var f = slug && Object.prototype.hasOwnProperty.call(cat, slug) ? cat[slug] : null;
      return f ? { slug: slug, prim: f.muscles_primaires || [], sec: f.muscles_secondaires || [], stab: f.muscles_stabilisateurs || [], equipement: f.equipement } : null;
    };
    var contexteDe = function (x, i) {
      var exo = exos[i] || {}, liste = exo.series || [];
      var allegee = x.consigne && x.consigne.allegee ? { reps: nombre(x.consigne.allegee.avant && x.consigne.allegee.avant.vise) } : null;
      return { famille: M.familleDeRepos(fiche(x.slug)), reps: repsDeLaPremiereLigne(x.lignes || [], liste), garde: nombre(x.gardeDeLigne),
               series: nombreDeSeriesDeTravail(x, liste), test: !!x.semaineDeTest, modeDeTest: modeDeTestDe(x), allegee: allegee };
    };
    var poser = function (x, i, o, groupe) {
      var r = M.reposConseilleDeBase(o);
      if (!r) return;
      var gardeDite = r.cas !== 'test' && r.cas !== 'superset' && nombre(o.garde) !== null && nombre(x.reserveAffichee) !== null && nombre(o.garde) === nombre(x.reserveAffichee);
      var cap = Voix().capturer(function () { return M.phraseDuReposConseille({ r: r, reps: o.reps, garde: o.garde, gardeDite: gardeDite }); });
      x.reposConseille = { s: r.s, cas: r.cas, base: r.base, famille: r.famille, reps: o.reps === undefined ? null : o.reps, garde: nombre(o.garde), gardeDite: gardeDite,
                           series: r.series, membres: r.membres, entreLesTours: !!groupe, pourquoi: cap.texte };
      x.phrases = x.phrases || [];
      x.phrases.push({ ou: 'repos.conseil', texte: cap.texte, citations: cap.citations });
    };
    xs.forEach(function (x) { if (x) x.reposConseille = null; });
    if (muet) return;
    // Là où le coach se tait pour l'exercice : Entretenir, « Sans coach cette fois » / « J'ai mal », une mesure en durée ou en distance (une planche, le cardio :
    // I13 — aucune phrase du coach), une figure (les secondes).
    var tait = function (q) {
      return !q || q.intention === 'entretien' || !!q.sansCoach || !!q.douleur || !!q.figure ||
        q.mesure === 'temps' || q.mesure === 'distance_temps' || q.mesure === 'charge_distance' || q.mesure === 'charge_temps';
    };
    var vus = {};
    xs.forEach(function (x, i) {
      if (!x || vus[i] || tait(x)) return;
      var exo = exos[i] || {};
      var g = exo.groupe_superset === undefined ? null : exo.groupe_superset;
      var o = contexteDe(x, i);
      o.raccourci = !!e.raccourci;
      if (g === null || g === '') {
        o.reposPose = nombre(exo.repos_cible_s);
        poser(x, i, o, false);
        return;
      }
      // Un superset : le tour (les exercices qui partagent `groupe_superset`, côte à côte) ; le conseil vit sur le DERNIER membre, qui porte le repos du tour.
      var rangs = [];
      exos.forEach(function (q, k) { if (q && q.groupe_superset === g && xs[k]) rangs.push(k); });
      rangs.forEach(function (k) { vus[k] = true; });
      var dernier = rangs[rangs.length - 1];
      var porteur = xs[dernier];
      if (rangs.length < 2) { o.reposPose = nombre(exo.repos_cible_s); poser(x, i, o, false); return; }
      if (rangs.some(function (k) { return tait(xs[k]); })) return;
      var oS = contexteDe(porteur, dernier);
      oS.raccourci = !!e.raccourci;
      oS.reposPose = nombre((exos[dernier] || {}).repos_cible_s);
      oS.test = rangs.some(function (k) { return !!xs[k].semaineDeTest; });
      var modes = rangs.map(function (k) { return modeDeTestDe(xs[k]); });
      oS.modeDeTest = modes.indexOf('max') >= 0 ? 'max' : (modes.indexOf('serie') >= 0 ? 'serie' : null);
      oS.membres = rangs.map(function (k) { var c = contexteDe(xs[k], k); return { famille: c.famille, reps: c.reps, garde: c.garde }; });
      poser(porteur, dernier, oS, true);
    });
  }

  // ── 193-1 (MOTEUR §9.28) — LES SÉRIES DE RECUL ─────────────────────────────
  //
  // Une ligne de recul (`type === 'recul'`, rôle `hors`) n'est jamais couverte par la consigne : sa charge est celle de la GROSSE
  // série du jour (la plus lourde série de travail de l'exercice, faite ou proposée), moins un écart — lu sur la dernière séance de
  // l'exercice qui avait des reculs (`prec`, `Seance.precedentAReculs`), 10 % sans elle — arrondi au cran le plus proche (vers le
  // bas à égalité). Elle gagne : `recul: { charge, ecart, vise, phrase }` ; non validée et remplie, son fantôme (`source: 'recul'`) ;
  // et un pari (rôle `recul`, rang `r1`, `r2`… — jamais un rang de la couverture : I1, I7, I78). Sans grosse série, la ligne reste
  // vide et dit pourquoi. Jamais une proposition écrite dans une série.
  //
  // `prec` : `{ series, routine_id?, cible? }` — `cible` : les reps visées d'un recul DE LA SÉANCE D'ALORS (la routine d'alors, quand
  // l'app la retrouve) ; sans elle, celles d'aujourd'hui (une approximation : la routine a pu changer entre-temps).
  function reculsDuPlan(lignes, series, consigne, materiel, prec, o) {
    var sortie = { reculs: null, paris: {}, citations: {} };
    var rec = (lignes || []).filter(function (l) { return l.type === 'recul'; });
    if (!rec.length) return sortie;
    var M = Moteur(), V = Voix();
    var liste = series || [];
    var grosse = null, ligneGrosse = null;
    (lignes || []).forEach(function (l) {
      if (l.type !== 'travail') return;
      var sr = liste[l.iSerie] || {};
      var kg;
      if (l.validee) kg = nombre(sr.charge_kg);
      else {
        kg = l.fantome ? nombre(l.fantome.charge) : nombre(l.charge);
        if (kg === null) kg = nombre(sr.charge_kg);
      }
      if (kg !== null && kg > 0 && (grosse === null || kg > grosse)) { grosse = kg; ligneGrosse = l; }
    });
    var viseDe = function (l) {
      var v = nombre((liste[l.iSerie] || {}).reps_visees);
      return v === null || v < 1 ? null : v;
    };
    // 251 (D3, défense) — les reps du jour se lisent sur le premier recul NON validé qui a une visée (celle du bloc, posée par le plan) ;
    // si tous sont validés, sur le premier. Un recul validé avant le correctif porte peut-être la visée de la routine (un faux 5).
    var aujourdhui = null;
    rec.forEach(function (l) { if (aujourdhui === null && !l.validee) aujourdhui = viseDe(l); });
    if (aujourdhui === null) rec.forEach(function (l) { if (aujourdhui === null) aujourdhui = viseDe(l); });
    // 193-5 — l'écart de la 193-1 ne se lit que sur une séance dont les reculs avaient les mêmes reps que la grosse série ; la
    // correction du max du jour, sur les séances dont les reculs en avaient plus (`prec.historique` : les séances à reculs, la plus
    // récente d'abord ; sans lui, `prec` seule).
    var pool = prec ? (Array.isArray(prec.historique) ? prec.historique : [prec]) : [];
    var precEcart = null;
    for (var ip = 0; ip < pool.length && precEcart === null; ip++) { if (!M.reculDePlusDeReps(pool[ip])) precEcart = pool[ip]; }
    var cible = precEcart && nombre(precEcart.cible) !== null ? nombre(precEcart.cible) : aujourdhui;
    var cran = materiel ? materiel.pas : undefined;
    var salle = (materiel && materiel.salle) || (consigne && consigne.salle) || null;
    // 193-5 — les reculs à PLUS de reps que la grosse série : le max du jour. Les reps de la grosse série : faites, sinon proposées
    // ou visées ; sa marge : notée, sinon la visée de la consigne, sinon 0. Rien de connu : la 193-1.
    var grosseReps = null, margeGrosse = null;
    if (ligneGrosse !== null) {
      var srG = liste[ligneGrosse.iSerie] || {};
      if (ligneGrosse.validee) grosseReps = nombre(srG.reps);
      else {
        grosseReps = nombre(ligneGrosse.vise);
        if (grosseReps === null && ligneGrosse.fantome) grosseReps = nombre(ligneGrosse.fantome.reps);
        if (grosseReps === null) grosseReps = nombre(srG.reps_visees);
      }
      if (ligneGrosse.validee) margeGrosse = Palier().reserveDeSerie(srG);
      if (margeGrosse === null && consigne) {
        // Lot F, A1 (CONTRA-TT3-A1, G) — la grosse série affichée « garde-en 1 » sur une barre n'est pas supposée faite à 0 : la table relevée au plancher de la barre,
        // et à celui de la population protégée ou de la reprise longue (CONTRA-723 C4 : l'affichée, comme I235 ; un chiffre même sur une ligne de test).
        margeGrosse = M.plancherDeReserve(M.reserveVisee({ zone: consigne.zone, role: roleDeLaVisee({ lignes: lignes }), reglage: o.reglage }),
          o.protegee === true || M.enRepriseLongue(consigne), o.famille || null);
      }
      if (margeGrosse === null) margeGrosse = 0;
    }
    // 266 (§9.28) — sans séance à reculs, le départ de l'écart se lit sur la table des reps (grosse série, recul), sinon le 10 % d'avant.
    // R1 — la zone d'aujourd'hui lit « la grosse série a raté » de la séance d'avant (une approximation, comme `cible`) ; `rateSousLaZone` reste la seule notion.
    var zoneDuJour = consigne && consigne.zone ? M.zoneParCle(consigne.zone) : null;
    var lu = M.ecartDeRecul(precEcart, cible, M.ecartDeDepartDeRecul(grosseReps, margeGrosse, aujourdhui),
      { bas: zoneDuJour ? zoneDuJour.bas : null, objectif: o.objectif || null, barre: !!(materiel && materiel.equipement === 'barre') });
    var correction = M.correctionDeRecul(pool);
    var capM = V.capturer(function () {
      return M.reculSurLeMaxDuJour({ grosse: grosse, grosseReps: grosseReps, marge: margeGrosse, reps: aujourdhui, correction: correction.valeur,
                            cran: cran, salle: salle });
    });
    var surMax = capM.texte;
    var capR = V.capturer(function () {
      return surMax !== null ? { charge: surMax.charge, ecart: surMax.ecart, vise: aujourdhui, phrase: null }
        : M.reculDe({ grosse: grosse, ecart: lu.ecart, cran: cran, salle: salle, reps: aujourdhui });
    });
    var d = capR.texte;
    var pourquoi = null, citesP = [];
    // La phrase s'écrit sous capture (I26) : un recul rempli la dit, un recul vide dit pourquoi.
    var capF = V.capturer(function () {
      if (d.charge === null) return d.phrase;
      return surMax !== null ? M.phraseReculMaxDuJour(d.charge, surMax.pct) : M.phraseRecul(d.charge, d.ecart);
    });
    var phrase = capF.texte;
    if (d.charge !== null) {
      var capQ = V.capturer(function () {
        if (surMax !== null) {
          return M.pourquoiReculMaxDuJour({ grosse: grosse, grosseReps: grosseReps, marge: surMax.marge, max: Math.round(surMax.max), reps: aujourdhui,
                                        pct: surMax.pct, charge: d.charge, correction: surMax.correction, pas: correction.pas });
        }
        return M.pourquoiRecul({ grosse: grosse, charge: d.charge, ecart: d.ecart, depart: lu.depart, sens: lu.sens, reel: lu.reel,
                                 reps: lu.reps, cible: lu.cible, deduit: lu.deduit === true, grosseReps: grosseReps, marge: margeGrosse, vise: aujourdhui });
      });
      pourquoi = capQ.texte;
      citesP = capQ.citations;
    }
    var fait = [], k = 0;
    rec.forEach(function (l) {
      k += 1;
      var vise = viseDe(l);
      l.recul = { charge: d.charge, ecart: d.ecart, vise: vise, phrase: d.charge === null ? d.phrase : null, rang: 'r' + k };
      if (d.charge !== null && !l.validee) l.fantome = { charge: d.charge, reps: null, source: 'recul' };
      if (l.validee) {
        var f = liste[l.iSerie] || {};
        if (nombre(f.reps) !== null) fait.push(nombre(f.reps));
      }
      // Le pari : la visée de la ligne, à la charge qu'elle proposait. Sans visée ni charge, rien à parier.
      if (d.charge !== null && vise !== null && consigne && consigne.etat !== 'silence') {
        var fondement = {
          rang: 'r' + k, charge: d.charge, etat: consigne.etat, zone: consigne.zone === undefined ? null : consigne.zone,
          reglage: o.reglage === undefined ? null : o.reglage, palier: consigne.palier === undefined ? null : consigne.palier,
          niveau: consigne.niveau === undefined ? null : consigne.niveau, seance: o.seance === undefined ? null : o.seance,
          role: 'recul', grosse: grosse, ecart: d.ecart
        };
        if (surMax !== null) {
          fondement.max_du_jour = Math.round(surMax.max); fondement.marge = surMax.marge; fondement.correction = surMax.correction;
        }
        if (o.phase !== undefined) fondement.phase = o.phase;
        if (o.objectif !== undefined) fondement.objectif = o.objectif;
        if (o.occurrence) fondement.occurrence = o.occurrence;
        sortie.paris[l.iSerie] = { module: 'moteur.consigne', exercise_slug: o.slug === undefined ? null : o.slug, grandeur: 'reps',
                                   valeur_predite: vise, borne_basse: null, borne_haute: null, fondement: fondement };
      }
    });
    var constat = null, citesC = [];
    if (fait.length && d.charge !== null) {
      var capC = V.capturer(function () { return M.phraseConstatReculs(fait, cible); });
      constat = capC.texte;
      citesC = capC.citations;
    }
    sortie.reculs = {
      iSerie: rec[0].iSerie, lignes: rec.map(function (l) { return l.iSerie; }), grosse: grosse, charge: d.charge, ecart: d.ecart,
      depart: lu.depart, deduit: lu.deduit === true, grosseReps: grosseReps, margeGrosse: margeGrosse,
      sens: lu.sens, reel: lu.reel, reps: lu.reps, cible: lu.cible === null ? cible : lu.cible,
      vise: aujourdhui, phrase: phrase, pourquoi: pourquoi, constat: constat, faites: fait
    };
    // 193-5 — le recul calé sur le max du jour (`null` : la 193-1). `max_du_jour` arrondi à l'entier, `marge` celle de la grosse série.
    if (surMax !== null && d.charge !== null) {
      var dernierPas = correction.pas.length ? correction.pas[correction.pas.length - 1] : null;
      sortie.reculs.mode = 'max_du_jour';
      sortie.reculs.max_du_jour = Math.round(surMax.max);
      sortie.reculs.pct = Math.round(surMax.pct);
      sortie.reculs.marge = surMax.marge;
      sortie.reculs.correction = surMax.correction;
      sortie.reculs.grosseReps = grosseReps;
      sortie.reculs.derniere = dernierPas;
      sortie.reculs.cran = cran === undefined ? null : cran;
      sortie.reculs.surSalle = !!salle;
    }
    sortie.citations = { phrase: capF.citations, pourquoi: citesP, constat: citesC };
    return sortie;
  }



  // ── 193-4 (MOTEUR §9.32) — LA SEMAINE DE TEST ──────────────────────────────
  //
  // Les décisions sont celles du moteur (`Moteur.test*`, une seule fois) ; le plan les LIT, séance par séance, et n'écrit rien. L'app
  // lui passe `entrees.semaineDeTest` (la réponse à la carte, rangée dans `profiles.cartes_semaine.test`, et ce que `faits.js` a lu) :
  //   { debut, fin, modes: { slug: 'max' | 'serie' }, mesures: { slug: { valeur, le, seance } }, refus: { slug: jour },
  //     maxEstimes: { slug: kg }, seriesDuMax: { slug: { charge, reps } | null } }   // 202 : la série d'où vient le max (le défaut prudent)
  // Ce que le plan en fait : UN SEUL mouvement testé par séance (le premier non mesuré, ni refusé aujourd'hui) ; le squat et le soulevé
  // jamais le même jour (le second reste en séance normale) ; les accessoires légers ; la montée, les essais ou la série au max
  // de la barre testée, son « Pourquoi », son pari. La structure de la séance reste celle de la routine : le plan PROPOSE des lignes, il
  // n'en écrit aucune.
  function semaineDeTestDuJour(e, seance, exos) {
    var T = e && e.semaineDeTest;
    if (!T || typeof T !== 'object' || !T.debut || !T.fin) return null;
    var M = Moteur(), G = racine.THGenerateur;
    if (seance.edition) return null;
    var jour = M.jourCivil(seance.debut);
    if (!jour || jour < T.debut || jour > T.fin) return null;
    var cat = e.catalogue || {};
    var barres = [];
    (exos || []).forEach(function (exo, i) {
      var slug = exo && exo.exercise_slug;
      if (!slug || barres.some(function (b) { return b.slug === slug; })) return;
      var famille = G && G.familleDeBarre ? G.familleDeBarre(slug, cat) : null;
      // 19/11/2026 — une barre en reprise longue ou sans max ne se teste pas (`Moteur.testBarreTestable`, MOTEUR §9.32) : décidée ICI, une fois,
      // avant de choisir la barre du jour (`testBarreDuJour` l'écarte, la barre récente ne passe pas « en conflit » à cause d'elle).
      var tt = famille ? M.testBarreTestable({ max: (T.maxEstimes || {})[slug], reprise: (T.reprises || {})[slug] }) : null;
      if (famille) barres.push({ slug: slug, i: i, famille: famille, classe: M.testClasse(famille), testable: tt.testable, raison: tt.raison });
    });
    var faites = {}, refusees = {};
    Object.keys(T.mesures || {}).forEach(function (s) {
      var m = T.mesures[s];
      if (m && m.le >= T.debut && m.seance !== seance.id) faites[s] = true;
    });
    Object.keys(T.refus || {}).forEach(function (s) { if (T.refus[s] === jour) refusees[s] = true; });
    var testee = M.testBarreDuJour(barres, faites, refusees);
    return { debut: T.debut, fin: T.fin, jour: jour, barres: barres, testee: testee,
             conflits: testee ? M.testBarresEnConflit(barres, testee) : [], faites: Object.keys(faites), accessoires: 0 };
  }

  // Les séries de l'exercice, lues comme des FAITS (les lignes validées), jamais des propositions.
  // 21/11/2026 (MOTEUR §9.32, I253) — la série de mesure est la série MARQUÉE (`Modele.estSerieDeMesure`, la seule lecture de
  // `serie_de_mesure`), jamais une position : une série ordinaire posée après elle n'entre pas dans la mesure. Deux séries marquées (deux
  // appareils hors ligne) : la PREMIÈRE par `validee_a`, puis par sa place dans l'exercice ; rien ne lève d'erreur.
  // L'ordre de validation : l'INSTANT de `validee_a` (lu, jamais comparé en texte : deux écritures d'un même instant sont égales), une série
  // validée sans `validee_a` (relue de la base, `partEnBase`) après toutes les autres ; puis sa place dans l'exercice. Une règle, lue par
  // `faitsDeTest` ET par I253.
  function instantDeValidation(v) {
    var t = v ? Date.parse(v) : NaN;
    return isFinite(t) ? t : Infinity;
  }
  function avantEnValidation(a, b) {
    var ta = instantDeValidation(a.validee_a), tb = instantDeValidation(b.validee_a);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.rang - b.rang;
  }
  function premiereSerieDeMesure(candidates) {
    return candidates.slice().sort(avantEnValidation)[0] || null;
  }
  function faitsDeTest(x, series) {
    var S = Seance(), P = Palier();
    var essais = [], marquees = [];
    (x.lignes || []).forEach(function (l) {
      if (!l || !l.validee) return;
      var s = series[l.iSerie];
      if (!s) return;
      var charge = nombre(s.charge_kg), reps = nombre(s.reps);
      if (charge === null) return;
      var reserve = P.reserveDeSerie(s);
      if (S.typeDe(s) === 'test') essais.push({ charge: charge, reps: reps === null ? 0 : reps, reserve: reserve, douleur: s.douleur === true, id: s.id === undefined ? null : s.id });
      else if (racine.THModele.estSerieDeMesure(s)) {
        marquees.push({ charge: charge, reps: reps === null ? 0 : reps, reserve: reserve === null ? 0 : reserve, id: s.id === undefined ? null : s.id,
                        validee_a: s.validee_a || null, rang: l.iSerie });
      }
    });
    var p = premiereSerieDeMesure(marquees);
    return { essais: essais, serie: p ? { charge: p.charge, reps: p.reps, reserve: p.reserve, id: p.id } : null };
  }

  // 202 (MOTEUR §9.32) — LES FAITS DU DÉFAUT de la semaine de mesure, d'une barre : le débutant, les 65 ans et plus, les reps de la série d'où
  // vient le max estimé (rien si elles ne sont pas connues). La feuille du Profil (app.js) lit la MÊME fonction de moteur avec les mêmes faits.
  function defautDeTest(e, slug) {
    var T = e.semaineDeTest || {}, s = T.seriesDuMax && T.seriesDuMax[slug];
    return { debutant: e.debutant === true, plus65: e.plus65 === true, repsDuMax: s ? s.reps : null };
  }

  function semaineDeTestDExercice(jt, e, seance, exos, i, x, materiel, intentionX, coachee, douloureuse) {
    if (!jt || !x || !x.slug) return null;
    var M = Moteur(), T = e.semaineDeTest;
    var b = jt.barres.filter(function (q) { return q.slug === x.slug; })[0] || null;
    if (!b) {
      // un accessoire : 1 à 2 au plus, légers, sans échec
      jt.accessoires += 1;
      return { accessoire: true, garde: jt.accessoires <= M.TEST_ACCESSOIRES_MAX, rang: jt.accessoires };
    }
    // 19/11/2026 — « Squat : pas d'essai cette semaine. » : ni essai, ni montée, ni série au max, ni pari ; la phrase dit d'où vient la force estimée
    // (la série et sa date, absolue) quand il y en a une. Elle passe par la capture (I26) comme les autres phrases du test.
    if (b.testable === false) {
      var Vs = Voix(), fiche = e.catalogue && Object.prototype.hasOwnProperty.call(e.catalogue, b.slug) ? e.catalogue[b.slug] : null;
      var source = b.raison === 'reprise_longue' && T.seriesDuMax && T.seriesDuMax[b.slug] ? T.seriesDuMax[b.slug] : null;
      var capS = Vs.capturer(function () { return M.phraseSansEssai((fiche && fiche.nom) || b.slug, source, M.jourCivil(seance.debut)); });
      x.phrases.push({ ou: 'test.sans_essai', texte: capS.texte, citations: capS.citations });
      return { barre: true, testee: false, etat: 'pas_d_essai', slug: b.slug,
               pasDEssai: { raison: b.raison, phrase: capS.texte, citations: capS.citations, source: source && capS.citations.length ? source : null } };
    }
    if (b.slug !== jt.testee) return { barre: true, testee: false, conflit: jt.conflits.indexOf(b.slug) >= 0, etat: 'ailleurs', pasDeTest: true };
    if (!coachee || intentionX === 'entretien') return { barre: true, testee: false, etat: 'sans_coach' };
    var modes = T.modes || {};
    var mode = M.testModeValide(modes[b.slug]) || M.testModeParDefaut(defautDeTest(e, b.slug));
    var maxEstime = nombre(T.maxEstimes && T.maxEstimes[b.slug]);
    var o = { famille: b.famille, cran: materiel ? nombre(materiel.pas) : null, salle: materiel ? materiel.salle || null : null,
              debutant: e.debutant === true };
    var out = { barre: true, testee: true, slug: b.slug, mode: mode, famille: b.famille, classe: b.classe, max: null, etat: 'a_faire',
                montee: [], prochain: null, serie: null, essais: [], mesure: null, arret: null, consigne: null, pourquoi: null, pari: null,
                charge: null, surLesSecurites: b.classe === 'squat' || b.classe === 'couche', arrondi: o.cran };
    if (maxEstime === null || maxEstime <= 0) { out.etat = 'sans_max'; return out; }
    var max = Math.round(maxEstime);
    out.max = max;
    var series = (exos[i] && exos[i].series) || [];
    var f = faitsDeTest(x, series);
    out.essais = f.essais;
    out.montee = M.testMontee(maxEstime, o);
    // « J'ai mal » : noté sur l'exercice dans cette séance, ou récent (42 jours) — le test ne se propose pas.
    var dejaMal = douloureuse === true || M.douleurRecente((e.douleurs && e.douleurs[b.slug]) || [], M.jourCivil(seance.debut));
    if (mode === M.TEST_MODE_MAX) {
      var essai = M.testEssai(maxEstime, f.essais, Object.assign({}, o, { arret: (T.arrets || {})[b.slug] === jt.jour }));
      if (dejaMal && !f.essais.length) essai = M.testEssai(maxEstime, [{ charge: 0, reps: 1, douleur: true }], o);
      out.prochain = essai.etat === 'propose' ? essai : null;
      out.arret = essai.etat === 'arret' ? essai.raison : null;
      out.etat = essai.etat === 'propose' ? (f.essais.length ? 'en_cours' : 'a_faire') : (essai.etat === 'fini' ? 'fini' : 'arret');
      out.mesure = M.testMesure({ mode: mode, essais: f.essais });
    } else {
      out.serie = M.testSerieAuMax(maxEstime, o);
      out.mesure = f.serie ? M.testMesure({ mode: mode, serie: f.serie }) : null;
      out.etat = f.serie ? 'fini' : (dejaMal ? 'arret' : 'a_faire');
      if (dejaMal && !f.serie) { out.arret = 'mal'; out.serie = null; }
    }
    out.mesureSerieId = mode === M.TEST_MODE_SERIE ? (f.serie ? f.serie.id : null)
      : (out.mesure && out.mesure.rang ? (f.essais[out.mesure.rang - 1] || {}).id || null : null);
    out.charge = out.prochain ? out.prochain.charge : (out.serie ? out.serie.charge : null);
    // « Ajouter ces lignes » (geste de la personne, rien en silence) : la montée (échauffements) puis le 1ᵉʳ essai en type `test` (ou la
    // série de mesure, marquée `mesure` : I253) ; les essais suivants un à un, quand les lignes posées sont toutes validées. « Annuler » retire les vides.
    var posees = series.filter(function (q) { return q && q.test_pose === true; });
    out.posees = posees.length;
    out.videsPosees = posees.filter(function (q) { return !q.validee_a; }).length;
    out.ajout = null;
    if ((out.etat === 'a_faire' || out.etat === 'en_cours') && out.videsPosees === 0) {
      var aj = [];
      if (posees.length === 0) out.montee.forEach(function (m) { aj.push({ charge: m.charge, reps: m.reps, type: 'echauffement' }); });
      if (out.prochain) aj.push({ charge: out.prochain.charge, reps: out.prochain.reps, type: 'test', essai: out.prochain.rang });
      else if (out.serie && !f.serie) aj.push({ charge: out.serie.charge, reps: out.serie.vise, type: 'travail', mesure: true });
      if (aj.length) out.ajout = { lignes: aj, suite: posees.length > 0 };
    }
    var pari = M.testPari(maxEstime, o);
    out.pari = pari === null ? null : { module: M.MODULE_TEST, exercise_slug: b.slug, grandeur: M.GRANDEUR_TEST, valeur_predite: pari,
                                        fondement: { mode: mode, max_estime: max, debut: jt.debut, seance: seance.id === undefined ? null : seance.id } };
    var V = Voix();
    if (out.prochain) out.consigne = V.capturer(function () { return M.testConsigneEssai(out.prochain); });
    else if (out.serie) out.consigne = V.capturer(function () { return M.testConsigneSerie(out.serie); });
    if (out.consigne) out.consigne = { texte: out.consigne.texte, citations: out.consigne.citations };
    var capP = V.capturer(function () {
      return M.pourquoiTest({ mode: mode, max: max, pariCharge: pari, serie: out.serie });
    });
    out.pourquoi = { texte: capP.texte, citations: capP.citations };
    // I26 : chaque chiffre dit a sa source (`test`, `test.max`, `test.pct`, `test.reps`, `test.reserve`, `test.pari`, `test.rang`).
    if (out.consigne) x.phrases.push({ ou: 'test.consigne', texte: out.consigne.texte, citations: out.consigne.citations });
    x.phrases.push({ ou: 'test.pourquoi', texte: out.pourquoi.texte, citations: out.pourquoi.citations });
    return out;
  }

  // « Au max » disparaît (20/11/2026, MOTEUR §9.30, I251) : ni faits de « Au max », ni ligne, ni carte, ni pari de la table (`auMaxFaitsDe`,
  // `auMaxDuPlan` sont retirés). La dernière série redevient une série de travail, avec sa réaction normale ; le coach ne demande l'échec que par
  // la visée affichée. Celui qui va au bout le note, et la capacité tenue (I252) le lit.

  // ── 251 (D2, MOTEUR §9.39) — LA PORTE DU CRAN, côté plan ───────────────────────────────────────────────────────────────────
  // Les faits que lit `Moteur.porteDuCran` : la zone, le cran (la ligne haute), les séries de travail validées du jour SOUS le cran (un test pris
  // au cran, ou une ligne du coach au-dessus, ne ferme rien : la porte a déjà servi), leur réserve notée. Rend le résultat du moteur enrichi de ses
  // faits (zone, cran, travail, série fermante), ou `null` si la porte est ouverte ou ne peut pas se lire.
  function porteDeLExercice(series, consigne, ctx) {
    var M = Moteur(), S = Seance(), P = Palier(), T = racine.THModele;
    var zone = M.zoneParCle(consigne.zone);
    var cran = { charge: nombre(consigne.haut.charge), vise: nombre(consigne.haut.vise) };
    if (!zone || cran.charge === null || cran.charge <= 0) return null;
    var vise = nombre(consigne.ligne.vise), lues = [];
    (series || []).forEach(function (s, i) {
      if (!S.partEnBase(s) || !T.estTravail(s) || T.estRecul(s)) return;
      var ch = nombre(s.charge_kg);
      if (ch === null || ch <= 0 || ch >= cran.charge || memeChargeOuVides(ch, cran.charge)) return;
      lues.push({ iSerie: i, charge: ch, reps: nombre(s.reps), vise: vise, reserve: P.reserveDeSerie(s) });
    });
    var r = M.decisionDeLaPorte({ zone: { bas: zone.bas, haut: zone.haut }, cran: cran, travail: chargeDeTravail(consigne), series: lues,
      formeAjustee: ctx.formeAjustee === true, tente: ctx.tente === true, prise: ctx.prise || null, objectif: ctx.objectif || null, barre: ctx.barre === true,
      gardeAffichee: ctx.gardeAffichee === 0 ? 0 : null });
    if (!r.fermee) return null;
    var f = lues.filter(function (q) { return q.iSerie === r.serie; })[0] || null;
    return Object.assign(r, { zone: { bas: zone.bas, haut: zone.haut }, cran: cran, travail: chargeDeTravail(consigne),
      serieFermante: f ? { charge: f.charge, reps: f.reps } : null });
  }
  // Les mots de la porte, sous capture (I26) : la phrase sous la série (`ou: 'porte'`, jamais `'rate'` : I115 compte une seule réaction par
  // exercice), le bouton, et la phrase du « Pourquoi » (`pourquoi.porte`).
  function porteDit(porte, V, dire, pourquoi) {
    var M = Moteur();
    var d = { raison: porte.raison, tente: porte.tente, cran: porte.cran, serie: porte.serieFermante, force: porte.force,
              repsAuCran: porte.repsAuCran, zone: porte.zone };
    var capP = V.capturer(function () { return M.phraseDeLaPorte(d); });
    var capQ = V.capturer(function () { return M.pourquoiDeLaPorte(d); });
    var out = { fermee: true, tente: porte.tente, raison: porte.raison, iSerie: porte.serie, cran: porte.cran, travail: porte.travail,
      serie: porte.serieFermante, force: porte.force, repsAuCran: porte.repsAuCran, zone: porte.zone,
      phrase: capP.texte, bouton: porte.tente ? null : M.boutonDeLaPorte(d), annuler: porte.tente ? M.boutonDeLaPorte(d) : null };
    dire('porte', capP.texte, capP.citations);
    if (pourquoi && capQ.texte) {
      pourquoi.porte = capQ.texte;
      dire('pourquoi.porte', capQ.texte, capQ.citations);
    }
    return out;
  }
  // Le geste « Tenter … quand même » (`cran_tente`) de CET exercice, non suivi d'« Annuler » (`cran_tente_annule`) : UNE lecture, sur le modèle de
  // `chauffesPoseesDe`.
  // 251 — un « Prendre X kg » accepté (`rate_prise`, bouton `prendre`) sur CET exercice : { iSerie, kg } du premier, ou `null`. Il ferme la porte.
  function priseDe(gestes, slug) {
    var g = (Array.isArray(gestes) ? gestes : []).filter(function (q) { return q && q.geste === 'rate_prise' && q.bouton === 'prendre' && q.slug === slug; })[0];
    return g ? { iSerie: g.rang, kg: g.kg } : null;
  }
  function cranTenteDe(gestes, slug) {
    var tente = false;
    (Array.isArray(gestes) ? gestes : []).forEach(function (g) {
      if (!g || g.slug !== slug) return;
      if (g.geste === 'cran_tente') tente = true;
      else if (g.geste === 'cran_tente_annule') tente = false;
    });
    return tente;
  }
  // PR 4b (R-A) — « Tenter 102,5 kg » (`cran_zero_tente`) sur CET exercice, non suivi d'« Annuler » (`cran_zero_tente_annule`) : la même lecture que `cranTenteDe`.
  function zeroTenteDe(gestes, slug) {
    var tente = false;
    (Array.isArray(gestes) ? gestes : []).forEach(function (g) {
      if (!g || g.slug !== slug) return;
      if (g.geste === 'cran_zero_tente') tente = true;
      else if (g.geste === 'cran_zero_tente_annule') tente = false;
    });
    return tente;
  }
  // « Ajuster la fin à ma forme du jour » a été pris sur cet exercice ou sur un exercice qui le précède dans la séance (l'ordre de la séance : un fait
  // stable, qui ne dépend pas de « commencé »).
  function formeAjusteeAvant(seance, iExo) {
    var exos = (seance && seance.exercices) || [], tete = -1;
    (Array.isArray(seance && seance.gestes) ? seance.gestes : []).forEach(function (g) {
      if (!g || g.geste !== 'forme_ajustee') return;
      for (var j = 0; j < exos.length; j++) {
        if (exos[j] && exos[j].exercise_slug === g.slug) { if (tete < 0 || j < tete) tete = j; break; }
      }
    });
    return tete >= 0 && iExo >= tete;
  }

  // Lot F, A1 (I241) — `famille` : la barre de l'exercice (`familleDeLExercice`), ou `null`.
  function planDExercice(exo, iExo, consigneDuSlug, paris, seanceId, reglage, suite, debut, materiel, phase, allegee, seriesRoutine, marche, routinePlus, fini, precedent, objectif, allege, moins, reculPrec, porteCtx, protegee, famille) {
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
        return { iSerie: i, type: racine.THModele.typeLu(s), typeBase: S.typeDe(s), role: 'hors', validee: S.partEnBase(s) };
      });
      // §9.15 — sans consigne, pas de chauffe (pas de référence) ; la
      // dégressive se cale sur la dernière série de travail faite.
      var sans = chauffesEtDegressive(base.lignes, series, null, materiel || null);
      base.materiel = materiel ? materiel.equipement || null : null;
      base.salle = materiel ? materiel.salle || null : null;
      // 15/11/2026 (§9.41 bis, règle 13, I189) — une occurrence que le coach ne suit pas n'a JAMAIS de carte non sollicitée ; la montée demandée,
      // elle, se calcule sur la charge tapée (un geste de la personne). Les lignes de chauffe posées se remplissent sur la même référence.
      base.chauffes = sans.chauffes;
      base.proposition = null;
      base.surDemande = sans.surDemande;
      base.chauffesReference = sans.reference;
      base.degressive = sans.degressive;
      if (sans.degressivesPlus) base.degressivesPlus = sans.degressivesPlus;
      preremplir(exo, base.lignes, null, null, precedent);
      base.phrases = [];
      if (sans.chauffes && sans.chauffes.phrase) base.phrases.push({ ou: 'chauffes', texte: sans.chauffes.phrase, citations: sans.citations.chauffes || [] });
      if (sans.degressive && sans.degressive.phrase) {
        base.phrases.push({ ou: 'degressive', texte: sans.degressive.phrase, citations: sans.citations.degressive || [] });
      }
      (sans.degressivesPlus || []).forEach(function (q) {
        if (q.phrase) base.phrases.push({ ou: 'degressive', texte: q.phrase, citations: q.citations || [] });
      });
      return base;
    }
    // La consigne figée (§9.9, delta 49-13) : c'est elle que lisent les lignes
    // figées, l'en-tête, le constat et les invariants.
    var consigne = M.consigneFigee(c.consigne);
    // MOTEUR §14.4 (49-U14) — PENDANT UNE DÉCHARGE, la consigne de
    // l'exercice est la consigne allégée : même charge, 2 reps de moins, 60 %
    // des séries de la routine, rien ne monte (les chiffres : PR 3 « les mots disent vrai »). C'est elle que lisent les
    // lignes, l'en-tête, les paris, les chauffes et les invariants.
    if (allegee && consigne && consigne.etat !== 'silence') consigne = M.consigneAllegee(consigne, seriesRoutine, allegee.decharge === true, allegee);
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
    // 174 (MOTEUR §14.5, §14.7) — LA 4e MARCHE EN COURS, « ALLÉGER » : acceptée, pas de progrès depuis. La consigne perd sa
    // ligne haute et sa dégressive ; une série de moins (même charge) ou la charge d'un cran plus bas / de P x 0,95. Elle
    // l'emporte sur la série de plus acceptée avant elle (une série de moins n'ajoute pas de ligne).
    if (allege && !consigne.allegee && !consigne.repli && consigne.etat !== 'silence') consigne = M.consigneAlleger(consigne, allege);
    if (routinePlus && !consigne.allegee && !consigne.alleger) consigne = M.consigneSerieDePlus(consigne, routinePlus);
    // 189 (MOTEUR §14.11) — « UNE SÉRIE DE MOINS JUSQU'À LA FIN DE TA SÈCHE », acceptée : la consigne sait que la routine compte
    // `moins` séries et que la séance en garde une de moins (jamais sous 2) ; les charges suivent leur cours.
    if (moins && !consigne.allegee) consigne = M.consigneSerieDeMoins(consigne, moins);
    var siens = (paris || []).filter(function (l) {
      return l && l.exercise_slug === base.slug && l.fondement && l.fondement.seance === seanceId;
    });
    // ⚠️ LES LIGNES FIGÉES SE LISENT ICI, UNE FOIS, DANS LES PARIS DE LA SÉANCE
    // (§9.13, #322) — et nulle part ailleurs : elles sont une ENTRÉE du plan.
    var figees = S.figeesDe(siens, series, consigne);
    // Sans compteur (une consigne figée avant 49-U13), rien ne s'écrit : un 0
    // inventé se lirait comme un progrès (mémoire et observation, §14.4).
    var compteurOuverture = c.compteur && typeof c.compteur.compteur === 'number' ? c.compteur.compteur : undefined;
    // 251 (D2) — LA PORTE DU CRAN : lue AVANT les lignes (elle décide si la couverture pose un test). `porteCtx` est `null` dans les contextes
    // où le coach se tait (Édition, Entretenir, « J'ai mal », semaine allégée, semaine de mesure, repli) ; sans `ligne` ET `haut`, elle se tait aussi.
    // « Une seule garde » (I232) — la garde des lignes de travail, UNE fois, avant la porte : la porte, les lignes et la réaction au raté la lisent.
    var gardeX = gardeDeLigne(consigne, { mesure: materiel ? materiel.mesure || null : null, reglage: reglage === undefined ? null : reglage, protegee: protegee === true, famille: famille || null });
    var porte = porteCtx && consigne.haut && consigne.ligne && !consigne.allegee && !consigne.repli && consigne.etat !== 'silence'
      ? porteDeLExercice(series, consigne, Object.assign({}, porteCtx, { objectif: objectif, barre: !!(materiel && materiel.equipement === 'barre'),
        gardeAffichee: gardeX === 0 ? 0 : null })) : null;
    var dZ = derniereValideDeLExercice({ series: series });
    var r = planDesLignes(series, consigne, c.contexte || null, figees, {
      gardeDeLigne: gardeX,
      apresUnZero: !!porteCtx && dZ !== null && racine.THModele.estZeroDeTravail(series[dZ]) && !consigne.allegee && consigne.etat !== 'silence',
      sansTest: !!(porte && porte.fermee && !porte.tente),
      slug: base.slug, seance: seanceId === undefined ? null : seanceId,
      reglage: reglage === undefined ? null : reglage, phase: phase, objectif: objectif, protegee: protegee === true, famille: famille || null,
      compteur: compteurOuverture, allegee: !!consigne.allegee,
      mesure: materiel ? materiel.mesure || null : null,
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
    // 179 (A-F-03) — LA CIBLE DU TEST DE L'EN-TÊTE EST CELLE DE LA LIGNE. Un test que « à fond » a retouché (20 kg × 8 → 20 kg × 7)
    // ne se cite plus à l'ancienne visée : « Si ça passe, 20 kg × 8 » devant une seule ligne à 7 est une cible qu'aucune ligne
    // n'affiche (I26). L'en-tête lit la visée de la dernière ligne de test à la charge du test.
    var consigneEntete = consigneDeLEntete(consigne, r.lignes);
    var capE = V.capturer(function () { return M.enteteDeDisposition(consigneEntete, disposition); });
    var entete = capE.texte, citesJaune = capE.citations;
    // ECRAN §3.12 (68A) — « Aujourd'hui… Si ça passe… » est la phrase de
    // l'en-tête seul : le « Donc » de la feuille « Pourquoi » garde la sienne
    // (`lignesJaunes`, « puis … sur la dernière série »).
    var capD = V.capturer(function () { return M.enteteDeDisposition(consigneEntete, disposition, true); });
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
    // PR 4a (B2) — LE GRIS SE RÉDIGE SUR LA CONSIGNE FINALE : une variante du jour qui a changé la ligne après coup (« plus léger aujourd'hui »)
    // ne garde pas le gris de la consigne d'avant. Les autres transformations (décharge, repli, alléger) posent leur propre gris plus bas.
    // Le gris que la consigne d'AVANT a posé (`c.libelles`) ne dit plus la ligne quand la consigne appliquée a changé de ligne (une consigne figée, « Arrêter
    // cet exercice ») : il se rédige alors, lui aussi, sur la finale. Sans changement de ligne, le texte re-rédigé EST le gris posé (aucun effet).
    if (gris && (consigne.veilleLegere || !capG || capG.texte !== gris)) {
      try { capG = V.capturer(function () { return M.libellesConsigne(consigne, debut).gris; }); } catch (exV) { capG = null; }
      if (capG) { gris = capG.texte; citesGris = capG.citations; }
    }
    if (consigne.allegee) {
      // « 125 kg × 3 », et en gris « Décharge : 2 séries au lieu de 4. ».
      var capA = V.capturer(function () { return M.phraseAllegee(consigne); });
      entete = { jaune: [capA.texte], segments: entete.segments };
      citesJaune = capA.citations;
      jauneDonc = entete.jaune;
      citesDonc = citesJaune;
      // §9.22 (53-2 bis) — la décharge du programme se nomme : « Décharge,
      // semaine 4 sur 4 : 2 séries au lieu de 4. » (« Les mots disent vrai » PR 1)
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
    // 189 — « 3 séries au lieu de 4, pendant ta sèche » ; « 2 séries, comme ta routine ».
    var capMoins = consigne.serieDeMoins ? V.capturer(function () { return M.grisSerieDeMoins(consigne.serieDeMoins); }) : null;
    var grisMoins = capMoins ? capMoins.texte : null;
    // 174 — LA 4e MARCHE DIT CE QU'ELLE FAIT : en cours (acceptée), « une série de moins, sans dégressive, jusqu'à ton prochain
    // progrès » ; refusée, le rappel « 107 kg × 10 depuis 13 séances. Une série de moins reste la sortie. » (au lieu de rien).
    // Quand la CHARGE change, la phrase grise de l'état (« une rep de plus… », qui cite l'ancienne ligne) cède la place.
    var enteteAlleger = null, citesAlleger = [];
    if (consigne.alleger) {
      var gA = M.grisAlleger(consigne.alleger);
      if (consigne.alleger.charge !== null && consigne.alleger.charge !== undefined) {
        gris = gA.charAt(0).toUpperCase() + gA.slice(1) + '.';
        citesGris = [];
      } else {
        enteteAlleger = gA;
      }
    } else if (marche && marche.marche === M.MARCHE_ALLEGER && marche.reponse === 'refusee' && c.compteur) {
      var capAl = V.capturer(function () { return M.phraseRappelAlleger(c.compteur.meilleur, c.compteur.compteur, marche.mode); });
      enteteAlleger = capAl.texte;
      citesAlleger = capAl.citations;
    }
    // 21/11/2026 (« Simplifier », pilote 3+1, décisions 2 et 5) — LA TÊTE COURTE : la forme que l'en-tête affiche, ÉCRITE PAR LE MOTEUR (`Moteur.grisCourt`, `Moteur.grisAllegee(c, true)`),
    // jamais coupée à l'écran. Elle n'existe que pour la phrase grise de base (une décharge a la sienne) ; une forme que le moteur ne sait pas raccourcir (repli, alléger, silence, ...) reste
    // entière. Rédigée sous capture, pour I26 ; I269 la relit contre le gris, I162 et I165 contre le verbe et la clause.
    var grisCourt = null, citesCourt = [];
    if (gris) {
      try {
        if (consigne.allegee) {
          // La Décharge ne pose son court que sur SA phrase (jamais sur le repli, ni sur une charge allégée qui l'a remplacée) : même garde que la branche normale.
          if (capDA && gris === capDA.texte && !consigne.repli) {
          var capCA = V.capturer(function () { return M.grisAllegee(consigne, true); });
          if (capCA.texte && capCA.texte !== gris) { grisCourt = capCA.texte; citesCourt = (capCA.citations || []).filter(function (q) { return q.texte && capCA.texte.indexOf(q.texte) >= 0; }); }
          }
        } else if (capG && capG.texte === gris && !consigne.repli) {
          var capCK = V.capturer(function () { return M.grisCourt(consigne, debut); });
          if (capCK.texte) { grisCourt = capCK.texte; citesCourt = (capCK.citations || []).filter(function (q) { return q.texte && capCK.texte.indexOf(q.texte) >= 0; }); }
        }
      } catch (exCourt) { grisCourt = null; citesCourt = []; }
    }
    var donc = jauneDonc.length ? 'Donc ' + jauneDonc.join(', ') + '.' : null;
    // 193-1 — les reculs : leur charge, leur fantôme et leur pari (jamais un rang de la couverture). AVANT la dégressive, qui
    // se cale sur la dernière série de travail OU de recul.
    var rec = reculsDuPlan(r.lignes, series, consigne, materiel || null, reculPrec || null, {
      slug: base.slug, seance: seanceId === undefined ? null : seanceId, reglage: reglage === undefined ? null : reglage,
      phase: phase, objectif: objectif, occurrence: base.occurrence || undefined, famille: famille || null, protegee: protegee === true
    });
    Object.keys(rec.paris).forEach(function (i) { r.paris[Number(i)] = rec.paris[i]; });
    var autour = chauffesEtDegressive(r.lignes, series, consigne, materiel || null);
    var capP = V.capturer(function () { return pourquoiDuPlan(consigne, r.lignes, donc); });
    var pourquoi = capP.texte;
    var note = noteDesChauffes(autour.chauffes);
    if (pourquoi && note) pourquoi.chauffes = note;
    if (pourquoi && rec.reculs && rec.reculs.pourquoi) pourquoi.recul = rec.reculs.pourquoi;
    // 200-7 — la phrase du recul (« Recul : 115 kg, 74 % de ton max aujourd'hui. ») ne s'étale plus au-dessus de la ligne : elle ouvre le
    // paragraphe du recul dans le « Pourquoi ». Le même texte, déjà cité plus bas (`dire('recul', …)`, I26).
    if (pourquoi && rec.reculs && rec.reculs.pourquoi && rec.reculs.phrase) pourquoi.reculPhrase = rec.reculs.phrase;
    // 193-3 — la zone vient de la routine : une ligne du « Pourquoi », sans chiffre (la zone et ses bornes sont l'étiquette).
    var phraseDuPlan = c.plan ? M.pourquoiPlan(c.plan) : null;
    if (pourquoi && phraseDuPlan) pourquoi.plan = phraseDuPlan;
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
      } else if (marche.marche === M.MARCHE_SILENCE || marche.marche === M.MARCHE_ALLEGER || marche.carte || consigne.repli) phraseDuCompteur = null;
    }
    if (pourquoi && phraseDuCompteur) pourquoi.compteur = phraseDuCompteur;
    // MOTEUR §13.6 (49-U20) — LE FRÈRE QUI PROGRESSE, côte à côte : figé avec
    // la consigne (`c.frere`), dit en gris après le compteur, CHAQUE FOIS QUE
    // LE COMPTEUR PARLE — sa ligne de l'en-tête (sèche comprise), ou la carte
    // de la marche, qui s'ouvre sur le meilleur. Le repli et le silence le
    // taisent avec lui ; la semaine allégée aussi. L'escalier ne le lit pas :
    // sa marche reste proposée (§13.1, ne pas conclure).
    var frere = c.frere || null;
    var compteurParle = capK0 !== null && !(marche && (marche.marche === M.MARCHE_SILENCE || marche.marche === M.MARCHE_ALLEGER || consigne.repli));
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
    var capC = V.capturer(function () { return constatDuPlan(r.lignes, consigneEntete, suite, reglage, debut, fini); });
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
    dire('entete.court', grisCourt, citesCourt);
    dire('entete.compteur', phraseDuCompteur, citesCompteur);
    dire('entete.frere', phraseDuFrere, citesFrere);
    dire('entete.plus', grisPlus, []);
    dire('entete.moins', grisMoins, capMoins ? capMoins.citations : []);
    dire('entete.alleger', enteteAlleger, citesAlleger);
    dire('message', r.message ? r.message.phrase : null, r.citationsMessage);
    dire('donc', donc, citesDonc);
    if (pourquoi) {
      dire('pourquoi', (pourquoi.lignes || []).map(function (l) {
        return [l.texte, l.raison, l.faite].filter(Boolean).join(' · ');
      }).join(' | '), capP.citations);
      if (capF && capF.texte) dire('pourquoi.paragraphes', texteDesParagraphes(capF.texte), capF.citations);
    }
    if (pourquoi && phraseDuPlan) dire('pourquoi.plan', phraseDuPlan, []);
    if (constat) {
      dire('constat', [constat.verdict, constat.suite].filter(Boolean).join(' '), capC.citations);
      dire('constat.escalier', constat.escalier, citesEscalier);
    }
    if (autour.chauffes) dire('chauffes', autour.chauffes.phrase, autour.citations.chauffes || []);
    if (autour.proposition) {
      dire('proposition', autour.proposition.phrase, autour.citations.proposition || []);
      if (autour.proposition.pourquoi) dire('proposition.pourquoi', autour.proposition.pourquoi, autour.citations.pourquoiChauffes || []);
    }
    if (autour.degressive) dire('degressive', autour.degressive.phrase, autour.citations.degressive || []);
    (autour.degressivesPlus || []).forEach(function (q) { if (q.phrase) dire('degressive', q.phrase, q.citations || []); });
    if (rec.reculs) {
      dire('recul', rec.reculs.phrase, rec.citations.phrase || []);
      if (rec.reculs.pourquoi) dire('pourquoi.recul', rec.reculs.pourquoi, rec.citations.pourquoi || []);
      if (rec.reculs.constat) dire('constat.reculs', rec.reculs.constat, rec.citations.constat || []);
    }
    if (marche && marche.carte) dire('escalier.carte', marche.carte.phrase, citationsDeCarte(marche.carte));

    // 251 (D2) — la porte du cran, dite : sous la série qui l'a fermée (la phrase et son geste), et au « Pourquoi ».
    var porteX = porte && porte.fermee ? porteDit(porte, V, dire, pourquoi) : null;

    // 163 (MOTEUR §10.2 bis) — UNE CHARGE JAMAIS FAITE SE DIT APPROCHÉE : le plan porte la phrase (par matériel) ;
    // l'écran la lit sous la ligne, il ne la rédige pas. I61 relit le fondement, les charges marquées et la phrase.
    var approchee = null;
    // 185 — UN TEST DONT LA LIGNE EST « HORS CALCUL » N'A PLUS DE LIGNE : la personne a dit « Non, ne compte pas » à la série qui
    // portait la charge approchée (le test à ≈ 127,5 kg), il ne reste aucune ligne à l'écran qui la porte. La phrase « ≈ … vise la
    // barre au-dessus » citerait alors une cible qu'aucune ligne n'affiche (I26) : on la tait, et le plan le dit (`approcheeSansLigne`,
    // relu par I61). Tant qu'un segment de l'en-tête porte la charge approchée, rien ne change.
    var porteuse = !!(entete && Array.isArray(entete.segments) && entete.segments.some(function (sg) { return sg && sg.approchee === true; }));
    var horsCalculDuExo = !!(exo && Array.isArray(exo.series) && exo.series.some(function (sx) { return racine.THModele.estHorsCalcul(sx); }));
    // 251 (D2) — de même, la porte fermée retire la ligne de test : « ≈ 110 kg : vise la barre au-dessus » citerait une cible qu'aucune ligne n'affiche (I26).
    var testRetire = !!(porte && porte.fermee && !porte.tente && consigne && consigne.haut && consigne.haut.approchee === true &&
                        !(consigne.ligne && consigne.ligne.approchee === true));
    var approcheeSansLigne = !!(consigne && consigne.fondement && consigne.fondement.approchee === true) && !porteuse && (horsCalculDuExo || testRetire);
    if (!approcheeSansLigne && consigne && consigne.fondement && consigne.fondement.approchee === true) {
      var capAp = V.capturer(function () { return M.phraseApprochee(materiel ? materiel.equipement : null, consigne); });
      approchee = { materiel: materiel ? materiel.equipement || null : null, phrase: capAp.texte };
      dire('entete.approchee', capAp.texte, capAp.citations);
    }

    preremplir(exo, r.lignes, consigne, { reaction: r.reaction, figees: figees }, precedent);

    // 211 — « Mon premier pari : 60 kg × 9. » : la visée de la PREMIÈRE ligne qui porte un pari de la consigne elle-même (rôle `ligne` ou `haut` : ni recul,
    // ni retour, ni révision d'une série déjà faite), aux chiffres de la ligne (I26). Le plan la porte ; l'écran décide de la montrer, UNE fois, quand le compte n'a
    // encore aucun pari (`app.js`, `faits.premierPariDuCompte`). Aucune charge future n'est calculée : c'est celle d'aujourd'hui.
    var premierPari = null;
    if (consigne && consigne.etat !== 'silence' && !approcheeSansLigne && !Object.keys(figees || {}).length) {
      for (var ip = 0; ip < r.paris.length && !premierPari; ip++) {
        var pq = r.paris[ip];
        if (pq && pq.fondement && (pq.fondement.role === 'ligne' || pq.fondement.role === 'haut') && pq.fondement.charge !== undefined &&
            pq.fondement.charge !== null && pq.valeur_predite !== null && pq.valeur_predite !== undefined) {
          var capPP = V.capturer(function () { return M.phrasePremierPari(pq.fondement.charge, pq.valeur_predite, pq.fondement.role); });
          premierPari = { iSerie: ip, charge: pq.fondement.charge, reps: pq.valeur_predite, phrase: capPP.texte };
          dire('entete.premierPari', capPP.texte, capPP.citations);
        }
      }
    }

    return {
      iExo: iExo, slug: base.slug, occurrence: base.occurrence,
      consigne: consigne, contexte: c.contexte || null,
      // « Une seule garde » (I232) — la garde des lignes de travail (`gardeDeLigne`), distincte de `reserveAffichee` (la visée).
      gardeDeLigne: gardeX,
      // 193-3 — la zone que la routine fixe pour ce jour (`{ zone, mode, n, perimee }`), ou `null` : I79 à I81 la relisent.
      zonePlan: c.plan || null,
      // I8 (122) — les rangs quittés par des séries faites : aucune ligne non figée ne les porte.
      rangsQuittes: exo && Array.isArray(exo.rangsQuittes) ? exo.rangsQuittes.slice() : [],
      indices: r.indices, rangs: r.rangs, roles: r.roles, figees: figees,
      planInitial: r.planInitial, faites: r.faites, reaction: r.reaction,
      lignes: r.lignes, message: r.message, paris: pariDuJourSans(r.paris, consigne),
      constat: constat,
      // PR 4a (MOTEUR §9.47) — LE VERBE UNIQUE, calculé une fois sur la consigne finale : le gris, le Pourquoi et le constat le disent, I162 le relit.
      verbe: M.verbeDeLaConsigne(consigne),
      entete: Object.assign({ jaune: entete.jaune, gris: gris, segments: entete.segments, compteur: phraseDuCompteur, plus: grisPlus, moins: grisMoins },
                            phraseDuFrere ? { frere: phraseDuFrere } : {}, enteteAlleger ? { alleger: enteteAlleger } : {}, grisCourt ? { court: grisCourt } : {}),
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
      // 163 — la charge approchée et sa phrase, ou `null` : I61 la relit.
      approchee: approchee,
      approcheeSansLigne: approcheeSansLigne,
      // 211 — le premier pari de l'exercice, dit (`{ iSerie, charge, reps, phrase }`), ou `null`.
      premierPari: premierPari,
      // §10 bis (108) — la salle de l'exercice, ou `null` : I46 la relit.
      salle: materiel ? materiel.salle || null : (c.salle || null),
      chauffes: autour.chauffes, proposition: autour.proposition, degressive: autour.degressive,
      // 15/11/2026 (§9.41 bis, I184, I185) — la référence unique des chauffes (`{ charge, source, plan }`) et la montée demandée (« + Chauffe »).
      chauffesReference: autour.reference || null, surDemande: autour.surDemande || null,
      degressivesPlus: autour.degressivesPlus || null,
      // 193-1 — les séries de recul, ou `null` : I78 la relit.
      reculs: rec.reculs,
      // 251 (D2) — la porte du cran fermée (`{ fermee, tente, raison, iSerie, cran, travail, serie, force, repsAuCran, zone, phrase, bouton, annuler }`), ou `null`.
      porteDuCran: porteX,
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
  // PR 4b (R-A, I156, MOTEUR §9.42 bis) — LA CHARGE QUE LE GRIS NE REPREND PAS : `Ch`, la charge restée à 0 rep que le plafond garde (la consigne porte
  // `fondement.plafondZero`, qu'il mord ou non : c'est ce que lisent aussi les silences) ou le zéro de la séance EN COURS (`Modele.zeroDeSeance`, sur les
  // séries VALIDÉES de l'exercice : la même lecture que l'historique, le plan seul l'applique). Un zéro à ou sous le palier tenu n'est pas une limite.
  // `null` : aucune limite. Le gris est alors VIDÉ, jamais remplacé par une charge plus basse devinée.
  function chargeDuZeroDuGris(exo, consigne) {
    var pz = consigne && consigne.fondement ? consigne.fondement.plafondZero : null;
    var Ch = pz && pz.tente !== true ? nombre(pz.charge) : null;   // « Tenter » : la personne a décidé, le gris reprend la consigne d'avant plafond
    var palier = consigne ? nombre(consigne.palier) : null;
    var valides = ((exo && exo.series) || []).filter(function (sr) { return Seance().partEnBase(sr); });
    var z = valides.length ? racine.THModele.zeroDeSeance(valides, { porte: true }) : null;
    if (z && nombre(z.charge) !== null && !(palier !== null && !(nombre(z.charge) > palier + 1e-9))) Ch = Ch === null ? nombre(z.charge) : Math.min(Ch, nombre(z.charge));
    return Ch;
  }

  function preremplir(exo, lignes, consigne, r, precedent) {
    var S = Seance();
    var series = (exo && exo.series) || [];
    var seule = { exercices: [exo] };
    var grille = consigne && r ? S.planDe(series, consigne, r.reaction ? r.reaction.plan : null, r.figees || null) : null;
    var ChZero = chargeDuZeroDuGris(exo, consigne);
    (lignes || []).forEach(function (l, i) {
      var cascade = S.fantome(seule, 0, i, precedent || null, grille);
      var f = l.fantome;
      var p = { charge_kg: cascade.charge_kg, reps: cascade.reps, duree_s: cascade.duree_s, distance_m: cascade.distance_m };
      if (f && f.source === 'chauffe') {
        p.charge_kg = f.charge === undefined ? null : f.charge;
        // §9.15.5 (94) — sans reps à la routine, celles de la règle.
        if (f.reps !== null && f.reps !== undefined) p.reps = f.reps;
      } else if (f && f.source === 'recul') {
        // 193-1 — la charge du recul ; ses reps, celles de la routine ou de la fois d'avant (la cascade), jamais une visée du coach.
        p.charge_kg = f.charge === undefined ? null : f.charge;
        if (f.reps !== null && f.reps !== undefined) p.reps = f.reps;
      } else if (f && f.source === 'rest_pause') {
        // 196 — la mini-série : la charge de la série de travail, aucune rep proposée.
        p.charge_kg = f.charge === undefined ? null : f.charge;
        p.reps = null;
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
      // PR 2 (MOTEUR §9.42, I153) — UNE PREMIÈRE SÉANCE TOUTE À ZÉRO : le calage recommence, la charge qui vient d'échouer n'est pas re-grisée
      // (la cascade lirait la séance d'avant). Les chauffes gardent leur charge ; le calage pose la sienne sur la ligne porteuse, après.
      var zeroPremiere = consigne && consigne.etat === 'silence' && consigne.raison === 'premiere_fois' && consigne.fondement && consigne.fondement.zeroRep
        ? nombre(consigne.fondement.zeroRep.charge) : null;
      if (zeroPremiere !== null && !(f && f.source === 'chauffe') && nombre(p.charge_kg) !== null && nombre(p.charge_kg) >= zeroPremiere - 1e-9) p.charge_kg = null;
      // PR 4b (R-A, I156) — après un zéro isolé : le gris d'une ligne de travail non validée ne reprend jamais la charge restée à 0 rep ni une plus lourde.
      if (ChZero !== null && !l.validee && !(f && f.source === 'chauffe') && l.type !== 'chauffe' && nombre(p.charge_kg) !== null && nombre(p.charge_kg) >= ChZero - 1e-9) p.charge_kg = null;
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
  // en Progresser, 2 en Entretenir (Spiering et al. 2021, chez les jeunes adultes). Ce n'est qu'un
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
      ? prec.series.filter(function (s) { return Voix().estTravail(s) && !racine.THModele.estRecul(s); }).length : 0;
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
  function materielDe(exos, i, catalogue, consigneDuSlug, refus, ctx) {
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
    // 253-X1 (MOTEUR §9.41, règle 7) — « DÉJÀ TRAVAILLÉS » : un muscle PRIMAIRE de cet exercice figure parmi les muscles pondérés
    // (`Semaine.musclesPonderes`, primaire, secondaire, stabilisateur : la notion du volume) d'un exercice PLACÉ AVANT lui. Distinct de
    // `deja_sollicite` (primaires seulement), qui garde la règle « premier sur ses muscles » des barres.
    var travailles = {};
    for (var kk = 0; kk < i; kk++) {
      var avant = exos[kk] && catalogue[exos[kk].exercise_slug];
      if (avant && Semaine()) Semaine().musclesPonderes(avant).forEach(function (x) { if (x.muscle) travailles[x.muscle] = true; });
    }
    var dejaTravaille = miens.some(function (m) { return travailles[m] === true; });
    // 237 (MOTEUR §9.41) — ce que la décision des chauffes lit en plus : l'exercice (isolation, poids du corps), la séance (objectif,
    // « peu de temps », zone à ménager) et l'historique (max estimé, séances où la personne a ajouté ses chauffes).
    var c = ctx || {};
    var zm = c.zonesMenagees && Object.prototype.hasOwnProperty.call(c.zonesMenagees, slug) ? c.zonesMenagees[slug] : null;
    var M = Moteur();
    return {
      premierExercice: i === 0,
      // 237 — les chauffes de cet exercice ont été proposées par le coach dans cette séance (« Ajouter » ou ajout automatique).
      coach: (Array.isArray(c.gestes) ? c.gestes : []).some(function (g) {
        return g && (g.geste === 'chauffes_ajoutees' || g.geste === 'chauffes_auto') && g.slug === slug;
      }),
      isolation: M.estIsolation({ prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [], stab: cat.muscles_stabilisateurs || [] }),
      corps: cat.mesure === 'reps' && cat.equipement === 'aucun' && cat.charge !== 'assistance' && cat.charge !== 'ajoutee',
      // 20/11/2026 (MOTEUR §9.17 delta) — le lesté a ses chauffes (le poids du corps, puis la moitié du lest dès 20 kg) ; les pompes, aucune à part.
      lest: cat.charge === 'ajoutee',
      pompes: typeof slug === 'string' && /^pompes(_|$)/.test(slug),
      // 20/11/2026 (MOTEUR §9.41 delta, I248) — un exercice d'un programme du coach (`routine_exercises.chauffes_du_coach`, lu par l'app) : le
      // coach choisit ses chauffes. La population protégée borne la chauffe ajoutée (I247).
      plusIds: (Array.isArray(c.gestes) ? c.gestes : []).filter(function (g) {
        return g && g.geste === 'chauffe_plus' && g.slug === slug && typeof g.serie === 'string';
      }).map(function (g) { return g.serie; }),
      duCoach: !!(c.duCoach && Object.prototype.hasOwnProperty.call(c.duCoach, slug) && c.duCoach[slug] === true),
      protegee: c.protegee === true,
      menagee: !!(zm && !zm.choisie),
      forme: c.objectif === 'forme',
      peuDeTemps: c.peuDeTemps === true,
      e1rm: c.e1rms && Object.prototype.hasOwnProperty.call(c.e1rms, slug) ? nombre(c.e1rms[slug]) : null,
      ajoutees: c.ajoutees && Object.prototype.hasOwnProperty.call(c.ajoutees, slug) ? nombre(c.ajoutees[slug]) : 0,
      muscle: miens.length && Semaine() ? String(Semaine().libelleMuscle(miens[0])).toLowerCase() : null,
      equipement: cat.equipement || null,
      // 119 (E6) — la mesure, pour que `chauffesEtDegressive` se taise sur une mesure sans charge.
      mesure: cat.mesure || null,
      sol: Moteur().SOULEVES_AU_SOL.indexOf(slug) >= 0,
      deja_sollicite: deja,
      deja_travaille: dejaTravaille,
      pas: pas,
      refus: !!(refus && refus[slug]),
      // §10 bis (108) — la salle déclarée pour cet exercice (`THProfil.
      // salleDeLExercice`, résolue par l'app au catalogue), ou `null`.
      salle: cat.salle || null,
      // 151 — la barre lourde (les quatre barres et leurs frères à la barre, la définition du générateur) : une
      // seule baisse. Lue à l'appel ; sans générateur chargé, jamais lourde.
      lourde: !!(racine.THGenerateur && racine.THGenerateur.estBarreLourde && racine.THGenerateur.estBarreLourde(slug, catalogue))
    };
  }

  // §9.15.2 (49-U10) — LA MÉMOIRE DES « NON MERCI », en fonctions pures : l'app
  // la garde sur l'appareil (`localStorage`, `th-v2-refus-chauffes`), jamais en
  // base. `memoire` : `{ [slug]: { n, seance } }` — `n` les refus d'affilée,
  // un par séance au plus ; `seance` celle du dernier. Rend toujours un objet
  // NEUF : l'app s'en sert comme clé de son mémo.
  // 237 (§9.41) — pour les chauffes : 2 « Non merci » d'affilée = silence pendant 4 semaines (`Moteur.chauffesEnSilence`), puis la
  // proposition revient ; la mobilité (clé `MOBILITE_REFUS_CLE`) garde ses trois « Non merci » de suite, définitifs.
  var REFUS_DEFINITIFS = 3;

  function silenceExpire(x, maintenant) {
    return !!x && Number(x.n) >= Moteur().CHAUFFE_REFUS_SILENCE && !Moteur().chauffesEnSilence(x, maintenant);
  }

  function refuserChauffes(memoire, slug, seanceId, quand) {
    var r = Object.assign({}, memoire || {});
    var x = r[slug] || { n: 0, seance: null };
    // Un silence échu : le compte repart de zéro (la proposition est revenue, ce refus est le premier).
    if (slug !== Moteur().MOBILITE_REFUS_CLE && silenceExpire(x, quand)) x = { n: 0, seance: null };
    // `avant` : l'état d'avant ce refus, pour que « Annuler » (237-bis) le retire vraiment.
    r[slug] = x.seance === seanceId ? x : { n: (Number(x.n) || 0) + 1, seance: seanceId, quand: quand === undefined ? null : quand,
                                            avant: { n: Number(x.n) || 0, seance: x.seance === undefined ? null : x.seance, quand: x.quand === undefined ? null : x.quand } };
    return r;
  }

  // 237-bis — ce refus vient-il de mettre l'exercice en silence ? (la phrase se dit à CE geste, une fois). Pure.
  function miseEnSilence(avant, apres, slug, maintenant) {
    if (slug === Moteur().MOBILITE_REFUS_CLE) return false;
    var a = (avant || {})[slug], b = (apres || {})[slug];
    return !!b && Moteur().chauffesEnSilence(b, maintenant) && !(a && Moteur().chauffesEnSilence(a, maintenant));
  }

  // 237-bis — « Annuler » la mise en silence : retire ce dernier refus (celui de CETTE séance). Sans refus de cette séance : inchangé.
  function annulerRefusChauffes(memoire, slug, seanceId) {
    var r = Object.assign({}, memoire || {}), x = r[slug];
    if (!x || x.seance !== seanceId) return r;
    var a = x.avant;
    if (a && Number(a.n) > 0) r[slug] = { n: Number(a.n), seance: a.seance, quand: a.quand };
    else delete r[slug];
    return r;
  }

  // « Ajouter » : le compte repart de zéro.
  function accepterChauffes(memoire, slug) {
    var r = Object.assign({}, memoire || {});
    delete r[slug];
    return r;
  }

  // L'entrée du plan : `{ [slug]: true }` — refusée dans CETTE séance, ou en silence (chauffes : 2 refus depuis moins de 4
  // semaines ; mobilité : 3 d'affilée).
  function refusChauffesDe(memoire, seanceId, maintenant) {
    var sortie = {};
    Object.keys(memoire || {}).forEach(function (slug) {
      var x = memoire[slug] || {};
      if (x.seance === seanceId) sortie[slug] = true;
      else if (slug === Moteur().MOBILITE_REFUS_CLE) { if (Number(x.n) >= REFUS_DEFINITIFS) sortie[slug] = true; }
      else if (Moteur().chauffesEnSilence(x, maintenant)) sortie[slug] = true;
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
  var OBJECTIFS_DU_PLAN = ['force', 'muscle', 'les_deux', 'forme', 'calisthenie'];
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
  // ── 197 (MOTEUR §9.36) — LA PUISSANCE DES 65 ANS ET PLUS, posée par le plan ──────────────────────────────────────────────────────────
  // « Monte vite, descends en contrôlant » sur UN polyarticulaire léger de la séance (le premier dans l'ordre : `Moteur.exerciceDePuissance`), jamais
  // une barre, jamais un exercice qui charge une zone à ménager ou une douleur récente. `e.plus65` : `true` seulement (inconnu ou faux : rien).
  // Le plan se tait en Édition et en « Juste un carnet ». L'écran lit `plan.puissance` ; il ne choisit rien.
  function puissanceDuPlan(e, seance, exos, intentionProfil) {
    var M = Moteur();
    if (e.plus65 !== true || seance.edition || intentionProfil === 'entretien') return null;
    var cat = e.catalogue || {}, G = racine.THGenerateur, jour = M.jourCivil(seance.debut);
    var cles = ['genou', 'dos', 'epaule', 'coude', 'hanche'];
    var menager = Array.isArray(e.menagerProfil) ? e.menagerProfil : [];
    var liste = exos.map(function (x) {
      var slug = x && x.exercise_slug, f = (slug && cat[slug]) || null;
      if (!f) return null;
      var zones = G ? G.zonesQueChargeLExercice(slug, cles) : [];
      var mal = !!(G && jour && e.douleurs && e.douleurs[slug] && M.douleurRecente(e.douleurs[slug], jour));
      return { slug: slug, prim: f.muscles_primaires, sec: f.muscles_secondaires, stab: f.muscles_stabilisateurs, equipement: f.equipement,
               mesure: f.mesure || 'charge_reps', aMenager: mal || zones.some(function (z) { return menager.indexOf(z) >= 0; }) };
    });
    var slug = M.exerciceDePuissance(liste);
    return slug ? { slug: slug, texte: M.FORME_PUISSANCE_PHRASE, pourquoi: M.FORME_PUISSANCE_POURQUOI } : null;
  }

  // ── 194-1 (MOTEUR §9.31) — LA MOBILITÉ EN FIN DE SÉANCE, dans le plan ─────────────────────────────────────────────────
  // Facultative, jamais imposée : rien n'est écrit dans la séance sans le geste « Ajouter » (`Seance.insererMobilite`). Le plan se tait
  // en Édition, en « Juste un carnet », après trois « Non merci » de suite (la mémoire des chauffes, la clé `Moteur.MOBILITE_REFUS_CLE`)
  // et quand « J'ai peu de temps » est accepté (`entrees.raccourci` : le bloc part d'abord, avant toute série).
  function mobiliteDuPlan(e, seance, exos, intentionProfil) {
    var M = Moteur();
    var zones = M.zonesRaidesConnues(e.zonesRaides);
    if (!zones || !zones.length || seance.edition || intentionProfil === 'entretien') return null;
    if (e.raccourci) return { retiree: 'peu_de_temps', avant: null, fin: null };
    if ((e.refusChauffes || {})[M.MOBILITE_REFUS_CLE]) return null;
    var cat = e.catalogue || {};
    var slugs = exos.map(function (x) { return x && x.exercise_slug; }).filter(Boolean);
    var muscles = [];
    slugs.forEach(function (s) { ((cat[s] && cat[s].muscles_primaires) || []).forEach(function (m) { if (muscles.indexOf(m) < 0) muscles.push(m); }); });
    var G = racine.THGenerateur, jour = M.jourCivil(seance.debut);
    var cles = ['genou', 'dos', 'epaule', 'coude', 'hanche'], douleurs = [];
    Object.keys(e.douleurs || {}).forEach(function (s) {
      if (!G || !jour || !M.douleurRecente(e.douleurs[s], jour)) return;
      G.zonesQueChargeLExercice(s, cles).forEach(function (z) { if (douleurs.indexOf(z) < 0) douleurs.push(z); });
    });
    var debutee = exos.some(function (x) { return (x.series || []).some(function (sr) { return sr && sr.validee_a; }); });
    var b = M.blocDeMobilite({ zones: zones, faites: e.mobiliteFaite || {}, muscles: muscles, slugs: slugs,
      menager: Array.isArray(e.menagerProfil) ? e.menagerProfil : [], douleurs: douleurs, debutee: debutee });
    var premier = slugs[0], dernier = slugs[slugs.length - 1];
    var fin = b.fin && !(dernier && M.exerciceDeMobilite(dernier) && slugs.length > 0) ? b.fin : null;
    var avant = b.avant && !(premier && M.exerciceDeMobilite(premier)) ? b.avant : null;
    if (!fin && !avant) return null;
    var out = { retiree: null, avant: null, fin: null };
    if (avant) out.avant = Object.assign({}, avant, { titre: 'Préparation \u00b7 ' + Math.round(avant.minutes) + ' min',
      sousTitre: avant.accord + (/^Tes /.test(avant.accord) ? ' servent' : ' sert') + ' ton ' + avant.sert + ' aujourd\u2019hui \u00b7 en mouvement, jamais tenu',
      pourquoi: M.MOBILITE_POURQUOI_AVANT });
    if (fin) out.fin = Object.assign({}, fin, { titre: fin.zones.length ? M.mobiliteTitre(fin.minutes) : null,
      sousTitre: fin.zones.length ? M.mobiliteSousTitre(fin.zones) : null,
      pourquoi: fin.zones.map(M.mobilitePourquoi).join(' ') });
    return out;
  }

  // Une ligne d'un exercice de mobilité (le bloc accepté, ou posé à la main) se pré-remplit de sa durée : le plan propose, la série reste vide.
  function avecDureeDeMobilite(x, slug) {
    var M = Moteur(), d = slug ? M.dureeDeMobilite(slug) : null;
    if (!x || !d || !Array.isArray(x.lignes)) return x;
    x.lignes.forEach(function (l) {
      if (!l || l.validee) return;
      var p = l.prerempli || {};
      if (p.duree_s === null || p.duree_s === undefined) l.prerempli = Object.assign({}, p, { duree_s: d });
    });
    return x;
  }

  // ── 225 (MOTEUR §9.40) — LA VEILLE D'UNE ACTIVITÉ DURE : « Squat plus léger aujourd'hui » ou « Comme prévu » ───────────────────────
  // Le FAIT vient de l'app (`faits.activiteDeLaVeille` : une activité NOTÉE, intense, qui charge les jambes — jamais une habitude déclarée) ;
  // la décision est ici, une fois : une barre de jambes (squat, soulevé) en zone Lourd ce jour-là, la proposition de `Moteur.veilleActivite`,
  // UNE fois (`e.veilleChoix` : la réponse, quelle qu'elle soit, la fait taire). Le plan se tait en Édition et en « Juste un carnet ».
  // La barre est lue sur la ZONE DE LA CONSIGNE du jour.
  // 253 (X2, décision d'Aurélien du 06/11/2026) — « plus léger » N'EST PAS UNE ZONE : même zone, mêmes reps, même nombre de séries ; la charge du plan
  // × 0,95 au cran le plus proche (`Moteur.veilleLegere`), la réserve affichée + 2 (3 au plus). Une variante de la consigne du jour, cette séance
  // seulement. Elle ne s'applique ni en semaine de mesure, ni en décharge ou semaine allégée, ni au calage, ni à une consigne déjà allégée (repli,
  // « plus léger » de la douleur) ou qui porte un test : `legereDeLaBarre` rend alors `null` et la barre n'est pas proposée.
  function legereDeLaBarre(e, slug, entree) {
    var k = entree && entree.consigne ? entree.consigne : null;
    if (!k || k.etat === 'silence' || ETATS_TEST_PLAN[k.etat] === true || k.haut || k.repli || k.plusLegere || k.allegee) return null;
    var l = k.ligne, ch = l ? nombre(l.charge) : null, reps = l ? nombre(l.vise) : null;
    if (ch === null || reps === null) return null;
    var cat = (e.catalogue || {})[slug] || {};
    var rv = Moteur().reserveAffichee({ zone: k.zone, role: 'ligne', reglage: reglageDe(e), protegee: protegeeDeEntrees(e), famille: familleDeLExercice(e, slug) });
    return Moteur().veilleLegere({ charge: ch, reps: reps, reserve: rv === null || rv === undefined ? 0 : rv, pas: entree.pas, equipement: cat.equipement || null, salle: entree.salle || null });
  }
  // PR 4a (§9.26 bis) — LA POPULATION PROTÉGÉE, un seul prédicat (`Moteur.populationProtegee`), calculé une fois par le plan sur ses entrées
  // (le profil gelé de la séance) ; `plus65` n'est vrai que si l'âge est connu.
  // Lot F, A1 (I241, I216) — le plancher de la barre relève-t-il la table au rôle `ligne` ? Là seulement, la garde des lignes est un PLANCHER pour la
  // réaction au raté (ailleurs la table, Lourd ou Mix à 2, laisse la réaction à sa règle propre). `famille` : `familleDeLExercice`.
  function plancherDeBarreRelevant(consigne, reglage, famille) {
    var M = Moteur(), pb = M.plancherDeBarre(famille || null);
    if (pb === null || !consigne) return false;
    var t = M.reserveVisee({ zone: consigne.zone, role: 'ligne', reglage: reglage });
    return t !== null && pb > t;
  }
  function protegeeDeEntrees(e) {
    var x = e || {};
    return Moteur().populationProtegee({ plus65: x.plus65 === true, debutant: x.debutant === true, objectif: objectifDuPlan(x.objectif) });
  }
  function reglageDe(e) { return e.reglage === 'franc' || e.reglage === 'prudent' ? e.reglage : 'normal'; }
  // « Une seule garde » (I232, I216) — la garde des lignes d'un exercice du plan, RECALCULÉE depuis les entrées (réglage, population protégée,
  // mesure du catalogue) par la même fonction que le plan (`gardeDeLigne`) : les vérificateurs ne lisent jamais `x.gardeDeLigne`.
  function gardeDeLigneDesEntrees(x, entrees) {
    var e = entrees || {};
    var cat = x && x.slug && e.catalogue && Object.prototype.hasOwnProperty.call(e.catalogue, x.slug) ? e.catalogue[x.slug] || {} : {};
    return gardeDeLigne(x ? x.consigne : null, { mesure: cat.mesure === undefined ? null : cat.mesure, reglage: e.reglage, protegee: protegeeDeEntrees(e),
      famille: familleDeLExercice(e, x ? x.slug : null) });
  }
  function nomParleDe(cat, slug) {
    var n = racine.THModele.nomCourt(cat && cat.nom ? cat.nom : slug);
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : slug;
  }
  function jambesLourdesDuPlan(e, exos, consignes) {
    var G = racine.THGenerateur, B = racine.THModele.BARRES, cat = e.catalogue || {}, vus = {}, sortie = [];
    if (!G || !G.familleDeBarre) return sortie;
    (exos || []).forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (!slug || vus[slug] || !Object.prototype.hasOwnProperty.call(cat, slug)) return;
      vus[slug] = true;
      var fam = G.familleDeBarre(slug, cat);
      if (fam !== B[0] && fam !== B[2]) return;
      var c = consignes && consignes[slug] && consignes[slug].consigne ? consignes[slug].consigne : null;
      var z = c && c.zone ? (c.zone.cle || c.zone) : null;
      if (z === 'lourd') sortie.push({ slug: slug, nom: nomParleDe(cat[slug], slug), legere: legereDeLaBarre(e, slug, consignes[slug]) });
    });
    return sortie;
  }
  // La barre de la variante « plus léger » — la première barre de jambes en Lourd qui admet la variante — ou `null` : ni activité notée hier, ni
  // réponse « plus léger », ni barre admise, ni séance où la règle se tait (Édition, « Juste un carnet », semaine de mesure, décharge).
  function barreLegereDuPlan(e, seance, exos, consignes, intentionProfil, bloquee) {
    var a = e.activiteVeille;
    if (!a || typeof a !== 'object' || !a.slug || !Moteur().activiteChargeLesJambes(a.slug)) return null;
    if (seance.edition || intentionProfil === 'entretien' || bloquee) return null;
    return jambesLourdesDuPlan(e, exos, consignes).filter(function (j) { return j.legere; })[0] || null;
  }
  function veilleActiviteDuPlan(e, seance, exos, consignes, intentionProfil, bloquee) {
    var a = e.activiteVeille;
    if (!a || typeof a !== 'object' || !a.slug) return null;
    return Moteur().veilleActivite({
      activite: { slug: a.slug, nom: a.nom || null, intense: true },
      jambes: jambesLourdesDuPlan(e, exos, consignes),
      choix: e.veilleChoix === 'leger' || e.veilleChoix === 'garder' ? e.veilleChoix : null,
      muet: !!seance.edition || intentionProfil === 'entretien' || !!bloquee
    });
  }
  // Les gestes de la variante : `veille_legere` (la réponse « plus léger », `{ slug }`) et `veille_legere_annulee` (« Changer »). La séance terminée
  // qui garde un `veille_legere` non annulé est NEUTRE pour la suite (comme une séance ajustée à la forme du jour : ni compteur, ni référence de
  // consigne, ni stagnation, ni baisse) — l'app lit cette seule fonction. Rend le slug de la barre, ou `null`.
  function veilleLegereDesGestes(gestes) {
    var slug = null;
    (Array.isArray(gestes) ? gestes : []).forEach(function (g) {
      if (!g) return;
      if (g.geste === 'veille_legere') slug = g.slug || null;
      else if (g.geste === 'veille_legere_annulee') slug = null;
    });
    return slug;
  }

  // X3 (253, MOTEUR §9.40) — LA RÉPONSE VAUT POUR LA JOURNÉE. Une séance abandonnée est SUPPRIMÉE (ses gestes avec elle) : la réponse du jour vit
  // donc sur l'appareil, `{ jour, choix, heure }` (comme les « Non merci » des chauffes, aucune colonne). Deux fonctions pures ; l'app lit et écrit.
  //   · `veilleDuJour(memoire, jour)` : la réponse de CE jour civil local, ou `null` (un autre jour, un choix inconnu : rien n'est repris) ;
  //   · `noterVeilleDuJour(jour, choix, heure)` : la mémoire à écrire.
  function veilleDuJour(memoire, jour) {
    var m = memoire && typeof memoire === 'object' ? memoire : null;
    if (!m || !jour || m.jour !== jour || (m.choix !== 'leger' && m.choix !== 'garder')) return null;
    return { choix: m.choix, heure: typeof m.heure === 'number' && isFinite(m.heure) ? m.heure : null };
  }
  function noterVeilleDuJour(jour, choix, heure) {
    if (!jour || (choix !== 'leger' && choix !== 'garder')) return null;
    return { jour: jour, choix: choix, heure: typeof heure === 'number' && isFinite(heure) ? heure : null };
  }
  // La ligne qui DIT la réponse + « Changer » : « Squat plus léger aujourd'hui. » dans la séance où elle a été donnée, « Comme ce matin : squat plus léger. »
  // quand une nouvelle séance du jour l'a REPRISE (`e.veilleReprise` : { slug, heure }). Une seule fonction de phrase (`Moteur.phraseDeLaVeilleReprise`).
  // Seulement quand la réponse est celle de la séance (`e.veilleChoix`), que le fait de la veille est toujours là et qu'une barre admet la variante.
  // Jamais en Édition ni en « Juste un carnet ».
  function veilleRepriseDuPlan(e, seance, exos, consignes, intentionProfil, bloquee) {
    var a = e.activiteVeille, r = e.veilleReprise && typeof e.veilleReprise === 'object' && e.veilleReprise.slug ? e.veilleReprise : null;
    if (!a || !a.slug) return null;
    if (e.veilleChoix !== 'leger' && e.veilleChoix !== 'garder') return null;
    var barre = barreLegereDuPlan(e, seance, exos, consignes, intentionProfil, bloquee);
    if (!barre) return null;
    return { choix: e.veilleChoix, slug: barre.slug, nom: barre.nom, lien: 'Changer', repris: !!r,
             phrase: Moteur().phraseDeLaVeilleReprise({ choix: e.veilleChoix, nom: barre.nom, heure: r && typeof r.heure === 'number' ? r.heure : null, repris: !!r }) };
  }

  function planDeSeance(entrees) {
    var e = entrees || {};
    var seance = e.seance || {};
    var consignes = e.consignes || {};
    var exos = seance.exercices || [];
    var phase = phaseDuPlan(e.phase);
    var objectif = objectifDuPlan(e.objectif);
    // 237 (MOTEUR §9.41) — ce que la décision des chauffes lit de la séance et de l'historique (faits de l'app, jamais relus ici).
    var ctxChauffes = { objectif: objectif, peuDeTemps: !!e.raccourci, zonesMenagees: e.zonesMenagees || null,
                        e1rms: e.e1rms || null, ajoutees: e.chauffesAjoutees || null, gestes: seance.gestes,
                        duCoach: e.chauffesDuCoach || null, protegee: protegeeDeEntrees(e) };
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
    // §9.17 bis (127) — L'ÉCHELLE DES VARIANTES : la réponse à la carte « marche suivante » (`profiles.marche_reponses`,
    // par exercice de départ) et, par exercice d'échelle, ce que l'app a lu au catalogue et dans les faits
    // (`echelles[slug]` : `{ marche, nomCible, aide, cibleHabilete, cibleFaiteLe }`). Le plan décide de la carte ;
    // il recopie la réponse, et le dit (I49).
    var marcheReponses = reponsesEnCharges(e, e.marcheReponses && typeof e.marcheReponses === 'object' &&
      !Array.isArray(e.marcheReponses) ? e.marcheReponses : {});
    var echelles = e.echelles || {};
    // 149 (MOTEUR §9.17 ter) — LES FIGURES : par exercice d'une échelle de figures (marches en secondes, lues au
    // catalogue par l'app), `{ tenues, dessous, seuil }` — la tenue max de chaque séance faite (la plus récente en
    // dernier : un fait de `faits.js`), le nom de la marche d'en dessous (`null` au rang 1) et le seuil de la marche
    // (`echelle_seuil_s`). Le plan décide ; il recopie ce qu'il a reçu.
    var figures = e.figures && typeof e.figures === 'object' && !Array.isArray(e.figures) ? e.figures : {};
    var marchesPosees = {};
    // 149 — le réglage de rythme (`prudent`, `normal`, `franc`), normalisé : il décide du nombre de séances que lit la
    // carte « marche suivante » et la carte du lest (Franc : une), et de la part de la tenue max (figures).
    var reglagePlan = e.reglage === 'franc' || e.reglage === 'prudent' ? e.reglage : 'normal';
    // 60-1 (QUESTIONNAIRE-COACH-V2 §4) — « JUSTE UN CARNET » : en Entretenir
    // (le profil), aucun bandeau de décharge planifiée, aucune fenêtre de
    // semaine allégée, aucune carte. Le coach ne dit rien, il ne propose rien ;
    // la séance reste celle que la personne a posée. I13 le garde.
    var esc = intentionProfil === 'entretien' ? { allegee: null, carte: null } : escalierDuPlan(e, seance, consignes);
    var seriesRoutine = (e.escalier && e.escalier.seriesRoutine) || {};
    // §14 (111) — le DÉBUTANT (« moins d'un an », `Profil.estDebutant`), gelé
    // pour la séance par l'app : la dégressive proposée ne lui est jamais faite.
    var debutant = e.debutant === true;
    var protegee = protegeeDeEntrees(e);
    var isoles = marchesIsolees(e, seance, consignes, esc, phase, intentionProfil);
    // PR 3 (relevé du 01/10) — la dernière séance de chaque exercice, pour le
    // pré-remplissage des lignes que le plan ne couvre pas.
    var precedents = e.precedents || {};
    // 189 — « UNE SÉRIE DE MOINS » EN COURS (la réponse à la carte, tant que la sèche dure) : l'escalier ne propose plus de
    // série de plus, et la dégressive proposée n'ajoute rien non plus.
    var moinsActive = serieDeMoinsEnCours(e, seance, intentionProfil) && !esc.allegee;
    var moins = moinsActive ? seriesDeMoinsActives(e, seance, consignes) : {};
    if (moinsActive) {
      Object.keys(isoles).forEach(function (sl) {
        if (isoles[sl] && isoles[sl].marche === Moteur().MARCHE_SERIE_DE_PLUS) delete isoles[sl];
      });
    }
    var plus = moinsActive ? {} : seriesDePlusActives(e, seance, consignes, esc, phase);
    var degPlus = degressivesActives(e, seance, consignes, esc, phase, intentionProfil);
    // 174 — la 4e marche en cours ; la dégressive est retirée tant qu'elle dure.
    var alleges = allegementsActifs(e, seance, consignes, esc, phase);
    Object.keys(alleges).forEach(function (sl) { delete degPlus[sl]; });
    // Une marche par EXERCICE (I21) : un exercice présent deux fois dans la
    // séance ne la porte que sur sa première occurrence ; le repli, lui, est la
    // consigne de l'exercice — les deux occurrences la lisent.
    var portee = {};
    // 193-4 — la semaine de mesure de ce jour, ou `null` : la barre testée, les barres qui restent normales.
    var jourDeTest = intentionProfil === 'entretien' ? null : semaineDeTestDuJour(e, seance, exos);
    // 253 (X2) — la variante « plus léger » de la veille : se tait en semaine de mesure et en semaine allégée / décharge ; la barre qui la porte aujourd'hui
    // (réponse « plus léger » donnée) est lue ici, une fois, et lue par `planDeLOccurrence`.
    var blocageVeille = !!esc.allegee || !!jourDeTest;
    var barreLegere = e.veilleChoix === 'leger' ? barreLegereDuPlan(e, seance, exos, consignes, intentionProfil, blocageVeille) : null;
    var plan236 = {
      seance: seance.id === undefined ? null : seance.id,
      semaineDeTest: jourDeTest ? { debut: jourDeTest.debut, fin: jourDeTest.fin, jour: jourDeTest.jour, testee: jourDeTest.testee, conflits: jourDeTest.conflits, barres: jourDeTest.barres.map(function (q) { return q.slug; }),
        faites: jourDeTest.faites.slice(),
        sansEssai: jourDeTest.barres.filter(function (q) { return q.testable === false; }).map(function (q) { return q.slug; }) } : null,
      phase: phase,
      objectif: objectif,
      priorites: priorites,
      // §9.17 — l'Édition d'une séance passée, l'intention du profil et la
      // réponse du lest : trois faits que les invariants relisent (I13, I29).
      edition: !!seance.edition,
      intention: intentionProfil,
      debutant: debutant,
      // PR 4a (§9.26 bis) — la population protégée : le plancher de réserve (2) s'applique à l'affichage, au pari, à la garde, à la veille légère.
      protegee: protegee,
      // 191 — la prudence de montée (plafond, un cran à la fois), lue par les invariants I71 et I73.
      prudence: prudenceDuPlan(e),
      lestReponse: lestReponse,
      marcheReponses: marcheReponses,
      // 149 — le réglage de rythme, pour que les invariants (I29, I49, I50, I52 à I55) le relisent.
      reglage: reglagePlan,
      allegee: esc.allegee,
      carte: esc.carte,
      // 198 — en sèche, sous 5 % : la phrase descriptive (sans carte, sans geste), ou `null`.
      baisseAttendue: esc.attendue || null,
      // 189 — la série de moins en cours, ou `null` : de quoi dire le bandeau et son geste « Revenir à mes séries ».
      serieDeMoins: moinsActive ? serieDeMoinsDuPlan() : null,
      // §9.22 (53-2) — les exercices d'un bloc en cours ce jour-là (I39).
      programme: { enBloc: enBlocDuJour(e, seance) },
      // 194-1 (MOTEUR §9.31) — la mobilité : le bloc d'avant et celui de fin, ou `null` ; le plan le décide, l'écran le dessine.
      mobilite: mobiliteDuPlan(e, seance, exos, intentionProfil),
      // 197 (MOTEUR §9.36) — la puissance des 65 ans et plus : un exercice et sa phrase, ou `null`.
      puissance: puissanceDuPlan(e, seance, exos, intentionProfil),
      // 225 (MOTEUR §9.40) — la veille d'une activité dure : une proposition (« … en Mix aujourd'hui » / « Comme prévu »), ou `null`.
      veilleActivite: veilleActiviteDuPlan(e, seance, exos, consignes, intentionProfil, blocageVeille),
      // X3 (253) — la réponse du matin REPRISE par une nouvelle séance du jour : sa ligne et son « Changer », ou `null`.
      veilleReprise: veilleRepriseDuPlan(e, seance, exos, consignes, intentionProfil, blocageVeille),
      exercices: questionsDuPlan(exos.map(function (exoBrut, i) {
        // 132 (MOTEUR §10 ter) — UN EXERCICE NOTÉ PAR NOM : sa salle est la liste de ses élastiques (`cat.salle`,
        // `materiel: 'elastique'`). Ses séries entrent avec leur charge VIRTUELLE (`THProfil.seriesPourLeMoteur` :
        // la séance du jour garde ses lignes, une ligne pas encore remplie se lit sans charge) ; tout ce que le plan
        // rédige pour lui se dit par les NOMS (`THModele.avecNoms`, le formateur) ; ses lignes se pré-remplissent d'un
        // nom, jamais d'une charge virtuelle (`enNoms`).
        var salleEl = salleElastiqueDuPlan(e, exoBrut && exoBrut.exercise_slug);
        return Voix().avecNoms(salleEl ? salleEl.noms : null, function () {
          var exo = salleEl ? exoPourLeMoteur(exoBrut, salleEl) : exoBrut;
          return avecDureeDeMobilite(sansParis(enNoms(planDeLOccurrence(exo, i, salleEl), salleEl), salleEl), exoBrut && exoBrut.exercise_slug);
        });
      }), e.reserve, seance, protegee)
    };
    // PR 3 (§9.45, B4) — le bandeau ne dit « avec de la marge » que si une cible baisse dans la séance.
    margeDuBandeau(plan236);
    // 20/11/2026 (MOTEUR §9.52) — le repos conseillé de chaque exercice, lu sur le plan fini ; rien n'est écrit.
    reposConseillesDuPlan(plan236, e, seance);
    // 236 (MOTEUR §9.39) — le coach en temps réel après un raté : lu sur le plan fini, posé sur lui.
    // 21/11/2026 (« Simplifier », pilote 3+1) — LA TÊTE DE CHAQUE EXERCICE et sa file de décision, lues sur le plan fini (rien n'est écrit en base).
    return tetesDuPlan(reactionsDuPlan(plan236, e, seance), e);
    function planDeLOccurrence(exo, i, salleEl) {
        var slug = exo && exo.exercise_slug;
        // 221 (MOTEUR §19.2) — LE BLOC HYPERTROPHIE : squat et couché gardent une grosse série (Lourd, garde 1) puis des reculs aux reps
        // du bloc (193-1/193-5) ; le soulevé reste en Mix. La structure se lit ici, une fois, sur le bloc en cours (jamais l'écran) ; les
        // séries de la séance ne sont pas modifiées : le plan lit une COPIE dont les séries suivantes sont des reculs.
        var prB = e.programme || {};
        var stBloc = slug && !salleEl ? Moteur().structureDeBlocDuJour(prB.blocs, slug, seance.debut,
          prB.familles && Object.prototype.hasOwnProperty.call(prB.familles, slug) ? prB.familles[slug] : null) : null;
        if (stBloc && stBloc.grosse) exo = Object.assign({}, exo, { series: Moteur().seriesEnGrosseEtReculs(exo.series, stBloc) });
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
        // PR 2 « Sans coach par exercice » — LE SILENCE se lit sur `occurrenceSansCoach` (le geste « Sans coach cette fois » OU la douleur) ;
        // `douloureuse` reste le FAIT de santé (`x.douleur`, la carte, la phrase du kiné, le test prudent). `sansCoachX` porte la porte.
        var sansCoachX = Seance().occurrenceSansCoach(exo);
        var sansCoachChoisi = sansCoachX && !douloureuse;
        var c = coachee && !sansCoachX && Object.prototype.hasOwnProperty.call(consignes, slug) ? consignes[slug] : null;
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
        // PR 4b (R-A) — « TENTER » : le plafond après un zéro mord (consigne `tenue_apres_zero`) ; le bouton se lit sur `sans`, et le geste, pris, rend à la séance la
        // consigne d'avant plafond (jamais une série passée).
        var tenueZ = c && c.consigne && coachee && !sansCoachX && !seance.edition ? Moteur().boutonsDeLaTenue(c.consigne) : null;
        var tenteZ = !!tenueZ && zeroTenteDe(seance.gestes, slug);
        if (tenteZ) c = Object.assign({}, c, { consigne: Moteur().tenterApresUnZero(c.consigne), libelles: c.libellesTentee || c.libelles });
        // 253 (X2, MOTEUR §9.40) — « PLUS LÉGER AUJOURD'HUI » (la veille d'une activité dure) : la ligne de la consigne descend (× 0,95, au cran, mêmes
        // reps), la zone ne change pas, la consigne le dit (`veilleLegere`). Une barre déjà allégée (repli, « plus léger » de la reprise) n'en reçoit pas.
        var legereX = barreLegere && barreLegere.slug === slug && barreLegere.legere && coachee && !sansCoachX && !salleEl && c && c.consigne &&
          !c.consigne.plusLegere && !c.consigne.repli && !c.consigne.allegee ? barreLegere.legere : null;
        if (legereX) {
          c = Object.assign({}, c, { consigne: Object.assign({}, c.consigne, { ligne: { charge: legereX.charge, vise: legereX.reps }, haut: null,
            veilleLegere: { charge: legereX.charge, reps: legereX.reps, reserve: legereX.reserve, plan: legereX.plan } }) });
        }
        var suites = e.suites || {};
        var suite = Object.prototype.hasOwnProperty.call(suites, slug) ? suites[slug] : null;
        suite = suiteSousRegime(suite, e, seance, slug);
        var m = coachee && Object.prototype.hasOwnProperty.call(isoles, slug) ? isoles[slug] : null;
        if (m && portee[slug]) m = m.repli ? { marche: m.marche, repli: m.repli, copie: true } : null;
        if (m) portee[slug] = true;
        // 60-1 — « JUSTE UN CARNET » : un exercice en Entretenir (le profil, ou
        // son propre mode) n'a ni chauffes calculées ni dégressive proposée. Sans
        // matériel, `chauffesEtDegressive` se tait : une seule porte, ici.
        var modeX = Object.prototype.hasOwnProperty.call(modes, slug) && modes[slug] ? modes[slug] : null;
        var intentionX = Moteur().intentionDe(intentionProfil, modeX);
        var x = planDExercice(exo, i, c, Seance().parisDeLOccurrence(e.paris || [], seance, i), seance.id, e.reglage, suite, seance.debut,
          intentionX === 'entretien' || salleEl ? null : materielDe(exos, i, e.catalogue || null, c, e.refusChauffes || {}, ctxChauffes), phase,
          esc.allegee ? { decharge: esc.allegee.source === SOURCE_DECHARGE, semaine: esc.allegee.semaine, semaines: esc.allegee.semaines } : null, Object.prototype.hasOwnProperty.call(seriesRoutine, slug) ? seriesRoutine[slug] : null, m,
          Object.prototype.hasOwnProperty.call(plus, slug) ? plus[slug] : null,
          Seance().exerciceFini(seance, slug),
          precedentPourLeMoteur(Object.prototype.hasOwnProperty.call(precedents, slug) ? precedents[slug] : null, salleEl),
          objectif, Object.prototype.hasOwnProperty.call(alleges, slug) ? alleges[slug] : null,
          coachee && Object.prototype.hasOwnProperty.call(moins, slug) ? moins[slug] : null,
          e.reculs && Object.prototype.hasOwnProperty.call(e.reculs, slug) ? e.reculs[slug] : null,
          // 251 (D2) — la porte du cran (ses gestes), sauf là où le coach se tait. (Un 21e argument : aucun objet d'options existant ne porte ces faits.)
          coachee && c && !sansCoachX && intentionX !== 'entretien' && !seance.edition && !esc.allegee && !jourDeTest && !legereX
            ? { tente: cranTenteDe(seance.gestes, slug), formeAjustee: formeAjusteeAvant(seance, i), prise: priseDe(seance.gestes, slug) } : null,
          protegee, familleDeLExercice(e, slug));
        // 253 (X2) — ce jour-là, sur cette barre : pas d'échec, pas de pari (donc ni pari perdu, ni compteur, ni escalier), pas de
        // réserve visée ni d'effort visé (la réserve affichée est celle de la variante), pas de réaction au raté (voir `reactionDExercice`).
        x.tenueZero = null;
        if (tenueZ && !(x.lignes || []).some(function (l) { return laLigneAUnSens(l) && l.validee; })) {   // une fois la 1re série de travail validée, le choix est fait
          var lTenue = (x.lignes || []).filter(function (l) { return laLigneAUnSens(l) && !l.validee; })[0];
          x.tenueZero = { iSerie: lTenue ? lTenue.iSerie : null, tente: tenteZ, charge: tenueZ.charge, bouton: tenueZ.bouton, annuler: tenueZ.annuler };
        }
        x.veilleLegere = null;
        if (legereX) {
          x.veilleLegere = { charge: legereX.charge, reps: legereX.reps, reserve: legereX.reserve, plan: legereX.plan, baisse: legereX.baisse,
                             phrase: Moteur().phraseDeLaVeilleLegere(legereX, e.activiteVeille && e.activiteVeille.nom) };
          x.paris = (x.paris || []).map(function () { return null; });
          x.premierPari = null;
          if (x.pourquoi) x.pourquoi.veille = x.veilleLegere.phrase;
        }
        // F2 (MOTEUR §9.49, I168) — LES ROUTINES NE SONT PAS PRÊTES (`entrees.routinesPretes === false` ; absent = prêtes) : l'app ne donne ni suite ni consigne
        // figée à un exercice à zone de plan. Un exercice FINI dont la suite se tait ne montre ni constat ni l'en-tête d'avant (`x.suiteMuette`, lu par
        // l'écran).
        x.suiteMuette = false;
        if (e.routinesPretes === false) {
          if (x.zonePlan && Seance().exerciceFini(seance, slug)) x.suiteMuette = true;
        }
        x.blocHypertrophie = stBloc ? { zone: stBloc.zone, grosse: stBloc.grosse === true,
          reculs: stBloc.grosse ? (exo.series || []).filter(function (q) { return racine.THModele.typeDe(q) === 'recul'; }).length : 0 } : null;
        x.semaineDeTest = semaineDeTestDExercice(jourDeTest, e, seance, exos, i, x,
          intentionX === 'entretien' || salleEl ? null : materielDe(exos, i, e.catalogue || null, c, e.refusChauffes || {}, ctxChauffes), intentionX, coachee && !sansCoachChoisi, douloureuse);
        if (x.escalier && x.escalier.copie) x.escalier = null;
        x.chauffesPosees = chauffesPoseesDe(seance.gestes, slug, x);
        x.silenceChauffes = silenceChauffesDe(seance.gestes, slug, (e.catalogue && e.catalogue[slug] && e.catalogue[slug].nom) || null, x);
        // MOTEUR §14.6 (49-U16) — LA PLACE POUR UNE SÉRIE DE PLUS : de la place
        // sur CHACUN des muscles primaires de l'exercice (catalogue), lue dans
        // `entrees.volume`. Un fait, rien d'affiché : la série de plus (PR 2c)
        // le lira. `null` sans entrée de volume.
        x.placeSerieDePlus = placeDeLExercice(e, slug, phase);
        // 175 (MOTEUR §10 bis) — LE TEMPO LENT EN COURS : le levier « Tempo lent » accepté, pas de progrès depuis — la consigne le
        // dit (« 3 s en descente, jusqu'à ton prochain progrès »), même charge, même zone. Le coach actif seulement.
        x.tempo = null;
        if (coachee && c && c.consigne && c.compteur && typeof c.compteur.compteur === 'number' && e.escalier &&
            !seance.edition && !esc.allegee && intentionX !== 'entretien' && slug) {
          var Mt = Moteur(), jT = Mt.jourCivil(seance.debut);
          if (jT && Mt.levierActif(slug, jT, c.compteur.compteur, e.escalier.marches || [], e.escalier.compteurs || [], Mt.LEVIER_TEMPO)) {
            var capT = Voix().capturer(function () { return Mt.grisTempo(); });
            x.tempo = { descente: Mt.TEMPO_DESCENTE_S, phrase: capT.texte };
            x.entete.tempo = capT.texte;
            x.phrases.push({ ou: 'entete.tempo', texte: capT.texte, citations: capT.citations });
          }
        }
        // 175 — LES LEVIERS GARDÉS pour la page de l'exercice (« Pour continuer à monter ») : à la plus lourde de la salle, une fois
        // la carte des leviers montrée (répondue ou non) depuis le dernier progrès. `null` sinon.
        x.leviersGardes = null;
        if (coachee && c && c.consigne && c.compteur && typeof c.compteur.compteur === 'number' && e.escalier &&
            !seance.edition && !esc.allegee && intentionX !== 'entretien' && slug && auPlafond(c)) {
          var Ml = Moteur(), jL = Ml.jourCivil(seance.debut), pl = Ml.plafondDeLaConsigne(c.consigne, c.salle);
          var vue = jL && pl ? Ml.marcheProposee(slug, jL, c.compteur.compteur, e.escalier.marches || [], e.escalier.compteurs || [], Ml.MARCHE_LEVIERS) : null;
          if (vue || (x.escalier && x.escalier.marche === Ml.MARCHE_LEVIERS)) {
            var remp = Ml.remplacantAuPlafond(remplacantsDe(e, slug), pl.charge);
            x.leviersGardes = { plafond: { charge: pl.charge, reps: pl.reps },
                                leviers: leviersDe(remp ? { slug: remp.slug, nom: remp.nom || remp.slug, mesure: remp.mesure, salle: remp.salle || null } : null,
                                                   pl, slug, jL, c.compteur.compteur, e.escalier.marches || [], e.escalier.compteurs || []) };
          }
        }
        // 187 (MOTEUR §9.21 bis) — LE CALAGE DE LA PREMIÈRE SÉANCE : un exercice sans historique ni charge de départ.
        // 187 (A4) — UNE ZONE À MÉNAGER : l'exercice qui la charge ne reçoit aucune série lourde (le moteur prend Mix quand la zone
        // aurait été Lourd, sauf zone choisie par la personne). Le plan porte le fait pour I75.
        var zm = e.zonesMenagees && Object.prototype.hasOwnProperty.call(e.zonesMenagees, slug) ? e.zonesMenagees[slug] : null;
        x.menagee = zm && coachee && !sansCoachX ? { zones: (zm.zones || []).slice(), choisie: zm.choisie || null } : null;
        x.calage = coachee && !sansCoachX && !salleEl && intentionX !== 'entretien' && !seance.edition
          ? calageDuPlan(x, exo, c, e, slug, seance) : null;
        poserLeCalage(x);
        poserLaReponseDuCalage(x);
        // 188-2 (MOTEUR §9.27 bis, I76) — LE REPOS D'UN GROS MOUVEMENT QUI STAGNE : une seule ligne dans le « Pourquoi », jamais une
        // carte. Les reps chutent d'au moins 30 % de la série 1 à la série 3 sur 3 séances (un fait, `entrees.chutesDeReps`), le
        // repos RÉGLÉ de l'exercice est de 90 s ou moins, l'exercice est un gros mouvement et le compteur de stagnation parle.
        x.reposLong = reposDuPlan(x, exo, c, e, slug, coachee && !sansCoachX && intentionX !== 'entretien' && !seance.edition && !esc.allegee);
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
        // 154 (MOTEUR §9.26) — L'EFFORT VISÉ : « garde-en N » dans l'en-tête, les puces sous la dernière série, la phrase.
        var rvElig = aUnPari(x) && !seance.edition && !legereX && Moteur().effortViseEligible(x.consigne.palier, x.mesure);
        // Lot F, A1 (I241) — `famille` : le plancher de la barre (l'affichée seulement ; `reserveVisee` l'ignore).
        x.familleDeBarre = familleDeLExercice(e, slug);
        var rvOptions = { zone: x.consigne ? x.consigne.zone : null, role: rvElig ? roleDeLaVisee(x) : 'ligne', reglage: reglagePlan, famille: x.familleDeBarre };
        // PR 4a (§9.26 bis) — DEUX valeurs : `reserveVisee`, la table (le déclencheur du test) ; `reserveAffichee`, le plancher pour la population
        // protégée (ce que l'écran affiche, ce que le pari écrit). Sur une ligne de test protégée : aucune réserve affichée, donc aucun effort
        // visé ni question de réserve.
        var rvTable = rvElig ? Moteur().reserveVisee(rvOptions) : null;
        // PR 4b (R-A, O5) — pendant le plafond, aucun effort visé (jamais « garde 1 » juste après un zéro : I154) : ni la table ni l'affichée.
        if (x.consigne && x.consigne.fondement && x.consigne.fondement.plafondZero && x.consigne.fondement.plafondZero.mord === true) { rvElig = false; rvTable = null; }
        var rvX = rvElig ? Moteur().reserveAffichee(Object.assign({ protegee: protegee, repriseLongue: Moteur().enRepriseLongue(x.consigne) }, rvOptions)) : null;
        x.reserveVisee = rvTable;
        x.reserveAffichee = rvX;
        // 175 — « un cran de moins » : le recul de la règle de bord (174) se dit à côté du chiffre du jour, d'un badge. Le plan le dit, l'écran le dessine.
        x.cranDeMoins = x.consigne && (x.consigne.etat === 'bord_recul' || x.consigne.etat === 'bord_vague') ? 'un cran de moins'
          // PR 2 (§9.42) — après un zéro rep, le recul est de ~5 % (le cran le plus proche), pas d'« un cran » : le badge dit le fait, « plus léger ».
          : x.consigne && x.consigne.etat === 'zero_rep' ? 'plus léger' : null;
        x.effortVise = rvX === null ? null : effortViseDuPlan(exo, rvX, suite, Seance().exerciceFini(seance, slug));
        // PR 4a (§9.26 bis, D-B3) — « Me pousser » écrasé par le plancher : une ligne du « Pourquoi », rédigée sous capture (I26).
        x.plancher = null;
        // Lot F, A1 (I241, CONTRA-TT3-A1 G) — le plancher de la BARRE relève la table : sa ligne, dans tous les réglages (le soulevé en Normal compris), sur
        // le modèle de `phraseDuPlancher` ; la population protégée et la reprise longue gardent la leur (en Franc), qui prime quand les deux relèvent.
        var pbX = Moteur().plancherDeBarre(x.familleDeBarre);
        var parPopulation = (protegee || Moteur().enRepriseLongue(x.consigne)) && reglagePlan === 'franc';
        var parBarre = !parPopulation && pbX !== null && rvTable !== null && pbX > rvTable;
        if ((parPopulation || parBarre) && rvX !== null && rvTable !== null && rvX > rvTable && x.pourquoi) {
          var capPl = Voix().capturer(function () {
            return parBarre ? Moteur().phraseDeLaBarre(rvX, reglagePlan) : Moteur().phraseDuPlancher(rvX);
          });
          x.pourquoi.plancher = capPl.texte;
          x.plancher = { visee: rvX, table: rvTable, phrase: capPl.texte };
          x.phrases.push({ ou: 'pourquoi.plancher', texte: capPl.texte, citations: capPl.citations });
        }
        poserLesSources(x);
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
        x.sansCoach = sansCoachX;   // PR 2 — le silence (le geste ou la douleur) ; `x.douleur` reste le fait
        x.carteReprise = null;
        if (c && c.reprise && c.reprise.douleur === true && !choixReprise && !seance.edition && x.consigne) {
          var M3 = Moteur(), V3 = Voix();
          var nomR = cat && cat.nom ? cat.nom : slug;
          // « Comme avant » cite la ligne du jour : elle se vérifie comme toute
          // phrase du coach (I26). « Plus léger » est le libellé d'un CHOIX —
          // sa ligne n'est pas celle du jour tant qu'on ne l'a pas choisie ;
          // une fois choisie, I22 et I35 vérifient la charge du repli.
          var capAv = V3.capturer(function () { return M3.texteRepriseAvant(x.consigne); });
          // 202 — la douleur répétée : le compte des séances avec douleur (42 jours) et le premier frère proposé, lus sur les entrées.
          var compteR = e.nbDouleurs && Object.prototype.hasOwnProperty.call(e.nbDouleurs, slug) ? e.nbDouleurs[slug] : null;
          var frereR = e.freresDeReprise && e.freresDeReprise[slug] ? e.freresDeReprise[slug] : null;
          // 20/11/2026 — le dernier jour noté (≤ aujourd'hui), pour dater le titre de la carte.
          var jourR = M3.jourCivil(seance.debut);
          var joursR = e.douleurs && e.douleurs[slug] ? e.douleurs[slug].map(function (j) { return M3.jourCivil(j); }).filter(function (j) { return j && (!jourR || j <= jourR); }).sort() : [];
          var textesR = M3.carteRepriseTextes(nomR, x.consigne, c.reprise, { compte: compteR, frere: frereR, jour: joursR.length ? joursR[joursR.length - 1] : null });
          x.carteReprise = { titre: textesR.titre, phrase: textesR.phrase, choix: textesR.choix,
                             zone: c.reprise.zone, repli: c.reprise.repli || null, compte: compteR };
          x.phrases.push({ ou: 'reprise.avant', texte: capAv.texte, citations: capAv.citations });
        }
        x.carteLest = null;
        var kl = x.consigne;
        var fl = kl && kl.fondement ? kl.fondement.carteLest : null;
        if (!carteLestPosee && fl && kl.etat === 'carte_lest' && !kl.allegee) {
          carteLestPosee = true;
          var M2 = Moteur(), V2 = Voix();
          // 175 — la variante sans matériel (le catalogue la lit, `Modele.marcheSuivante`) : la carte propose les deux.
          var varianteLest = cat && cat.variante && cat.variante.slug ? cat.variante : null;
          var entreeLest = { niveau: Math.min.apply(null, fl.niveaux), bas: fl.bas, reglage: reglagePlan === 'franc' ? 'franc' : null,
                             variante: varianteLest ? (varianteLest.nom || varianteLest.slug) : null };
          var capLT = V2.capturer(function () { return M2.carteLestTitre(entreeLest); });
          var capLD = V2.capturer(function () { return M2.carteLestDetail(entreeLest); });
          x.carteLest = { titre: capLT.texte, detail: capLD.texte,
                          oui: varianteLest ? M2.OUI_LEST_VARIANTE : M2.OUI_LEST,
                          non: varianteLest ? M2.nonLestVariante(cat && cat.nom ? cat.nom : slug) : M2.NON_LEST,
                          niveaux: fl.niveaux.slice(), bas: fl.bas, haut: fl.haut,
                          leste: cat && cat.leste ? cat.leste : null };
          if (varianteLest) x.carteLest.variante = { slug: varianteLest.slug, nom: varianteLest.nom || varianteLest.slug };
          // §20 bis — le titre et le détail se vérifient comme toute phrase du coach.
          x.phrases.push({ ou: 'lest.titre', texte: capLT.texte, citations: capLT.citations });
          x.phrases.push({ ou: 'lest.detail', texte: capLD.texte, citations: capLD.citations });
        }
        // §9.17 bis (127) — LA CARTE « MARCHE SUIVANTE », comme la carte du lest : en tête de l'exercice, une par
        // exercice et par séance, jamais en semaine allégée, jamais en Entretenir, jamais avec la carte du lest. La
        // consigne n'est pas touchée : on tient la ligne. Ses entrées : la marche suivante et la date de la marche
        // proposée (l'app), les deux dernières séances (`deuxSeances`, le fondement de la consigne), la zone, la
        // réponse au profil, le jour de la séance. `Moteur.carteMarcheDecidee` décide ; le plan rédige.
        x.carteMarche = null;
        var ech = slug && Object.prototype.hasOwnProperty.call(echelles, slug) ? echelles[slug] : null;
        var zm = kl ? Moteur().zoneParCle(kl.zone) : null;
        if (ech && kl && zm && !kl.allegee && !x.carteLest && !marchesPosees[slug] && intentionX !== 'entretien' &&
            !seance.edition && !exo.essai_marche) {
          var M4 = Moteur(), V4 = Voix();
          var ds = kl.fondement && Array.isArray(kl.fondement.deuxSeances) ? kl.fondement.deuxSeances : [];
          var reponseM = Object.prototype.hasOwnProperty.call(marcheReponses, slug) ? marcheReponses[slug] : null;
          // 16/11/2026 (« Essayer la marche ») — les faits des gardes : les séries de travail restantes du départ, la douleur
          // (le jour, la reprise après une douleur, la douleur répétée), la marche déjà dans la séance ou dans la routine.
          var faitsEssai = faitsDeLEssai(e, seance, exo, slug, ech, douloureuse, c);
          var dM = M4.carteMarcheDecidee({ marche: ech.marche, nomCible: ech.nomCible, aide: ech.aide === true,
            haut: zm.haut, seances: ds, reponse: reponseM, cibleFaiteLe: ech.cibleFaiteLe || null,
            aujourdHui: seance.debut, coachActif: true, reglage: reglagePlan,
            nomDepart: cat && cat.nom ? cat.nom : slug, restantes: faitsEssai.restantes,
            douleur: faitsEssai.douleur, dejaLa: faitsEssai.dejaLa });
          if (dM) {
            marchesPosees[slug] = true;
            var capMT = V4.capturer(function () { return M4.carteMarcheTitre(dM); });
            var capMD = V4.capturer(function () { return M4.carteMarcheDetail(dM); });
            x.carteMarche = { titre: capMT.texte, detail: capMD.texte, oui: M4.ouiMarche(dM.nom), non: M4.NON_MARCHE,
                              cible: dM.cible, nom: dM.nom, type: ech.marche.type, proposable: ech.marche.proposable === true,
                              cibleHabilete: ech.cibleHabilete === true, aide: dM.aide, niveau: dM.niveau, charge: dM.charge,
                              essai: true, restantes: faitsEssai.restantes, bas: zm.bas, nomDepart: dM.nomDepart };
            x.phrases.push({ ou: 'marche.titre', texte: capMT.texte, citations: capMT.citations });
            x.phrases.push({ ou: 'marche.detail', texte: capMD.texte, citations: capMD.citations });
          }
        }
        // 149 (MOTEUR §9.17 ter) — LES FIGURES EN SECONDES : la tenue max, les tenues, la carte. Une règle par discipline,
        // branchée ici : le coach actif seulement (ni « Juste un carnet », ni Entretenir, ni Édition, ni « J'ai mal »), sur
        // la première occurrence de l'exercice, jamais avec une consigne (une figure n'a ni zone, ni palier).
        x.figure = null;
        var fig = slug && Object.prototype.hasOwnProperty.call(figures, slug) ? figures[slug] : null;
        if (fig && coachee && !c && !sansCoachX && x.mesure === 'temps' && intentionX !== 'entretien' && !seance.edition) {
          poserLaFigure(x, exo, fig, reglagePlan);
          var echF = Object.prototype.hasOwnProperty.call(echelles, slug) ? echelles[slug] : null;
          if (x.figure && echF && !marchesPosees[slug]) {
            var M5 = Moteur(), V5 = Voix();
            var tenuesF = x.figure.tenues.slice();
            if (x.figure.max !== null) tenuesF.push(x.figure.max);
            var reponseF = Object.prototype.hasOwnProperty.call(marcheReponses, slug) ? marcheReponses[slug] : null;
            var dF = M5.carteMarcheEnSecondes({ marche: echF.marche, nomCible: echF.nomCible, seuil: nombre(fig.seuil),
              tenues: tenuesF, duJour: x.figure.max !== null, reponse: reponseF, cibleFaiteLe: echF.cibleFaiteLe || null,
              aujourdHui: seance.debut, coachActif: true, reglage: reglagePlan });
            if (dF) {
              marchesPosees[slug] = true;
              var capFT = V5.capturer(function () { return M5.carteMarcheTitre(dF); });
              var capFD = V5.capturer(function () { return M5.carteMarcheDetail(dF); });
              x.carteMarche = { titre: capFT.texte, detail: capFD.texte, oui: M5.ajouterMarche(dF.nom), non: M5.NON_MARCHE,
                                cible: dF.cible, nom: dF.nom, type: echF.marche.type, proposable: echF.marche.proposable === true,
                                cibleHabilete: false, aide: false, niveau: dF.niveau, charge: null,
                                secondes: true, seuil: dF.seuil, tenues: tenuesF };
              x.phrases.push({ ou: 'marche.titre', texte: capFT.texte, citations: capFT.citations });
              x.phrases.push({ ou: 'marche.detail', texte: capFD.texte, citations: capFD.citations });
            }
          }
        }
        // 16/11/2026 (« Essayer la marche ») — sur la MARCHE essayée : la phrase « C'est fait … » et « Annuler », le repli,
        // la carte de fin (lue par la feuille de fin de séance). Le plan décide ; l'écran dessine.
        x.essaiMarche = essaiDeMarcheDuPlan(e, seance, exo, i, x);
        return x;
    }
  }

  // ── 16/11/2026 — ESSAYER LA MARCHE (MOTEUR §9.17 bis, delta du 16/11/2026 ; I49, I220 à I223) ──────────────────────────
  //
  // Les faits des gardes de la carte : les séries de TRAVAIL restantes (ni faites, ni chauffes) du départ, la douleur (« J'ai
  // mal » aujourd'hui, la reprise après une séance douloureuse, deux séances avec douleur ou plus : I113), la marche déjà dans
  // la séance (n'importe quelle occurrence : deux exercices de la même échelle s'éteignent l'un l'autre) ou dans la routine
  // (`ech.dansLaRoutine`, un fait de l'app).
  function faitsDeLEssai(e, seance, exo, slug, ech, douloureuse, c) {
    var S = Seance(), Mo = racine.THModele;
    var restantes = ((exo && exo.series) || []).filter(function (q) { return !!q && !S.partEnBase(q) && Mo.estTravail(q); }).length;
    var compte = e.nbDouleurs && Object.prototype.hasOwnProperty.call(e.nbDouleurs, slug) ? nombre(e.nbDouleurs[slug]) : null;
    var douleur = !!douloureuse || !!(c && c.reprise && c.reprise.douleur === true) || (compte !== null && compte >= 2);
    var cibles = ech && ech.marche && Array.isArray(ech.marche.cible) ? ech.marche.cible : [];
    var dansLaSeance = ((seance && seance.exercices) || []).some(function (q) { return !!q && cibles.indexOf(q.exercise_slug) >= 0; });
    return { restantes: restantes, douleur: douleur, dejaLa: dansLaSeance || (ech && ech.dansLaRoutine === true) };
  }
  // L'essai sur la marche : `{ depart, nomDepart, nom, n, faitesDepart, texte, annuler, repli, fin }`, ou `null` (pas un essai).
  //   · `texte` : « C'est fait : … », tant que la marche n'a pas de série faite ; `annuler` : « Annuler » à ce moment-là ;
  //   · `repli` : `{ texte, remettre, continuer, reps }` (`Moteur.repliDeLaMarche`), une fois ;
  //   · `fin` : `{ texte, oui, non, reps, routine }` (`Moteur.finDeLaMarche`) : la marche tenue, une routine manuelle, la
  //     marche hors d'un bloc du programme ; la feuille de fin la pose, « Oui » seul écrit dans la routine.
  function essaiDeMarcheDuPlan(e, seance, exo, i, x) {
    var em = exo && exo.essai_marche;
    if (!em || !em.depart || seance.edition) return null;
    var M = Moteur(), S = Seance(), Mo = racine.THModele;
    var cat = e.catalogue || {};
    var nomDe = function (s) { return cat[s] && cat[s].nom ? cat[s].nom : s; };
    // Le départ peut avoir quitté la séance (le catalogue du plan ne connaît que ses exercices) : son nom, gardé au clic.
    var nom = nomDe(exo.exercise_slug), nomDepart = cat[em.depart] && cat[em.depart].nom ? cat[em.depart].nom : (em.nomDepart || em.depart);
    var series = exo.series || [];
    var faites = series.filter(function (q) { return !!q && S.partEnBase(q); });
    var n = series.filter(function (q) { return !!q && Mo.estTravail(q); }).length;
    var exos = seance.exercices || [];
    var prec = exos[i - 1];
    var faitesDepart = prec && !prec.essai_marche && prec.exercise_slug === em.depart
      ? (prec.series || []).filter(function (q) { return !!q && S.partEnBase(q) && Mo.estTravail(q); }).length : 0;
    var out = { depart: em.depart, nomDepart: nomDepart, nom: nom, n: n, faitesDepart: faitesDepart, bas: nombre(em.bas),
                texte: null, annuler: null, repli: null, fin: null };
    if (!faites.length) {
      out.texte = M.phraseEssaiDeMarche({ nom: nom, n: n, faites: faitesDepart, nomDepart: nomDepart });
      out.annuler = M.ANNULER_ESSAI_MARCHE;
    }
    var r = M.repliDeLaMarche({ series: faites, bas: em.bas, repondu: !!em.repli });
    if (r) {
      out.repli = { reps: r.reps, texte: M.phraseRepliDeMarche({ nom: nom, reps: r.reps, nomDepart: nomDepart }),
                    remettre: M.remettreDepart(nomDepart), continuer: M.CONTINUER_MARCHE };
    }
    var fm = e.essaisDeMarche || {};
    var jourE = M.jourCivil(seance.debut);
    var blocs = jourE ? M.exercicesEnBloc((e.programme && e.programme.blocs) || [], jourE) : {};
    var enBloc = !!(blocs[em.depart] || blocs[exo.exercise_slug]);
    var f = M.finDeLaMarche({ faites: faites, bas: em.bas, manuelle: fm.manuelle === true, enBloc: enBloc });
    if (f && em.repli !== 'remis') {
      out.fin = { reps: f.reps, routine: fm.routine || '', oui: M.ouiFinDeMarche(fm.routine || ''), non: M.JUSTE_AUJOURDHUI_MARCHE,
                  texte: M.phraseFinDeMarche({ nom: nom, reps: f.reps, nomDepart: nomDepart, routine: fm.routine || '' }) };
    }
    out.enBloc = enBloc;
    out.manuelle = fm.manuelle === true;
    return out;
  }

  // ── 149 (MOTEUR §9.17 ter) — LES FIGURES EN SECONDES : LA TENUE MAX ET LES TENUES DU COACH ───────────────────────
  //
  // Un exercice d'une échelle de figures (`fig`, donné par l'app) se coache en SECONDES, sans charge :
  //   · la PREMIÈRE série de travail est la tenue max (`l.tenue = 'max'`, étiquette « max ») ; son fantôme est le max de la
  //     dernière séance (`fig.tenues`, le dernier) — « Ton max la dernière fois… », ou « Première fois ici… » ;
  //   · une fois la tenue max VALIDÉE, chaque autre série de travail (`l.tenue = 'tenue'`) vise `max(2, arrondi(part × max du
  //     jour))` — part 50 / 60 / 70 % selon le réglage ; avant : pas de durée (« — s », « après ton max » sur la
  //     première) ; une tenue suivante plus longue ne change rien (une seule tenue max, la première) ;
  //   · le coach ne pose ni n'enlève de ligne : leur nombre vient de la routine ou de la personne ;
  //   · AUCUN pari (`predictions` : rien), ni chauffe ni dégressive : la ligne ne porte que `vise`.
  //   · le RÔLE PROPRE de ces lignes est `l.tenue` ; leur `role` reste `hors` (aucune consigne ne les couvre : I1 à I48,
  //     écrits pour la charge, ne les voient pas).
  // `x.figure` : `{ dernier, tenues, max, vise, part, reglage, battu, sous, premiere, dessous }` — de quoi I52 à I55
  // se vérifient. Les phrases se rédigent sous capture (§20 bis) et se posent sur la ligne max (`phraseAvant` au-dessus
  // tant que la tenue max n'est pas validée, `phraseApres` dessous ensuite).
  function poserLaFigure(x, exo, fig, reglage) {
    var S = Seance(), M = Moteur(), V = Voix();
    var series = (exo && exo.series) || [];
    var lignes = x.lignes || [];
    var travail = lignes.filter(function (l) { return l.type === 'travail'; });
    if (!travail.length) return;
    var tenues = (Array.isArray(fig.tenues) ? fig.tenues : []).map(nombre).filter(function (v) { return v !== null && v > 0; });
    var dernier = tenues.length ? tenues[tenues.length - 1] : null;
    var premiere = travail[0];
    var sPremiere = series[premiere.iSerie];
    var dMax = sPremiere && S.partEnBase(sPremiere) ? nombre(sPremiere.duree_s) : null;
    var max = dMax !== null && dMax > 0 ? dMax : null;
    var vise = max !== null ? M.dureeVisee(max, reglage) : null;
    var dessous = typeof fig.dessous === 'string' && fig.dessous ? fig.dessous : null;
    var avecDuree = function (l, d) { l.prerempli = Object.assign({}, l.prerempli || {}, { duree_s: d }); };
    travail.forEach(function (l, k) {
      if (k === 0) {
        l.tenue = 'max';
        l.vise = null;
        l.etiquette = 'max';
        avecDuree(l, dernier);
      } else {
        l.tenue = 'tenue';
        l.vise = vise;
        l.etiquette = k === 1 && max === null ? 'après ton max' : null;
        avecDuree(l, vise);
      }
    });
    premiere.phraseAvant = null;
    premiere.phraseApres = null;
    if (max === null) {
      var capA = V.capturer(function () { return M.phraseDeLaTenueMax({ dernier: dernier }); });
      premiere.phraseAvant = capA.texte;
      x.phrases.push({ ou: 'figure.avant', texte: capA.texte, citations: capA.citations });
    } else {
      var capP = V.capturer(function () { return M.phraseDesTenues({ max: max, dernier: dernier, vise: vise, dessous: dessous }); });
      premiere.phraseApres = capP.texte;
      x.phrases.push({ ou: 'figure.apres', texte: capP.texte, citations: capP.citations });
    }
    x.figure = {
      dernier: dernier, tenues: tenues, max: max, vise: vise, part: M.partDeLaTenue(reglage), reglage: reglage,
      premiere: dernier === null, battu: dernier !== null && max !== null ? max > dernier : null,
      sous: max !== null && max < M.TENUE_SOUS_S, dessous: dessous
    };
  }

  // ── 132 (MOTEUR §10 ter) — LES ÉLASTIQUES PAR LEUR NOM, DANS LE PLAN ──────────────────────────────────────────────
  //
  // La salle d'un exercice noté par nom (`entrees.catalogue[slug].salle`, `materiel: 'elastique'`), ou `null`.
  function salleElastiqueDuPlan(e, slug) {
    var cat = e && e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    var s = cat && cat.salle;
    return s && s.materiel === 'elastique' && s.noms && s.fiche ? s : null;
  }
  // La dernière séance de l'exercice (le pré-remplissage d'une ligne que le plan ne couvre pas), vue de même.
  function precedentPourLeMoteur(prec, salleEl) {
    if (!prec || !salleEl || !Array.isArray(prec.series)) return prec;
    return Object.assign({}, prec, { series: racine.THProfil.seriesPourLeMoteur(salleEl, prec.series, true) });
  }
  // La séance du jour d'un exercice noté par nom, vue par le moteur : chaque série avec sa charge virtuelle.
  function exoPourLeMoteur(exo, salleEl) {
    if (!exo) return exo;
    return Object.assign({}, exo, { series: racine.THProfil.seriesPourLeMoteur(salleEl, exo.series || [], true) });
  }
  // Le nom d'une charge virtuelle, ou `null`.
  function nomDuCran(salleEl, charge) {
    var c = nombre(charge);
    return c === null || !salleEl ? null : (Object.prototype.hasOwnProperty.call(salleEl.noms, String(c)) ? salleEl.noms[String(c)] : null);
  }
  // Ce que l'écran lit d'un exercice noté par nom : `x.elastique` (la liste, le sens, et les noms des crans pour le
  // seul affichage) ; le pré-remplissage de chaque ligne dit un NOM (`prerempli.elastique`) et jamais une charge —
  // la série écrit son nom et le kg déclaré d'une aide, à la validation (`THProfil.ecrireSerie`).
  function enNoms(x, salleEl) {
    if (!x || !salleEl) return x;
    x.elastique = { liste: (salleEl.liste || []).slice(), aide: salleEl.aide === true, noms: salleEl.noms };
    (x.lignes || []).forEach(function (l) {
      if (!l || !l.prerempli) return;
      l.prerempli = Object.assign({}, l.prerempli, { elastique: nomDuCran(salleEl, l.prerempli.charge_kg), charge_kg: null });
    });
    if (x.carteMarche && x.carteMarche.aide) x.carteMarche.elastique = nomDuCran(salleEl, x.carteMarche.charge);
    return x;
  }
  // ⚠️ AUCUN PARI SUR UN EXERCICE NOTÉ PAR NOM (rapporté le 22/10/2026, prompt 132 : la règle des paris ne s'applique
  // pas telle quelle aux charges virtuelles). Un pari s'écrit dans `predictions` (immuable) avec la charge de sa ligne
  // (`fondement.charge`, `palier`, `declencheur.charge`) : ce serait ÉCRIRE une charge virtuelle, que le §10 ter
  // interdit, et que les bilans des paris liraient comme des kilos. L'exercice est donc tenu hors de la règle, comme le
  // demande le prompt : ses lignes ne parient rien (I7 : « non pariée »), son compteur ne compte pas (il ne lit que les
  // séances sous consigne), l'escalier ne s'y déclenche pas. La décision (un pari qui écrit le NOM) est à prendre.
  // R2 (jour sans) — TOUS les paris de la séance plus légère après un zéro (la couverture, les reculs, la dégressive) ne se comptent pas (`Bilan.compteLe`, drapeau
  // `jourSans` du fondement) : la charge est descendue exprès, le pari est tenu à peu de frais. Rien n'est supprimé : `faits.parisRatesALaSuite` le lit toujours.
  function pariDuJourSans(paris, consigne) {
    var z = consigne && consigne.etat === 'zero_rep' && consigne.fondement ? consigne.fondement.zeroRep : null;
    if (!z || !z.jourSans || !Array.isArray(paris)) return paris;
    paris.forEach(function (q) { if (q && q.fondement) q.fondement.jourSans = true; });
    return paris;
  }
  function sansParis(x, salleEl) {
    if (!x || !salleEl || !Array.isArray(x.paris)) return x;
    x.paris = x.paris.map(function () { return null; });
    return x;
  }

  // La réponse « Pas maintenant » à la carte « marche suivante » d'un exercice noté par nom garde le NOM de l'élastique
  // (`profiles.marche_reponses[slug].aide`, une chaîne) : le plan la lit en charge virtuelle, pour comparer ; un nom
  // absent de la liste ne se devine pas (`null`).
  function reponsesEnCharges(e, reponses) {
    var out = null;
    Object.keys(reponses).forEach(function (slug) {
      var r = reponses[slug];
      if (!r || typeof r.aide !== 'string') return;
      var salleEl = salleElastiqueDuPlan(e, slug);
      var v = null;
      if (salleEl) {
        Object.keys(salleEl.noms).forEach(function (k) { if (salleEl.noms[k] === r.aide) v = Number(k); });
      }
      out = out || Object.assign({}, reponses);
      out[slug] = Object.assign({}, r, { aide: v });
    });
    return out || reponses;
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
    // 165 — ni « garde-en » ni « Il t'en restait combien ? » pendant une semaine allégée ou une décharge : la consigne
    // allégée est « loin de l'échec », une réserve notée là ne se compte pas (MOTEUR §9.26).
    return !!(x && x.consigne && x.consigne.etat !== 'silence' && !x.consigne.allegee &&
      (x.lignes || []).some(function (l) { return l && Object.prototype.hasOwnProperty.call(ROLE_DU_PARI, l.role); }));
  }

  // 169 — le rôle de la ligne qui porte la visée : la dernière ligne du coach. Sur une série de test (rôle `test`), la visée
  // affichée est V − 1 (la ligne de test de la table), pas V.
  function roleDeLaVisee(x) {
    var dernier = null;
    ((x && x.lignes) || []).forEach(function (l) {
      if (l && Object.prototype.hasOwnProperty.call(ROLE_DU_PARI, l.role)) dernier = l;
    });
    return dernier !== null && dernier.role === 'test' ? 'test' : 'ligne';
  }

  function derniereSerieDeTravail(exo) {
    var series = (exo && exo.series) || [];
    for (var j = series.length - 1; j >= 0; j--) {
      // 193-1 — la question d'effort se pose sur la grosse série, pas sur un recul.
      if (racine.THModele.estTravail(series[j]) && !racine.THModele.estRecul(series[j])) return j;
    }
    return null;
  }

  // 154 — ce que l'écran lit de l'effort visé, pour UN exercice : la réserve visée, la série qui porte la réponse, la
  // réponse (R, ou `null`), si les puces se posent (`demande` : exercice fini, aucune réponse), et la phrase d'après.
  // La règle n'est pas ici : la phrase se lit sur le fait que la CONSIGNE SUIVANTE a posé (`fondement.effortVise`).
  function effortViseDuPlan(exo, visee, suite, fini) {
    var j = derniereSerieDeTravail(exo);
    if (j === null) return null;
    var s = exo.series[j];
    var R = Palier().reserveDeSerie(s);
    var k = suite && suite.consigne ? suite.consigne : null;
    var ev = k && k.fondement && k.fondement.effortVise ? k.fondement.effortVise : null;
    var effet = null, phrase = null;
    if (R !== null && ev && ev.reserve === R && ev.visee === visee && memeChargeOuVides(ev.charge, s.charge_kg)) {
      effet = ev.effet;
      phrase = Moteur().annonceDe('effort', { ev: ev, consigne: k, haut: k.haut || null, moment: 'apres', regime: suite.regime || null });
    }
    // I254 (20/11/2026, MOTEUR §9.26 delta) — la capacité tenue sous la visée affichée : la ligne de fait, à la place de la garde qui n'a plus lieu (aucun `effet`).
    var cap = !ev && k && k.fondement && k.fondement.capacite ? k.fondement.capacite : null;
    if (R !== null && cap && cap.reserve === R && cap.visee === visee && memeChargeOuVides(cap.charge, s.charge_kg)) {
      phrase = Moteur().annonceDe('effort', { ev: null, capacite: cap, moment: 'apres', regime: suite.regime || null });
    }
    return { visee: visee, serie: j, reponse: R, demande: !!fini && R === null, effet: effet, phrase: phrase };
  }

  function questionsDuPlan(xs, reserve, seance, protegee) {
    var jour = reserve && !seance.edition ? Moteur().jourCivil(seance.debut) : null;
    var exos = seance.exercices || [];
    var questions = {};
    if (jour) {
      var passes = reserve.passes || {};
      var entree = { lancement: reserve.lancement, jour: jour, exercices: xs.map(function (x, i) {
        // PR 4a (§9.26 bis, C3) — LA QUESTION SUIT LA CIBLE AFFICHÉE : la ligne de test d'une population protégée n'affiche aucune réserve visée,
        // donc ne pose aucune question de réserve (la réserve notée sur une série de travail hors test alimente toujours la consigne).
        var sansCible = protegee === true && roleDeLaVisee(x) === 'test';
        var pari = aUnPari(x) && !sansCible && derniereSerieDeTravail(exos[i]) !== null;
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

  // ══ 236 (MOTEUR §9.39) — LE COACH EN TEMPS RÉEL APRÈS UN RATÉ ═══════════════════════════════════════════════════════
  //
  // `Moteur.reactionAuRate` décide (pure) ; le plan la LIT, pour chaque exercice (`x.rate` : la réaction sous la dernière série
  // validée, `x.carteParis` : « un cran dessous »), puis pour la séance (`plan.formeDuJour` et `x.carteForme`). Il rédige sous capture
  // (I26) et pose, sur les lignes qui restent, la fourchette (jamais la charge : la charge ne change que par « Prendre X kg »,
  // un geste de `sessions.gestes`). L'écran lit ; il ne calcule rien. Rien n'est écrit dans une série.
  var GESTES_DU_COACH = /^(rate_|forme_|paris_|cran_)/;
  function gestesDuCoach(seance) {
    return (Array.isArray(seance && seance.gestes) ? seance.gestes : []).filter(function (g) { return g && typeof g.geste === 'string' && GESTES_DU_COACH.test(g.geste); });
  }
  function laLigneAUnSens(l) { return (l.type === 'travail' || l.type === 'recul') && l.role !== 'hors'; }
  // Pose une visée et une fourchette sur une ligne non validée, ni figée : la ligne, son fantôme, son pré-remplissage et son pari.
  function poserSurLaLigne(x, t, o) {
    if (!t || (!o.retro && (t.validee || t.figee)) || (o.retro && !t.validee)) return;
    var pari = x.paris && x.paris[t.iSerie] ? x.paris[t.iSerie] : null;
    var marque = t.rate || {};
    var vise = nombre(t.vise);
    if (o.vise !== undefined && o.vise !== null && (vise === null || vise > o.vise)) {
      t.vise = o.vise;
      if (t.fantome && t.fantome.reps !== undefined && t.fantome.reps !== null) t.fantome.reps = o.vise;
      if (t.prerempli && t.prerempli.reps !== undefined && t.prerempli.reps !== null) t.prerempli.reps = o.vise;
      if (pari) pari.valeur_predite = o.vise;
      marque.vise = o.vise;
    }
    if (o.fourchette && pari && pari.valeur_predite !== null && pari.valeur_predite !== undefined) {
      pari.borne_basse = o.fourchette[0];
      pari.borne_haute = Math.max(o.fourchette[1], nombre(pari.valeur_predite));
      marque.fourchette = [pari.borne_basse, pari.borne_haute];
    }
    if (o.charge !== undefined && o.charge !== null && !memeChargeOuVides(t.charge, o.charge)) {
      t.charge = o.charge;
      if (t.fantome) t.fantome.charge = o.charge;
      if (t.prerempli) t.prerempli.charge_kg = o.charge;
      if (pari && pari.fondement) pari.fondement.charge = o.charge;
      marque.charge = o.charge;
    }
    if (Object.keys(marque).length) t.rate = marque;
  }

  // Ce que le plan sait d'un exercice pour la forme du jour : fini ? sous la cible ? charge baissée ?
  function resumeDeLExercice(x, series, travail, faites) {
    var nom = x.nom ? racine.THModele.nomParle(x.nom) : x.slug;     // 256 (D13) — le nom parlé : la carte de la forme du jour le dit dans une phrase
    var valid = faites.filter(function (l) { return l.type === 'travail'; });
    var sous = 0, baissee = false;
    // 251 (D1) — « tu as baissé la charge » : une série faite plus légère que ce que le plan proposait ET que la charge de travail. Un cran de
    // test, une ligne du coach ou d'élan non suivis (leur charge est AU-DESSUS du travail) ne sont pas une baisse. Une ligne posée plus bas par
    // « Prendre X kg » reste comparée à X (elle est sous le travail). Charge de travail inconnue : la charge de la ligne.
    var travailDuPlan = chargeDeTravail(x.consigne);
    valid.forEach(function (l) {
      var s = series[l.iSerie] || {};
      var reps = nombre(s.reps), vise = nombre(l.vise), ch = nombre(s.charge_kg), prevue = nombre(l.charge);
      if (prevue !== null && travailDuPlan !== null && travailDuPlan < prevue) prevue = travailDuPlan;
      if (reps !== null && vise !== null && reps < vise) sous++;
      if (ch !== null && prevue !== null && prevue > 0 && ch < prevue && !memeChargeOuVides(ch, prevue)) baissee = true;
    });
    return { slug: x.slug, nom: nom, fini: travail.length > 0 && travail.every(function (l) { return l.validee; }), demarre: faites.length > 0,
             sousCible: valid.length >= 2 && sous * 2 > valid.length, chargeBaissee: baissee };
  }

  // Les faits communs aux niveaux : ce qui fait taire le coach, et ce qui le fait parler autrement.
  function contexteDuRate(plan, x, exo, e, seance, gs) {
    var cat = e.catalogue && x.slug && Object.prototype.hasOwnProperty.call(e.catalogue, x.slug) ? e.catalogue[x.slug] : {};
    var cs = e.consignes && x.slug && Object.prototype.hasOwnProperty.call(e.consignes, x.slug) ? e.consignes[x.slug] : null;
    var equip = x.materiel || (cat && cat.equipement) || null;
    var muscles = { prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [], stab: cat.muscles_stabilisateurs || [],
                    equipement: equip, mesure: x.mesure, slug: x.slug };
    var isolation = x.polyarticulaire === false;
    return {
      reglage: plan.reglage, objectif: plan.objectif,
      // Lot E, A5 (20/11/2026, MOTEUR §9.39 et §14.8, I238) — le levier « Dégressive » d'une réaction n'existe que là où la dégressive est permise
      // par la même fonction que l'escalier (`Moteur.degressivePossible` : une isolation, ni Lourd ni Mix, ni sèche, ni décharge, ni Entretenir,
      // ni débutant). Seule la condition « la routine n'en a pas déjà une » est ignorée : la réaction propose UNE ligne, elle ne se cumule pas.
      // Le matériel et la mesure (pas de barre, pas de durée ni de distance) restent ceux d'avant.
      peutDegressive: equip !== 'barre' && x.mesure !== 'temps' && x.mesure !== 'charge_distance' && x.mesure !== 'charge_temps' &&
        Moteur().degressivePossible(conditionsDegressiveDuRate(plan, x, e, seance)),
      // I216 — le plancher de la réaction = la réserve AFFICHÉE de la ligne, déjà calculée (`Moteur.reserveAffichee`, plus haut) : jamais recalculée ni copiée.
      // Il ne vaut que là où la réserve affichée est un PLANCHER (population protégée I160, reprise longue I206) : ailleurs c'est la table (Lourd, Mix : 2) et la
      // réaction garde sa règle propre (« garde 1 » en Normal).
      // « Une seule garde » (19/11/2026) : lu sur la garde des LIGNES (`x.gardeDeLigne`, rôle `ligne`), jamais sur celle de la visée (`x.reserveAffichee`,
      // `null` pour une protégée dont la dernière ligne est un test : le trou de I216).
      // Lot F, A1 (I241) — et là où le plancher de la BARRE relève la table des lignes (`plancherDeBarreRelevant`).
      plancher: plan.protegee === true || Moteur().enRepriseLongue(x.consigne) || plancherDeBarreRelevant(x.consigne, plan.reglage, x.familleDeBarre) ? nombre(x.gardeDeLigne) : null,
      // I232 — à garde 0 de la ligne, une série à fond dans la zone est sur la cible (`Moteur.aFondSurLaCible`) ; la réaction ne dit pas « garde N ».
      gardeAffichee: x.gardeDeLigne === 0 ? 0 : null,
      entretien: plan.intention === 'entretien' || x.intention === 'entretien' || x.mode === 'entretien',
      decharge: !!plan.allegee || !!(x.consigne && x.consigne.allegee),
      semaineDeTest: !!plan.semaineDeTest || !!x.semaineDeTest, debutant: plan.debutant === true, calage: !!x.calage,
      douleur: !!x.douleur, figure: !!x.figure,
      lest: !!(cat && cat.charge === 'ajoutee'), aide: !!(cat && cat.charge === 'assistance'),
      zoneAMenager: !!x.menagee, douleurHier: !!x.carteReprise,
      peuDeTemps: gs.concat(Array.isArray(seance.gestes) ? seance.gestes : []).some(function (g) { return g && g.geste === 'raccourci'; }),
      seche: plan.phase === 'seche', autreSalle: e.autreSalle === true,
      barre: equip === 'barre', materiel: equip, isolation: isolation,
      pas: cs ? nombre(cs.pas) : null
    };
  }
  // Lot E, A5 — les conditions de la dégressive pour la réaction : celles de l'escalier (`conditionsDegressive`, une seule lecture), sans
  // « la routine en a déjà une ». Lue aussi par I238 (`verifierRate`).
  function conditionsDegressiveDuRate(plan, x, e, seance) {
    var allegee = !!(plan && plan.allegee) || !!(x && x.consigne && x.consigne.allegee);
    var cond = conditionsDegressive(e || {}, seance, x && x.slug, x && x.consigne ? x.consigne.zone : null, plan ? plan.phase : null,
      { allegee: allegee }, plan ? plan.intention : null);
    cond.aUneDegressive = false;
    return cond;
  }

  // « Une seule voix après un zéro » (19/11/2026, MOTEUR §9.39 et §9.42 bis, I158, I236, I237) — LA RÉACTION D'UNE SÉRIE À 0 REP, UNE FONCTION. Toute série validée
  // à 0 rep (charge > 0, de travail ou manquée : `Modele.estZeroDeTravail`) a SA réaction, Z1 ou Z2 (`Moteur.reactionAuZero`) : la même pour l'affichage (`x.rate`), pour
  // les étapes du niveau 2, pour le compte des propositions ignorées et pour le geste `rate_ignoree` ; jamais `reactionDeSerie`. En séance, la porte « plus lourd que
  // tout succès » ne joue plus (`zeroPartiel`, `porte: false`) : un 0 à ou sous une charge réussie est un incident (Z2). Le lest et l'aide passent par le cas E du
  // poids du corps (`null` ici). Rend `null` (pas un zéro de cette voix) ou `{ iSerie, Ch, d }` (`d.silence` : un contexte muet).
  //   `x.lignes` : les lignes restantes à la date de cette série = celles qui ne sont pas validées, ou qui viennent après elle.
  function zeroDeLaSerie(plan, x, exo, e, seance, gs, travail, i) {
    var M = Moteur(), V = Voix(), S = Seance(), T = racine.THModele;
    var k = x.consigne;
    if (!exo || !k) return null;
    var series = exo.series || [];
    var sr = series[i];
    if (!sr || !S.partEnBase(sr) || !T.estZeroDeTravail(sr)) return null;
    var cat = e.catalogue && x.slug && Object.prototype.hasOwnProperty.call(e.catalogue, x.slug) ? e.catalogue[x.slug] : {};
    if (cat && (cat.charge === 'ajoutee' || cat.charge === 'assistance')) return null;   // lest, aide : le cas E (poids du corps)
    var Ch = nombre(sr.charge_kg);
    var valides = [], reussies = [];
    series.forEach(function (q, j) {
      if (j > i || !S.partEnBase(q)) return;
      valides.push(q);
      var c = nombre(q.charge_kg), r = nombre(q.reps);
      if (T.typeDe(q) !== 'echauffement' && !T.estHorsCalcul(q) && r !== null && r >= 1 && c !== null && c > 0) reussies.push(c);
    });
    // C : la plus légère charge restée à 0 rep dans la séance (jamais au-dessus d'une charge déjà ratée).
    var z = T.zeroPartiel(valides, { porte: false });
    var C = z !== null && nombre(z.charge) !== null ? Math.min(Ch, nombre(z.charge)) : Ch;
    var mesureOk = x.mesure === null || x.mesure === undefined || x.mesure === 'charge_reps';
    var muet = plan.intention === 'entretien' || x.intention === 'entretien' || x.mode === 'entretien' || !!plan.allegee || !!k.allegee || !!seance.edition ||
      !!plan.semaineDeTest || !!x.semaineDeTest || !!x.calage || !!x.sansCoach || !!x.figure || !!x.veilleLegere || !!x.douleur || !mesureOk;
    var ligne = (x.lignes || []).filter(function (l) { return l.iSerie === i; })[0] || null;
    var role = T.estRecul(sr) ? 'recul'
      : ligne && ligne.role === 'test' ? 'test' : ligne && ligne.role === 'haut' ? 'haut'
      : (x.reculs && travail[0] && travail[0].iSerie === i) ? 'grosse' : 'travail';
    var restantes = (x.lignes || []).filter(function (l) { return laLigneAUnSens(l) && l.iSerie !== i && (!l.validee || l.iSerie > i); });
    // La visée de la ligne la plus lourde qui reste (une ligne sans chiffre compte la plus lourde, O20).
    var lourde = null;
    restantes.forEach(function (l) {
      var c = nombre(l.charge);
      if (lourde === null || (c === null && nombre(lourde.charge) !== null) || (c !== null && nombre(lourde.charge) !== null && c > nombre(lourde.charge))) lourde = l;
    });
    var D = x.contexte && typeof x.contexte.descenteDeLaSeance === 'function'
      ? x.contexte.descenteDeLaSeance({ charge: C, visee: lourde ? nombre(lourde.vise) : null, reussies: reussies }) : null;
    var d = M.reactionAuZero({ muet: muet, charge: Ch, descente: D, role: role,
      restantes: restantes.map(function (l) { return nombre(l.charge); }) });
    return { iSerie: i, Ch: Ch, C: C, D: D, role: role, restantes: restantes, d: d };
  }

  // La dernière série validée de l'exercice (hors chauffes, « Non, ne compte pas » et tests) : celle sous laquelle le coach parle.
  function derniereValideDeLExercice(exo) {
    var S = Seance(), T = racine.THModele, derniere = null;
    ((exo && exo.series) || []).forEach(function (sr, i) {
      if (S.partEnBase(sr) && T.typeDe(sr) !== 'echauffement' && !T.estHorsCalcul(sr) && !T.estTest(sr)) derniere = i;
    });
    return derniere;
  }

  // Rend vrai quand la réaction au zéro parle sous la dernière série (x.rate posé) ; faux : le reste du pipeline joue. `zr` : la réaction de CETTE série (`zeroDeLaSerie`),
  // calculée AVANT qu'un « Prendre » ne bouge les lignes (la proposition ne se déplace pas sous la main de la personne qui vient de la prendre).
  function reactionAuZeroDuPlan(x, gs, zr, derniere) {
    var M = Moteur(), V = Voix();
    if (zr === null || zr === undefined || zr.d.silence) return false;
    var d = zr.d, Ch = zr.Ch;
    var pris = gs.filter(function (g) { return g.geste === 'rate_prise' && g.slug === x.slug && g.rang === derniere; }).map(function (g) { return g.bouton; });
    var cap = V.capturer(function () { return M.phraseDeRate(d); });
    var chiffres = { reps: [], garde: [], charge: [Ch].concat(d.charge ? [d.charge.kg] : []) };
    x.rate = {
      iSerie: derniere, niveau: 'zero', cas: d.cas, base: null, phrase: cap.texte,
      boutons: (d.leviers || []).map(function (cle) { return { cle: cle, texte: M.boutonDeRate(cle, d), pris: pris.indexOf(cle) >= 0 }; }),
      charge: d.charge || null, garde: null, fourchette: null, recale: false, approche: false, recalculeReculs: false,
      faites: 0, visees: null, fait: false, pris: pris, chiffres: chiffres, role: d.role, zero: Ch
    };
    x.phrases.push({ ou: 'rate', texte: cap.texte, citations: cap.citations });
    return true;
  }

  // « Prendre X kg » après un zéro : les lignes non validées plus lourdes que X passent à X, les plus légères gardent la leur.
  function appliquerUnPrendre(x, kg) {
    (x.lignes || []).filter(function (l) { return laLigneAUnSens(l) && !l.validee; }).forEach(function (l) {
      poserSurLaLigne(x, l, { charge: nombre(l.charge) !== null && nombre(l.charge) <= kg + 1e-9 ? undefined : kg });
    });
  }

  // « Une seule voix après un zéro » (19/11/2026, règle 7) — UNE DÉCISION NE S'EFFACE JAMAIS EN SILENCE : un « Prendre » pris sous une réaction au zéro reste appliqué aux
  // lignes qui restent, même si le zéro est corrigé ensuite (la réaction a disparu, le geste reste : `rate_prise`, `cas: 'Z1'`, `kg`). Un vieux geste sans `cas` se reconnaît
  // à la série (`rang`) qui porte encore une réaction Z1. Chaque ligne non validée plus lourde que X passe à X ; une plus légère garde la sienne.
  function appliquerLesPrisesDuZero(x, gs, zrs) {
    gs.forEach(function (g) {
      if (!g || g.geste !== 'rate_prise' || g.slug !== x.slug || g.bouton !== 'prendre') return;
      var z = zrs.filter(function (q) { return q.iSerie === g.rang && !q.d.silence && q.d.cas === 'Z1'; })[0] || null;
      if (g.cas !== 'Z1' && z === null) return;
      var kg = typeof g.kg === 'number' ? g.kg : (z !== null ? z.d.charge.kg : null);
      if (kg !== null) appliquerUnPrendre(x, kg);
    });
  }

  // Les réactions au zéro de TOUTES les séries à 0 rep de l'exercice (`zeroDeLaSerie`), calculées une fois : l'affichage, les étapes, le compte des propositions
  // ignorées et `x.zeros` (ce que I237 relit) lisent la MÊME liste.
  function zerosDeLExercice(plan, x, exo, e, seance, gs, travail) {
    var liste = [];
    ((exo && exo.series) || []).forEach(function (sr, i) {
      var zr = zeroDeLaSerie(plan, x, exo, e, seance, gs, travail, i);
      if (zr !== null) liste.push(zr);
    });
    return liste;
  }
  function zerosPourLePlan(zrs, gs, x) {
    return zrs.map(function (zr) {
      var prise = gs.some(function (g) { return g.geste === 'rate_prise' && g.slug === x.slug && g.rang === zr.iSerie; });
      return { iSerie: zr.iSerie, charge: zr.Ch, zeroMin: zr.C, niveau: 'zero', cas: zr.d.silence ? null : zr.d.cas, silence: zr.d.silence === true,
        descente: zr.D, proposition: zr.d.silence !== true && Moteur().estUneProposition(zr.d), prise: prise };
    });
  }

  function reactionDExercice(plan, x, exo, e, seance, gs, resumes) {
    var M = Moteur(), V = Voix(), P = Palier();
    var k = x.consigne;
    var silence = plan.intention === 'entretien' || !!plan.allegee || !!seance.edition || plan.debutant === true;
    var mesureOk = x.mesure === null || x.mesure === undefined || x.mesure === 'charge_reps' || x.mesure === 'reps';
    if (!exo) return;
    var series = exo.series || [];
    var travail = (x.lignes || []).filter(laLigneAUnSens);
    var faites = travail.filter(function (l) { return l.validee; });
    var premiere = !k || k.etat === 'silence';
    var zone = k && !premiere ? M.zoneParCle(k.zone) : null;
    var resume = resumeDeLExercice(x, series, travail, faites);
    resume.nom = (e.catalogue && e.catalogue[x.slug] && e.catalogue[x.slug].nom) || x.slug;
    if (premiere || x.calage) resume.premiere = true;
    if (!mesureOk || x.sansCoach || x.figure || x.veilleLegere) resume = null;   // 253 (X2) — une séance volontairement plus légère ne compte pas pour la forme du jour
    resumes.push(resume ? Object.assign(resume, { iExo: x.iExo }) : null);
    // PR 4b (R-A, O7, MOTEUR §9.42 bis) — APRÈS UN 0 REP, UNE BRANCHE DÉDIÉE, AVANT les sorties anticipées ci-dessous (elles contiennent le débutant, la première fois, la
    // zone et le pari : le zéro les traverse toutes). Elle lit les séries VALIDÉES de l'exercice (`Modele.zeroDeSeance`, O8) : une série manquée (`echec` à 0 rep,
    // « Oui, manquée ») n'est pas une ligne de travail pour le plan.
    // « Une seule voix après un zéro » (19/11/2026) : les réactions de toutes les séries à 0 rep (`x.zeros`, relues par I237) et les « Prendre » déjà pris (règle 7).
    var zrs = zerosDeLExercice(plan, x, exo, e, seance, gs, travail);
    if (zrs.length) x.zeros = zerosPourLePlan(zrs, gs, x);
    var iDerniere = derniereValideDeLExercice(exo);
    var zrDerniere = zrs.filter(function (q) { return q.iSerie === iDerniere; })[0] || null;
    var parle = reactionAuZeroDuPlan(x, gs, zrDerniere, iDerniere);
    appliquerLesPrisesDuZero(x, gs, zrs);
    if (parle) return;
    if (silence || premiere || !zone || !mesureOk || !faites.length || !aUnPari(x) || x.veilleLegere) return;
    var cx = contexteDuRate(plan, x, exo, e, seance, gs);
    var chauffeValidee = (x.lignes || []).some(function (l) { return l.type === 'echauffement' && l.validee; });
    var superset = exo.groupe_superset !== null && exo.groupe_superset !== undefined;
    var reposCible = exo.repos_cible_s !== null && exo.repos_cible_s !== undefined ? nombre(exo.repos_cible_s) : null;
    var prises = function (iSerie) {
      return gs.filter(function (g) { return g.geste === 'rate_prise' && g.slug === x.slug && g.rang === iSerie; });
    };
    // 251 (D2) — « sous la zone » pour le niveau 2 : la série est classée D ou L par le niveau 1 (`Moteur.rateSousLaZone`, la même notion que la porte du
    // cran et que `reactionDeSerie`) ; sous la zone, le niveau 1 garde la parole et ses leviers, le niveau 2 reste pour « sous la cible, DANS la zone ».
    var classeDOuL = function (l) {
      var s = series[l.iSerie] || {}, reps = nombre(s.reps), vise = nombre(l.vise);
      var lu = M.rateSousLaZone({ reps: reps, bas: zone.bas, objectif: cx.objectif, barre: cx.barre, reserve: P.reserveDeSerie(s), charge: nombre(s.charge_kg), gardeAffichee: cx.gardeAffichee });
      // Au poids du corps, le niveau 1 classe E (jamais D ni L, `reactionDeSerie`) : le niveau 2 y garde la parole (les tractions 7, 7 de 236).
      return reps !== null && vise !== null && reps < vise && !lu.corps && (lu.sous || lu.echec);
    };
    var ignorees = 0, sousAvant = 0, apres = false, dernier = null, etapes = [];
    faites.forEach(function (l, n) {
      // Les zéros « manquée » ne sont pas des lignes de travail : leur proposition passée sans réponse compte aussi, dans l'ordre des séries.
      zrs.forEach(function (q) {
        if (!q.compte && q.iSerie < l.iSerie && !travail.some(function (t) { return t.iSerie === q.iSerie && t.validee; }) && !q.d.silence && Moteur().estUneProposition(q.d) &&
            !prises(q.iSerie).length) { q.compte = true; ignorees++;  }
      });
      var ignoreesAvant = ignorees;
      var s = series[l.iSerie] || {};
      var reps = nombre(s.reps), ch = nombre(s.charge_kg);
      var rang = travail.indexOf(l);
      var role = (ch !== null && nombre(l.charge) !== null && Math.abs(ch - nombre(l.charge)) > 1e-9) ? 'autre_charge'
        : l.type === 'recul' ? 'recul'
        // 251 (D2 bis) — la grosse série d'un bloc se teste AVANT le test : portée en ligne de test (155 × 3 après 152,5 × 5) et ratée, elle recale les
        // reculs (cas G, « Ta grosse série dit ≈ X kg »), elle ne se tait plus (cas I, « pas encore »).
        : (x.reculs && travail[0] && l.iSerie === travail[0].iSerie) ? 'grosse' : l.role === 'test' ? 'test' : 'travail';
      // Le repos réel : LA fonction de 233 (`Moteur.reposReel`, l'écart entre deux séries validées du même exercice), lue sur cette série et
      // la précédente validée de l'exercice — au superset, c'est le tour. Pas de calcul local, pas de `repos_s` : une notion, une fonction.
      var precedente = n > 0 && faites[n - 1] ? series[faites[n - 1].iSerie] : null;
      var reposReel = precedente ? M.reposReel([precedente, s]) : null;
      var ctx = Object.assign({}, cx, { niveau: 'serie', role: role, charge: ch, reps: reps, vise: nombre(l.vise), bas: zone.bas, haut: zone.haut,
        // 251 (D2 bis) : la grosse série n'est jamais la dernière — ses reculs (hors couverture) suivent ; sans cela le cas J la taisait avant le G.
        rang: rang, derniere: rang === travail.length - 1 && role !== 'grosse', reserve: P.reserveDeSerie(s), reposReel: reposReel, reposCible: reposCible,
        sousZoneAvant: sousAvant, ignorees: ignorees, apres: apres, chauffeValidee: chauffeValidee,
        // 19/11/2026 — un 0 rep au lest ou à l'aide passe par le cas E du poids du corps ; `aide` : « Plus d'aide » à la place de l'élastique.
        corps: ch === null || ch <= 0 || (reps === 0 && cx.lest === true), aide: cx.aide === true || (ch !== null && ch < 0) });
      // Une série à 0 rep (charge > 0) : SA réaction, la même que sous la dernière série (`zeroDeLaSerie`), jamais `reactionDeSerie` ; muette, elle reste muette.
      var zrn = zrs.filter(function (q) { return q.iSerie === l.iSerie; })[0] || null;
      var d = zrn !== null ? zrn.d : M.reactionAuRate(ctx);
      var estLaDerniere = n === faites.length - 1;
      apres = !d.silence && d.cas !== 'R';
      if (reps !== null && reps < zone.bas && l.type === 'travail') sousAvant++;
      dernier = { l: l, d: d, ctx: ctx };
      // La décision d'APRÈS cette série (niveau 2 s'il parle, sinon niveau 1) : une ligne déjà validée garde la visée et le pari qu'elle
      // affichait avant sa validation (un pari est toujours la ligne affichée), même quand la décision suivante ne la porte plus.
      var prefixe = faites.slice(0, n + 1);
      var autreAvant = prefixe.some(function (q) { var c1 = nombre((series[q.iSerie] || {}).charge_kg), c2 = nombre(q.charge); return c1 !== null && c2 !== null && Math.abs(c1 - c2) > 1e-9; });
      var dn = d;
      if (l.type === 'travail' && !autreAvant && zrn === null) {
        var d2n = M.reactionAuRate(Object.assign({}, cx, { niveau: 'exercice', charge: ch, ignorees: ignoreesAvant,
          faites: prefixe.filter(function (q) { return q.type === 'travail'; }).map(function (q) { return { reps: nombre((series[q.iSerie] || {}).reps), vise: nombre(q.vise) }; }),
          restantes: travail.length - 1 - rang }));
        if (!d2n.silence && !classeDOuL(l)) dn = d2n;
      }
      // 16/11/2026 — une proposition ignorée = la réaction AFFICHÉE (`dn`, niveau 1 ou 2) qui porte un bouton, sans bouton pris ; une phrase seule ne compte pas.
      if (!estLaDerniere && M.estUneProposition(dn) && !prises(l.iSerie).length) ignorees++;
      etapes.push({ l: l, d: dn, rang: rang });
    });
    if (!dernier) return;
    var d = dernier.d, iSerie = dernier.l.iSerie;
    // Une série faite à une autre charge que sa ligne : l'élan, « pas encore » et « plus léger » (§9.14) parlent, pas cette règle.
    var autreCharge = faites.some(function (l) { var c1 = nombre((series[l.iSerie] || {}).charge_kg), c2 = nombre(l.charge); return c1 !== null && c2 !== null && Math.abs(c1 - c2) > 1e-9; });
    // Niveau 2 : après 2 séries sous la cible, la suite vise ce qui vient d'être fait ; il remplace la phrase de la série (une seule).
    var d2 = M.reactionAuRate(Object.assign({}, cx, { niveau: 'exercice', charge: dernier.ctx.charge, ignorees: ignorees,
      faites: faites.filter(function (l) { return l.type === 'travail'; }).map(function (l) {
        return { reps: nombre((series[l.iSerie] || {}).reps), vise: nombre(l.vise) };
      }), restantes: travail.filter(function (l) { return !l.validee; }).length }));
    // I236 : sous une série à 0 rep (poids du corps, lest, aide), le niveau 2 ne parle pas (aucune fourchette ni « garde » sous un 0).
    var dernierAZero = nombre((series[dernier.l.iSerie] || {}).reps) === 0;
    if (!d2.silence && dernier.l.type === 'travail' && !autreCharge && !classeDOuL(dernier.l) && !dernierAZero) d = d2;
    if (!x.message) {
      etapes.slice(0, -1).forEach(function (st) {
        var dd = st.d;
        if (dd.silence || !dd.fourchette || dd.fait) return;
        var apresLui = travail.filter(function (q, i) { return i > st.rang && q.type === (st.l.type === 'recul' ? 'recul' : 'travail'); });
        var prend = prises(st.l.iSerie).some(function (g) { return g.bouton === 'prendre'; }) && dd.charge && dd.charge.action === 'baisse';
        var cib = dd.recale === true || prend ? apresLui : apresLui.slice(0, 1);
        cib.forEach(function (t) {
          if (!t.validee) return;
          // 251 (D2, 3h) — jamais la visée ni la fourchette d'un raté sur une ligne de TEST (§9.13 bis : « ne jamais poser une proposition sur un test »).
          if (t.role === 'test') return;
          // La réaction de l'écran (§9.14) garde la ligne qu'elle a posée : elle parlait déjà, cette règle se taisait.
          var idx = Array.isArray(x.indices) ? x.indices : (x.reaction && x.reaction.indices) || null;
          var jr = idx ? idx.indexOf(t.iSerie) : t.iSerie;
          var pl = x.reaction && x.reaction.plan && jr >= 0 ? x.reaction.plan[jr] : null;
          if (pl && pl.source && pl.source !== 'consigne') return;
          var viseRetro = dd.niveau === 'exercice' ? dd.vise : dd.fourchette[1];
          // Une ligne validée est figée (I4) : son pari posé dit ce qu'elle affichait. Le rejeu ne la recale que s'il retrouve
          // ce pari ; sinon il se tait (ex. une réaction d'écran, non gardée, l'avait tenue à sa visée avant la réouverture).
          var poses = (e && Array.isArray(e.paris) ? e.paris : []).filter(function (q) {
            return q && q.fondement && q.exercise_slug === x.slug && String(q.fondement.rang) === String(t.rang) &&
              (q.fondement.role === 'recul') === (t.type === 'recul') && (plan.seance == null || q.fondement.seance === plan.seance);
          });
          if (poses.length && !poses.some(function (q) { return nombre(q.valeur_predite) === nombre(viseRetro); })) return;
          poserSurLaLigne(x, t, { retro: true, vise: viseRetro, fourchette: dd.fourchette,
            charge: prend ? dd.charge.kg : undefined });
        });
      });
    }
    if (d.silence) return;
    // La réaction existante (§9.14, y compris « à fond, la suite vise une rep de moins », §9.14 ter) parle déjà sous cette série : elle garde la parole.
    // Lot F, étape 1 (I243) — sauf un message « à fond » à garde 0 qui CÈDE (au bas de la zone ou dessous) : la réaction au raté parle seule, le message
    // s'efface (une voix). Muette (débutant, entretien, décharge, test, première fois, douleur : `d.silence`, plus haut), le message cédé garde la parole.
    if (x.message && x.message.cede === true) {
      x.message = null;
      x.phrases = (x.phrases || []).filter(function (ph) { return ph.ou !== 'message'; });
    }
    if (x.message) return;
    var pris = prises(iSerie).map(function (g) { return g.bouton; });
    var cap = V.capturer(function () { return M.phraseDeRate(d); });
    var cap2 = V.capturer(function () { return (d.leviers || []).map(function (cle) { return M.boutonDeRate(cle, d); }); });
    var chiffres = { reps: [], garde: [], charge: [] };
    [d.faites, d.visees, d.avant, d.vise, d.n, d.sur].concat(d.fourchette || []).forEach(function (v) { if (nombre(v) !== null) chiffres.reps.push(v); });
    if (d.garde !== undefined) chiffres.garde.push(d.garde);
    if (d.charge && d.charge.kg !== null && d.charge.kg !== undefined) chiffres.charge.push(d.charge.kg);
    if (nombre(d.maxDuJour) !== null) chiffres.charge.push(d.maxDuJour);
    x.rate = {
      iSerie: iSerie, niveau: d.niveau, cas: d.cas, base: d.base || null, phrase: cap.texte,
      boutons: (d.leviers || []).map(function (cle) { return { cle: cle, texte: M.boutonDeRate(cle, d), pris: pris.indexOf(cle) >= 0 }; }),
      charge: d.charge || null, garde: d.garde === undefined ? null : d.garde, fourchette: d.fourchette || null, recale: d.recale === true,
      approche: d.approche === true, recalculeReculs: d.recalculeReculs === true,
      faites: d.faites === undefined ? null : d.faites, visees: d.visees === undefined ? null : d.visees,
      fait: d.fait === true, pris: pris, chiffres: chiffres, role: d.role || null
    };
    x.phrases.push({ ou: 'rate', texte: cap.texte, citations: cap.citations });
    // Les lignes qui restent : la fourchette et la visée, jamais la charge — sauf « Prendre X kg », un geste.
    if (d.fourchette && !d.fait) {
      var restantes = travail.filter(function (l) { return !l.validee && l.iSerie > iSerie; });
      var prend = pris.indexOf('prendre') >= 0 && d.charge && d.charge.action === 'baisse';
      var cibles = d.recale === true || prend ? restantes.filter(function (l) { return l.type === (dernier.l.type === 'recul' ? 'recul' : 'travail'); })
        : restantes.slice(0, 1);
      var vise = d.niveau === 'exercice' ? d.vise : d.fourchette[1];
      cibles.forEach(function (t) {
        if (t.role === 'test') return;                    // 251 (D2, 3h) : la ligne de test garde sa charge, sa visée et son pari de test
        poserSurLaLigne(x, t, { vise: vise, fourchette: d.fourchette, charge: prend ? d.charge.kg : undefined });
      });
    }
  }

  // La carte « un cran dessous » : deux séances de suite où le pari n'a pas tenu (`entrees.parisRates[slug]` = `{ n, charge, reps }`, un
  // fait de `faits.js`). En tête de l'exercice, tant qu'aucune série n'est validée et qu'aucun choix n'est fait.
  function parisRatesDeLExercice(plan, x, exo, e, seance, gs) {
    var M = Moteur(), V = Voix();
    // PR 4b (R-A) — muette pendant la tenue après un zéro : le « retente » est le geste « Tenter ».
    if (x.consigne && x.consigne.fondement && x.consigne.fondement.plafondZero && x.consigne.fondement.plafondZero.mord === true) return;
    if (!exo || !x.consigne || x.consigne.etat === 'silence' || !e.parisRates || !Object.prototype.hasOwnProperty.call(e.parisRates, x.slug)) return;
    if (plan.intention === 'entretien' || !!plan.allegee || !!seance.edition || plan.debutant === true || x.veilleLegere) return;
    var fait = e.parisRates[x.slug] || {};
    var cx = contexteDuRate(plan, x, exo, e, seance, gs);
    var reponse = null;
    gs.forEach(function (g) {
      if (g.slug !== x.slug) return;
      if (g.geste === 'paris_cran') reponse = 'cran';
      else if (g.geste === 'paris_retente') reponse = 'retente';
    });
    var d = M.reactionAuRate(Object.assign({}, cx, { niveau: 'paris', n: fait.n, charge: fait.charge, reps: fait.reps, reponse: reponse }));
    var travail = (x.lignes || []).filter(laLigneAUnSens);
    if (reponse === 'cran' || (reponse === null && !d.silence)) {
      var dec = reponse === 'cran' ? M.reactionAuRate(Object.assign({}, cx, { niveau: 'paris', n: fait.n, charge: fait.charge, reps: fait.reps, reponse: null })) : d;
      if (dec.silence) return;
      if (reponse === 'cran') {
        travail.forEach(function (t) { if (!t.validee) poserSurLaLigne(x, t, { charge: dec.cran.charge }); });
        x.parisRates = { reponse: 'cran', cran: dec.cran, palier: dec.palier, carte: null };
        return;
      }
      if (travail.some(function (l) { return l.validee; })) { x.parisRates = { reponse: null, carte: null, passee: true }; return; }
      var cap = V.capturer(function () { return M.phraseDeRate(dec); });
      x.parisRates = {
        reponse: null, cran: dec.cran, palier: dec.palier, n: dec.n,
        carte: { phrase: cap.texte, boutons: [{ cle: 'cran', texte: M.RATE_BOUTONS_PARIS.cran }, { cle: 'retente', texte: M.RATE_BOUTONS_PARIS.retente }] },
        chiffres: { reps: [dec.n, dec.palier.reps], garde: [], charge: [dec.cran.charge] }
      };
      x.phrases.push({ ou: 'rate.paris', texte: cap.texte, citations: cap.citations });
    } else if (reponse === 'retente') {
      x.parisRates = { reponse: 'retente', carte: null };
    }
  }

  // La forme du jour : UNE carte par séance, en tête du premier exercice pas commencé qui suit les exercices terminés qui flanchent.
  function formeDuJourDuPlan(plan, e, seance, gs, resumes) {
    var M = Moteur(), V = Voix();
    var xs = plan.exercices, exos = seance.exercices || [];
    var rep = null;
    gs.forEach(function (g) { if (g.geste === 'forme_ajustee') rep = 'ajuste'; else if (g.geste === 'forme_gardee' && rep === null) rep = 'garde'; });
    var silence = plan.intention === 'entretien' || !!plan.allegee || !!seance.edition || plan.debutant === true || !!plan.semaineDeTest;
    plan.formeDuJour = { reponse: rep, iExo: null, carte: null };
    if (silence) return;
    var parIExo = {};
    resumes.forEach(function (r) { if (r) parIExo[r.iExo] = r; });
    var ordre = xs.map(function (x) { return parIExo[x.iExo] || null; });
    var carteSur = null, decision = null;
    for (var j = 0; j < xs.length && carteSur === null; j++) {
      var rj = ordre[j];
      if (!rj || rj.demarre || !xs[j].consigne) continue;
      var avant = ordre.slice(0, j).filter(function (r) { return r && r.fini; });
      var restants = ordre.slice(j).filter(function (r) { return r && !r.demarre; }).length;
      var dj = M.reactionAuRate({ niveau: 'seance', exercices: avant, restants: restants, reponse: rep,
        veille: e.veilleChoix && e.activiteVeille ? { choix: e.veilleChoix, nom: e.activiteVeille.nom || null } : null });
      if (!dj.silence) { carteSur = j; decision = dj; }
    }
    if (rep !== null) {
      // Répondue : « Ajuster » tient la fin de séance (cibles au bas de la zone, une série de moins), « Garder » ne revient jamais.
      var depuis = null;
      gs.forEach(function (g) { if (g.geste === 'forme_ajustee' && depuis === null) depuis = g.slug; });
      if (rep === 'ajuste') appliquerLaForme(plan, seance, depuis);
      plan.formeDuJour.depuis = depuis;
      return;
    }
    if (carteSur === null) return;
    var cap = V.capturer(function () { return M.phraseDeRate(decision); });
    var chiffres = { reps: [decision.n, decision.sur, decision.nSous].filter(function (v) { return nombre(v) !== null && v > 0; }), garde: [], charge: [] };
    xs[carteSur].carteForme = {
      phrase: cap.texte, n: decision.n, sur: decision.sur, baisses: decision.baisses.slice(), effet: decision.effet,
      boutons: [{ cle: 'ajuste', texte: M.RATE_BOUTONS_FORME.ajuste }, { cle: 'garde', texte: M.RATE_BOUTONS_FORME.garde }], chiffres: chiffres,
      veille: decision.veille || null
    };
    xs[carteSur].phrases.push({ ou: 'rate.forme', texte: cap.texte, citations: cap.citations });
    plan.formeDuJour.iExo = xs[carteSur].iExo;
    plan.formeDuJour.carte = true;
  }

  // « Ajuster la fin à ma forme du jour » : à partir de l'exercice qui portait la carte, les cibles au bas de la zone, une série de moins
  // (jamais sous 2 séries de travail). Le plan décide ; l'app retire la ligne (`lignesAAjuster`).
  function appliquerLaForme(plan, seance, depuisSlug) {
    var M = Moteur();
    var debut = null;
    plan.exercices.forEach(function (x, i) {
      var demarre = (x.lignes || []).some(function (l) { return laLigneAUnSens(l) && l.validee; });
      if (debut === null && !demarre && (depuisSlug === null || x.slug === depuisSlug)) debut = i;
    });
    if (debut === null) return;
    plan.exercices.forEach(function (x, i) {
      x.forme = null;
      if (i < debut) return;
      var travail = (x.lignes || []).filter(laLigneAUnSens);
      if ((x.lignes || []).some(function (l) { return laLigneAUnSens(l) && l.validee; })) return;
      var zone = x.consigne && x.consigne.etat !== 'silence' ? M.zoneParCle(x.consigne.zone) : null;
      var retirer = null;
      var pend = travail.filter(function (l) { return !l.validee && l.type === 'travail'; });
      if (pend.length >= 1 && travail.filter(function (l) { return l.type === 'travail'; }).length >= 3) retirer = pend[pend.length - 1].iSerie;
      x.forme = { ajuste: true, retirer: retirer };
      if (zone) {
        travail.forEach(function (t) {
          if (t.iSerie === retirer) return;
          poserSurLaLigne(x, t, { vise: zone.bas, fourchette: [Math.max(1, zone.bas - 1), zone.bas + 1] });
        });
      }
    });
  }

  // Les lignes que « Ajuster la fin » retire : `[{ iExo, iSerie }]`, la dernière série de travail non faite de chaque exercice restant.
  function lignesAAjuster(plan) {
    var sortie = [];
    ((plan && plan.exercices) || []).forEach(function (x) {
      if (x && x.forme && x.forme.ajuste && x.forme.retirer !== null && x.forme.retirer !== undefined) sortie.push({ iExo: x.iExo, iSerie: x.forme.retirer });
    });
    return sortie;
  }

  // Les lignes ont bougé (visée, fourchette, charge prise) : la feuille « Pourquoi » les décrit de nouveau, aux chiffres des lignes (I6, I26).
  function recomposerLaFeuille(x) {
    if (!x || !x.pourquoi || !x.consigne || x.consigne.etat === 'silence') return;
    if (!(x.lignes || []).some(function (l) { return l.rate; })) return;
    var cap = Voix().capturer(function () { return lignesDeLaFeuille(x.lignes, x.consigne); });
    x.pourquoi.lignes = cap.texte;
    var texte = cap.texte.map(function (l) { return [l.texte, l.raison, l.faite].filter(Boolean).join(' · '); }).join(' | ');
    (x.phrases || []).forEach(function (p) {
      if (p.ou === 'pourquoi') { p.texte = texte; p.citations = cap.citations; }
    });
  }

  function reactionsDuPlan(plan, e, seance) {
    // Un décor de test qui rejoue l'état d'avant la règle (`entrees.sansReactionAuRate`) ; l'app ne le pose jamais.
    if (e && e.sansReactionAuRate === true) return plan;
    var gs = gestesDuCoach(seance);
    var resumes = [];
    plan.formeDuJour = null;
    (plan.exercices || []).forEach(function (x, i) {
      x.rate = null; x.parisRates = null; x.carteForme = null; x.forme = null;
    });
    (plan.exercices || []).forEach(function (x) {
      reactionDExercice(plan, x, (seance.exercices || [])[x.iExo], e, seance, gs, resumes);
      parisRatesDeLExercice(plan, x, (seance.exercices || [])[x.iExo], e, seance, gs);
    });
    formeDuJourDuPlan(plan, e, seance, gs, resumes);
    (plan.exercices || []).forEach(recomposerLaFeuille);
    return plan;
  }

  // ══ 21/11/2026 — « SIMPLIFIER », PILOTE 3+1 : LA TÊTE D'UN EXERCICE EN SÉANCE (ECRAN-SAISIE, delta du 21/11/2026) ══════════════════════════════════════
  //
  // La règle, par exercice : TROIS éléments au plus, plus UNE carte de décision.
  //   · la consigne (le chiffre, et la puce « Si ça passe » d'un test, qui en fait partie) ;
  //   · UNE ligne grise (le verbe avec son chiffre — sa forme courte, écrite par le moteur —, ou la clause de la Décharge, ou le titre du calage) ; « Pourquoi ? » est
  //     au bout de cette ligne ;
  //   · UN troisième élément, jamais plus : le compteur de stagnation ; le « Pendant ce temps, … » qui le suit ne vit plus qu'au « Pourquoi » (où il est déjà) ;
  //   · +1 CARTE de décision, une seule à la fois, dans l'ordre : reprise après douleur, réaction au raté (la forme du jour, puis « un cran dessous »), question du calage, les autres
  //     questions du coach sur l'exercice (le lest, la marche, le schéma), la veille d'une activité dure, les chauffes proposées.
  // HORS COMPTE, toujours visible : ce qui annonce une décision DÉJÀ PRISE (chauffes posées et leur « Annuler », silence des chauffes, plafond après un zéro, « Cible faite » / « Pas encore »,
  // « La prochaine fois », le bandeau de la Décharge, la série de plus ou de moins acceptée, le nom et la puce de zone). Une décision appliquée n'est JAMAIS une carte en attente.
  // Le plan décide ; l'écran obéit (`x.file`, `x.tete`) et ne calcule rien. I269 à I271 le relisent.
  // 25/11/2026 (« La semaine de test entre dans la file », ECRAN-SAISIE §7 quinvicies quater, delta) : la famille `test` (la carte de la semaine de mesure, quand elle porte des GESTES)
  // prend sa place APRÈS la reprise et la veille : une barre qui revient d'une douleur ne se teste pas ; la personne qui allège aujourd'hui (veille d'une activité dure) répond à cela d'abord, la
  // question du test vient après. `veille` quitte donc sa place d'avant (entre `autre` et `chauffes`) pour passer devant `test`, `forme`, `paris`, `calage` et `autre`.
  var ORDRE_DE_LA_FILE = ['reprise', 'veille', 'test', 'forme', 'paris', 'calage', 'autre', 'chauffes'];
  // La carte de la semaine de test porte-t-elle un GESTE (« Ajouter l'essai suivant », « Plutôt viser mon max », « Arrêter le test », « Pas aujourd'hui », « Annuler les lignes ») ? Les variantes
  // `pasDEssai`, `pasDeTest`, `accessoire` et une barre finie ou arrêtée sont du texte ou un constat : jamais une décision en attente, jamais dans la file. Même lecture que `carteDeTest` (rendu.js).
  function carteDeTestAGestes(t) {
    if (!t || t.testee !== true || t.pasDEssai || t.pasDeTest || t.accessoire) return false;
    var enCours = t.etat === 'a_faire' || t.etat === 'en_cours';
    var essais = !!(t.essais && t.essais.length);
    return !!(t.ajout || t.videsPosees || (enCours && (!essais || t.mode === 'max')));
  }
  // Les cartes EN ATTENTE d'une réponse sur un exercice, par famille : la lecture unique (le plan la pose, I271 la recalcule à part).
  function cartesPresentesDe(plan, x) {
    return {
      reprise: !!x.carteReprise,
      test: carteDeTestAGestes(x.semaineDeTest),
      forme: !!x.carteForme,
      paris: !!(x.parisRates && x.parisRates.carte),
      calage: !!(x.calage && x.calage.demandeHabituelle),
      autre: !!(x.carteLest || x.carteMarche || (x.escalier && x.escalier.carte)),
      // La veille est la carte d'UNE barre (`veilleActivite.slug`) : elle ne compte que pour cet exercice, jamais pour les autres (les chauffes du couché ne l'attendent pas).
      veille: !!(plan.veilleActivite && plan.veilleActivite.slug === x.slug),
      chauffes: !!x.proposition
    };
  }
  // La phrase du « ≈ » ne va à la feuille que si la puce « Si ça passe » la porte (un test proposé, sa ligne de jaune) : sinon elle reste en tête, là où elle est dite.
  function approcheeParLaPuce(x) {
    var c = x && x.consigne, en = (x && x.entete) || {};
    return !!(c && c.etat === 'test_propose' && (en.jaune || []).some(function (l) { return /^Si ça passe/.test(String(l)); }));
  }
  function tetesDuPlan(plan, e) {
    if (!plan || !Array.isArray(plan.exercices)) return plan;
    plan.exercices.forEach(function (x) {
      var presentes = cartesPresentesDe(plan, x);
      var retenue = null, attente = [];
      ORDRE_DE_LA_FILE.forEach(function (nom) {
        if (!presentes[nom]) return;
        if (retenue === null) retenue = nom; else attente.push(nom);
      });
      x.file = { ordre: ORDRE_DE_LA_FILE.slice(), carte: retenue, enAttente: attente };
      var en = x.entete || {};
      // Le troisième élément : le compteur d'abord ; « Pendant ce temps » ne s'ajoute pas au compteur (il reste dans la feuille, `pourquoi.frere`).
      // 25/11/2026 — la ligne de puissance des 65 ans et plus (`plan.puissance`, MOTEUR §9.36) est la consigne d'exécution de la personne : quand elle est sur cet exercice elle PREND la place du
      // troisième élément ; le compteur (ou le « Pendant ce temps ») n'est pas caché, il est dit au « Pourquoi ? » avec ses mots (`pourquoi.compteur`, `pourquoi.frere`). I270 la compte.
      var puiss = !!(plan.puissance && plan.puissance.slug === x.slug);
      var tiers = puiss ? null : (en.compteur ? 'compteur' : (en.frere ? 'frere' : null));
      var peutLaFeuille = !!x.pourquoi;
      x.tete = {
        puissance: puiss,
        ligne: en.court ? 'court' : (en.gris ? 'gris' : null),
        tiers: tiers,
        // Les deux phrases qui quittent la tête pour la feuille, quand une feuille existe (sinon elles restent là où elles étaient : rien d'annoncé n'est caché).
        approchee: x.approchee && x.approchee.phrase ? (peutLaFeuille && approcheeParLaPuce(x) ? 'feuille' : 'tete') : null,
        chauffe: x.proposition && x.proposition.pourquoi ? (peutLaFeuille ? 'feuille' : 'carte') : null
      };
      if (x.pourquoi) {
        if (x.tete.approchee === 'feuille') x.pourquoi.approchee = x.approchee.phrase;
        if (x.tete.chauffe === 'feuille') x.pourquoi.chauffe = x.proposition.pourquoi;
      }
    });
    return plan;
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
    if (!plan) return sortie;
    (plan.exercices || []).forEach(function (x) {
      if (!x || !x.consigne) return;
      // 174 — la 4e marche (« alléger ») retire aussi, sur son exercice : les séries au-delà de celles qu'elle couvre et la
      // ligne dégressive. Jamais une série validée.
      var semaine = !!plan.allegee && !!x.consigne.allegee;
      var alleger = !!x.consigne.alleger;
      if (!semaine && !alleger) return;
      if (typeof iExo === 'number' && x.iExo !== iExo) return;
      (x.lignes || []).filter(function (l) {
        if (l.validee) return false;
        if (l.role === 'hors' && l.type === 'travail') return true;
        // 193-1 — la semaine allégée retire aussi les reculs non validés : sans grosse série pleine, pas de séries de recul.
        if (semaine && l.type === 'recul') return true;
        return alleger && l.type === 'degressive';
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
  // 179 (C-F8) — les séries de travail de la routine pour cet exercice (figées avec la consigne) : la part d'une série de plus.
  function seriesDeLaRoutine(e, slug) {
    var r = e && e.escalier && e.escalier.seriesRoutine;
    return r && Object.prototype.hasOwnProperty.call(r, slug) && Number(r[slug]) >= 1 ? Number(r[slug]) : null;
  }
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
      // 174 (3/3) — SOUS 3 REPS, SIX SÉANCES SANS MONTER : la zone 3-5 est proposée, par la carte du schéma. L'exercice n'a
      // pas de zone, donc ni compteur d'escalier ni repli : cette marche est la seule qu'il entende.
      if (c.bord) {
        var mBord = marcheDuBord(seance, slug, c, jour, marches, enBloc);
        if (mBord) sortie[slug] = mBord;
        return;
      }
      // 180 (A-F-02, D4, 28/10/2026) — AU POIDS DU CORPS, LA MARCHE D'EN DESSOUS : quatre séances sans progrès en reps, la carte de la
      // marche du rang juste en dessous de l'échelle de l'exercice. Là où l'escalier de la charge n'a rien à proposer (ni cran, ni repli).
      var mDessous = marcheDuDessous(e, seance, slug, c, jour, marches, compteurs);
      if (mDessous) { sortie[slug] = mDessous; return; }
      // §10 bis (113, 16/10/2026) — AU PLAFOND DE SA SALLE : l'escalier du plafond (la série de plus, la dégressive,
      // un frère plus chargeable, puis le maintien) ; jamais le schéma ni le repli — c'est la salle qui bloque.
      if (auPlafond(c)) {
        var mp = marcheDuPlafond(e, seance, slug, c, zone, phase, esc, intentionProfil, jour, marches, compteurs, cartes);
        if (mp) sortie[slug] = mp;
        return;
      }
      // 175 (MOTEUR §9.7 / §10.2) — LE GROS CRAN SANS ISSUE : deux essais ratés au plancher, ou la cible d'étirement au plafond
      // (haut + 6) : la carte des leviers sans « Viser plus de reps », une fois par blocage. Une fois proposée, l'escalier ordinaire
      // reprend (la marche ne bloque rien).
      var mg = marcheDuGrosCran(e, seance, slug, c, zone, jour, marches, compteurs);
      if (mg) { sortie[slug] = mg; return; }
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
      // 174 (MOTEUR §14.5, §14.7) — LA 4e MARCHE : là où l'escalier se tairait (3e déclenchement isolé et au-delà, le repli
      // sauté compris), le coach propose d'alléger, une fois par blocage ; refusée, une ligne la rappelle à chaque séance.
      // Jamais en sèche (§9.16 : « rien de plus »), jamais au plafond de la salle (son escalier est plus haut).
      if ((marche === M.MARCHE_SILENCE || (marche === M.MARCHE_REPLI && !c.repli)) && n >= 3 && phase !== 'seche') {
        var nR = Object.prototype.hasOwnProperty.call(E.seriesRoutine || {}, slug) ? Number(E.seriesRoutine[slug]) : null;
        var prop = nR === null || !isFinite(nR) ? null : M.propositionAlleger(c.consigne, c.alleger, nR);
        if (prop) {
          var ma = { marche: M.MARCHE_ALLEGER, n: n, compteur: k, declenchement: declenche, zone: zone === undefined ? null : zone,
                     mode: prop.mode, alleger: prop };
          var dejaA = marches.filter(function (x) {
            return x && x.seance === seance.id && x.exercice === slug && x.marche === M.MARCHE_ALLEGER;
          })[0] || M.allegerProposee(slug, jour, k, marches, compteurs);
          if (dejaA) {
            ma.reponse = dejaA.reponse;
            sortie[slug] = ma;
            return;
          }
          if (declenche) {
            var capA = Voix().capturer(function () { return M.carteAlleger(c.compteur.meilleur, k, prop); });
            if (capA.texte) {
              ma.carte = capA.texte;
              ma.carte.detail = M.detailAlleger(prop, {
                serie: M.serieDePlusProposee(slug, jour, k, marches, compteurs),
                degressive: M.degressiveProposee(slug, jour, k, marches, compteurs)
              }, c.consigne.palier);
              retenirCitationsDeCarte(ma.carte, capA.citations);
              sortie[slug] = ma;
              return;
            }
          }
        }
      }
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
              ? M.carteSchema(zone, c.compteur.meilleur, k, avancent, objectifDuPlan(e.objectif))
              : M.carteSerieDePlus(c.compteur.meilleur, k, avancent, musclesPrimaires(e, slug),
                  musclesParPriorite(e, slug, phase), seriesDeLaRoutine(e, slug));
          });
          m.carte = capCarte.texte;
          if (!m.carte) return;
          retenirCitationsDeCarte(m.carte, capCarte.citations);
        }
      }
      sortie[slug] = m;
    });
    // 186 — TROIS SÉANCES AU-DESSUS DU HAUT : la zone suivante est proposée là où l'escalier ordinaire n'a rien à dire (aucune
    // marche, ou le silence), jamais au plafond de la salle, au gros cran, ni sous 3 reps (la carte de bord est la sienne).
    Object.keys(consignes).forEach(function (slug) {
      var c = consignes[slug];
      if (pris[slug] || !c || !c.consigne || !c.depassement || c.bord || auPlafond(c)) return;
      if (c.consigne.fondement && c.consigne.fondement.cranGros && c.consigne.fondement.cranGros.carte === true) return;
      var deja = sortie[slug];
      if (deja && deja.marche !== M.MARCHE_SILENCE) return;
      var mDep = marcheDuDepassement(seance, slug, c, jour, marches, enBloc, esc);
      if (mDep) sortie[slug] = mDep;
    });
    return sortie;
  }

  // 174 (3/3, MOTEUR §9.1.2) — LA ZONE 3-5 PROPOSÉE SOUS 3 REPS. `c.bord` (figé avec la consigne) : le compte long de la règle
  // de bord, le record et ce qu'il vaut. La marche est celle du schéma : la même carte, la même réponse (`poserZone` à
  // l'acceptation), une fois par blocage. Un exercice d'un bloc de programme en cours se tait (I39). Elle part à la sixième
  // séance exactement, comme un déclenchement : sans réponse, elle ne revient pas à la suivante.
  function marcheDuBord(seance, slug, c, jour, marches, enBloc) {
    var M = Moteur();
    var b = c.bord;
    if (enBloc[slug] || b.total !== M.BORD_PROPOSE_DES) return null;
    var depuisJour = M.jourCivil(b.depuis);
    var deja = marches.filter(function (x) {
      if (!x || x.exercice !== slug || x.marche !== M.MARCHE_SCHEMA) return false;
      if (x.seance === seance.id) return true;
      return (x.reponse === 'acceptee' || x.reponse === 'refusee') && !!x.jour && !!depuisJour &&
        x.jour >= depuisJour && x.jour <= jour;
    })[0];
    var m = { marche: M.MARCHE_SCHEMA, n: 1, compteur: b.total, declenchement: true, zone: null, bord: b };
    if (deja) {
      m.reponse = deja.reponse;
      return m;
    }
    var cap = Voix().capturer(function () { return M.carteBordSchema(b); });
    if (!cap.texte) return null;
    m.carte = cap.texte;
    retenirCitationsDeCarte(m.carte, cap.citations);
    return m;
  }

  // 186 (MOTEUR §9.1.2) — « PASSER EN SÉRIES LONGUES » : `c.depassement` (figé avec la consigne) dit trois séances de suite au-dessus
  // du haut de la zone, à la même charge. La marche est celle du schéma : la même carte, la même réponse (`poserZone`). Un refus
  // (« Garder Volume ») est un pari écrit ; la carte se tait six séances après lui. Un bloc de programme en cours se tait (I39) ;
  // une semaine allégée aussi (I21).
  function marcheDuDepassement(seance, slug, c, jour, marches, enBloc, esc) {
    var M = Moteur();
    var d = c.depassement;
    if (!d || enBloc[slug] || (c.consigne && c.consigne.allegee)) return null;
    var ici = marches.filter(function (x) {
      return x && x.exercice === slug && x.marche === M.MARCHE_SCHEMA && x.seance === seance.id;
    })[0];
    var refus = marches.filter(function (x) {
      return x && x.exercice === slug && x.marche === M.MARCHE_SCHEMA && x.reponse === 'refusee' && !!x.jour && x.seance !== seance.id;
    }).sort(function (a, b) { return a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0; })[0];
    var m = { marche: M.MARCHE_SCHEMA, n: 1, compteur: d.n, declenchement: true, zone: c.consigne ? c.consigne.zone : null, depassement: d };
    if (ici) { m.reponse = ici.reponse; return m; }
    if (refus) {
      var apres = (d.jours || []).filter(function (j) { return !!j && j > refus.jour; }).length;
      if (apres < M.DEPASSEMENT_SILENCE) return null;
    }
    var cap = Voix().capturer(function () { return M.carteDepassement(d); });
    if (!cap.texte) return null;
    m.carte = cap.texte;
    retenirCitationsDeCarte(m.carte, cap.citations);
    return m;
  }

  // 180 (A-F-02, D4) — LA MARCHE D'EN DESSOUS, au poids du corps. Le moteur a compté (`etirement_reps` compte, le compteur monte quand
  // le niveau en reps ne monte pas) ; le plan décide : la consigne est un corps qui continue en reps (`etirement_reps`, palier 0), le
  // compteur est à un déclenchement (4, 8, …), l'app a lu au catalogue une marche du rang juste en dessous (`escalier.dessous[slug]`).
  // Une marche proposée ne revient pas avant le prochain progrès (`marcheProposee`) ; même réponse que les autres marches (un pari).
  function marcheDuDessous(e, seance, slug, c, jour, marches, compteurs) {
    var M = Moteur();
    var k = c.consigne;
    var E = e.escalier;
    var d0 = E && E.dessous && Object.prototype.hasOwnProperty.call(E.dessous, slug) ? E.dessous[slug] : null;
    // 245 (F3) — DEPUIS UNE AIDE, 0 REP STRICTE AU PREMIER ESSAI : la marche d'en dessous TOUT DE SUITE, sans attendre quatre séances.
    // Une fois (une marche déjà proposée pour cet exercice, répondue ou non, ne revient pas) ; les faits viennent de l'app.
    if (d0 && d0.slug && d0.nom && E.premierEssai && E.premierEssai[slug] === true) {
      var vue = marches.filter(function (x) { return x && x.exercice === slug && x.marche === M.MARCHE_DESSOUS; });
      var ici = vue.filter(function (x) { return x.seance === seance.id; })[0];
      if (vue.length && !ici) return null;
      var p = { marche: M.MARCHE_DESSOUS, n: 1, compteur: 0, declenchement: true, zone: null, premierEssai: true,
                dessous: { slug: d0.slug, nom: d0.nom } };
      if (ici) { p.reponse = ici.reponse; return p; }
      var capP = Voix().capturer(function () { return M.carteDessousPremierEssai(d0.nom); });
      if (!capP.texte) return null;
      p.carte = capP.texte;
      retenirCitationsDeCarte(p.carte, capP.citations);
      p.carte.cible = d0.slug;
      p.carte.detail = M.detailDessous(d0.nom);
      return p;
    }
    if (!k || k.etat !== 'etirement_reps' || Number(k.palier) !== 0 || !c.compteur || !c.compteur.meilleur) return null;
    var d = d0;
    if (!d || !d.slug || !d.nom) return null;
    var cpt = c.compteur.compteur;
    if (typeof cpt !== 'number' || cpt < M.PAS_ESCALIER) return null;
    var deja = marches.filter(function (x) {
      return x && x.seance === seance.id && x.exercice === slug && x.marche === M.MARCHE_DESSOUS;
    })[0] || M.marcheProposee(slug, jour, cpt, marches, compteurs || [], M.MARCHE_DESSOUS);
    var declenche = M.estDeclenchement(cpt);
    if (!deja && !declenche) return null;
    var m = { marche: M.MARCHE_DESSOUS, n: 1, compteur: cpt, declenchement: declenche, zone: null,
              dessous: { slug: d.slug, nom: d.nom } };
    if (deja) { m.reponse = deja.reponse; return m; }
    var cap = Voix().capturer(function () { return M.carteDessous(c.compteur.meilleur, cpt, d.nom); });
    if (!cap.texte) return null;
    m.carte = cap.texte;
    m.carte.cible = d.slug;
    m.carte.detail = M.detailDessous(d.nom);
    retenirCitationsDeCarte(m.carte, cap.citations);
    return m;
  }

  // 175 — LA CARTE DU GROS CRAN. Le fondement de la consigne porte `cranGros.carte` (le moteur décide : deux essais ratés, ou la
  // cible au plafond). La marche est celle des leviers, sa réponse un pari `leviers` (gardé ou non) ; proposée, elle ne revient
  // pas avant le prochain progrès (`marcheProposee`), et l'escalier ordinaire reprend la main.
  function marcheDuGrosCran(e, seance, slug, c, zone, jour, marches, compteurs) {
    var M = Moteur();
    var f = c.consigne && c.consigne.fondement;
    var g = f && f.cranGros;
    if (!g || g.carte !== true || !c.compteur || !c.compteur.meilleur) return null;
    var k = c.compteur.compteur;
    var deja = marches.filter(function (x) {
      return x && x.seance === seance.id && x.exercice === slug && x.marche === M.MARCHE_LEVIERS;
    })[0] || M.marcheProposee(slug, jour, k, marches, compteurs, M.MARCHE_LEVIERS);
    var cat = e.catalogue && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    var nom = cat && cat.nom ? cat.nom : slug;
    var remplacant = M.remplacantAuPlafond(remplacantsDe(e, slug), g.de);
    var m = { marche: M.MARCHE_LEVIERS, n: 1, compteur: k, declenchement: false, zone: zone === undefined ? null : zone,
              plafond: { charge: g.de, reps: c.compteur.meilleur.niveau }, gros: true, objets: {}, proposees: {} };
    if (remplacant) {
      m.remplacant = { slug: remplacant.slug, nom: remplacant.nom || remplacant.slug, mesure: remplacant.mesure,
                       salle: remplacant.salle || null };
    }
    var leviers = M.leviersDuGros({ nom: nom, remplacant: m.remplacant || null,
      detail: remplacant ? M.detailRemplacement(remplacant) : null,
      tempoActif: !!M.levierActif(slug, jour, k, marches, compteurs, M.LEVIER_TEMPO) });
    m.leviers = leviers;
    if (deja) { m.reponse = deja.reponse; return m; }
    var cap = Voix().capturer(function () { return M.carteLeviersGros(c.compteur.meilleur, g); });
    m.carte = cap.texte;
    if (!m.carte) return null;
    m.carte.leviers = leviers;
    retenirCitationsDeCarte(m.carte, cap.citations);
    return m;
  }

  // 175 — LES LEVIERS d'un exercice à la plus lourde de sa salle (une donnée du moteur, rédigée hors capture). Le remplaçant
  // est celui de `remplacantAuPlafond` ; le tempo déjà en cours depuis le dernier progrès n'y revient pas.
  function leviersDe(remplacant, plafond, slug, jour, k, marches, compteurs) {
    var M = Moteur();
    return M.leviersDuPlafond({
      remplacant: remplacant, detail: remplacant ? M.detailRemplacement(remplacant) : null,
      charge: plafond.charge, reps: plafond.reps,
      tempoActif: !!M.levierActif(slug, jour, k, marches, compteurs, M.LEVIER_TEMPO) });
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
    // 175 — la carte des leviers part dès la première séance au plafond, sans attendre un déclenchement : `marcheAuPlafond`
    // décide (les leviers d'abord, puis la série de plus et la dégressive aux déclenchements).
    if (!plafond) return null;
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
    objets[M.MARCHE_SERIE_DE_PLUS] = charge && !M.estZoneForce(zone) && !!zone && phase !== 'seche' &&
      placeDeLExercice(e, slug, phase) === true;
    objets[M.MARCHE_DEGRESSIVE] = charge &&
      M.degressivePossible(conditionsDegressive(e, seance, slug, zone, phase, esc, intentionProfil));
    // 175 — la carte des leviers a toujours un objet (« Ajouter une charge dans Ma salle ») ; le frère plus chargeable en est
    // le premier levier (le remplacement n'est plus une marche à part).
    // Sauf quand la personne vient de choisir « Plus léger » (D11, 120) : la consigne porte son repli, et une carte de plus
    // s'ajouterait à un choix qu'elle vient de faire (I21 : jamais une carte et un repli ensemble).
    var repriseLegere = !!(seance.reprises && Object.prototype.hasOwnProperty.call(seance.reprises, slug) &&
      seance.reprises[slug] && seance.reprises[slug].choix === 'leger');
    objets[M.MARCHE_LEVIERS] = !c.consigne.repli && !repriseLegere;
    var choix = M.marcheAuPlafond(k, proposees, objets);
    if (!choix) return null;
    var dejaVues = {};
    M.MARCHES_PLAFOND.forEach(function (mk) { dejaVues[mk] = !!proposees[mk]; });
    var m = { marche: choix.marche, n: M.nIsole(k, M.declenchementsRepondus(slug, jour, k, cartes, compteurs)),
              compteur: k, declenchement: M.estDeclenchement(k), zone: zone === undefined ? null : zone,
              plafond: { charge: plafond.charge, reps: plafond.reps }, objets: objets, proposees: dejaVues };
    if (choix.marche === M.MARCHE_LEVIERS && remplacant) {
      m.remplacant = { slug: remplacant.slug, nom: remplacant.nom || remplacant.slug, mesure: remplacant.mesure,
                       salle: remplacant.salle || null };
    }
    // 175 — LES LEVIERS SE GARDENT : refusée (« Garder ») ou non, la page de l'exercice les relit (« Pour continuer à monter »).
    // Une donnée du plan, rédigée hors capture ; le tempo déjà en cours n'y revient pas.
    // Un exercice noté par nom (132) : la carte se dit par les NOMS (« Noir × 20, ton élastique le plus fort. »), au formateur.
    var salleEl = salleElastiqueDuPlan(e, slug);
    var sensEl = salleEl && c.consigne.fondement && c.consigne.fondement.salle ? c.consigne.fondement.salle.sens || null : null;
    var enNomsEl = function (fn) { return Voix().avecNoms(salleEl ? salleEl.noms : null, fn); };
    if (choix.marche === M.MARCHE_LEVIERS) {
      m.leviers = enNomsEl(function () { return leviersDe(m.remplacant || null, plafond, slug, jour, k, marches, compteurs); });
    }
    if (choix.deja) {
      m.reponse = choix.deja.reponse;
      return m;
    }
    var capCarte = enNomsEl(function () {
      return Voix().capturer(function () {
        return M.cartePlafond(choix.marche, c.compteur.meilleur, k, {
          muscles: musclesPrimaires(e, slug), parPriorite: musclesParPriorite(e, slug, phase), sens: sensEl,
          nRoutine: seriesDeLaRoutine(e, slug) });
      });
    });
    m.carte = capCarte.texte;
    if (!m.carte) return null;
    // 175 — les leviers de la carte : une donnée du moteur, rédigée HORS de la capture (la phrase seule se vérifie, §20 bis).
    // Le détail du remplacement (« … : ta salle va jusqu'à … ») aussi.
    if (choix.marche === M.MARCHE_LEVIERS) m.carte.leviers = m.leviers;
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
      // 132 (MOTEUR §10 ter) — pas de dégressive sur un élastique noté par nom (un élastique n'est pas un disque) :
      // la classe tue, comme hors du catalogue — aucune dégressive proposée.
      polyarticulaire: salleElastiqueDuPlan(e, slug) ? null : polyarticulaireDe(e, slug),
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
  // `true` (polyarticulaire), `false` (une isolation, `THMoteur.estIsolation`), `null` : inconnu — hors du catalogue, ou
  // sans muscle connu (124, audit du 16/10/2026, 01 #15 : ni l'un ni l'autre, comme pour la salle).
  function polyarticulaireDe(e, slug) {
    var cat = e.catalogue && slug && Object.prototype.hasOwnProperty.call(e.catalogue, slug) ? e.catalogue[slug] : null;
    if (!cat) return null;
    var muscles = { prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [],
                    stab: cat.muscles_stabilisateurs || [] };
    if (Moteur().estPolyarticulaire(muscles)) return true;
    return Moteur().estIsolation(muscles) ? false : null;
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

  // 174 (MOTEUR §14.5, §14.7) — LES ALLÈGEMENTS EN COURS : la 4e marche, acceptée, pas de progrès depuis — à chaque séance de
  // l'exercice jusqu'à son prochain progrès. Jamais pendant une semaine allégée, jamais en sèche, jamais en Édition, jamais au
  // plafond de la salle (son escalier est le sien). Rend `{ [slug]: proposition }` (la proposition du moteur, recalculée sur
  // les crans figés avec la consigne et les séries de la routine : la même qu'à l'acceptation).
  function allegementsActifs(e, seance, consignes, esc, phase) {
    var sortie = {};
    var E = e.escalier;
    if (!E || seance.edition || esc.allegee || phase === 'seche') return sortie;
    var M = Moteur();
    var jour = M.jourCivil(seance.debut);
    if (!jour) return sortie;
    var routine = E.seriesRoutine || {};
    Object.keys(consignes).forEach(function (slug) {
      var c = consignes[slug];
      if (!c || !c.consigne || !c.compteur || typeof c.compteur.compteur !== 'number' || auPlafond(c)) return;
      if (!M.allegerActive(slug, jour, c.compteur.compteur, E.marches || [], E.compteurs || [])) return;
      var n = Object.prototype.hasOwnProperty.call(routine, slug) ? Number(routine[slug]) : NaN;
      var prop = isFinite(n) ? M.propositionAlleger(c.consigne, c.alleger, n) : null;
      if (prop) sortie[slug] = prop;
    });
    return sortie;
  }

  // §9.22 (53-2) — les blocs du programme (la table `blocs`, lue par l'app) et
  // les derniers jours des semaines allégées acceptées.
  var SOURCE_DECHARGE = 'decharge_planifiee';
  function enBlocDuJour(e, seance) {
    var M = Moteur();
    var jour = M.jourCivil(seance && seance.debut);
    var enBloc = jour ? M.exercicesEnBloc(blocsDuProgramme(e), jour) : {};
    // 193-3 (MOTEUR §9.22) — UN EXERCICE DONT LA LIGNE DE ROUTINE DU JOUR A UNE ZONE DE PLAN EST HORS DU BLOC CE JOUR-LÀ : la
    // routine a fixé sa zone, le bloc ne la déplace pas (I81). Il reste dans le bloc les autres jours.
    var vus = {};
    ((seance && seance.exercices) || []).forEach(function (x) {
      if (!x || vus[x.exercise_slug]) return;
      vus[x.exercise_slug] = true;
      if (x.zone_plan && enBloc[x.exercise_slug]) { enBloc = Object.assign({}, enBloc); delete enBloc[x.exercise_slug]; }
    });
    return enBloc;
  }
  // PR 5b-1 (MOTEUR §9.50) — LE RÉGIME À VENIR d'un exercice, calculé AU RENDU depuis les entrées (blocs du programme, cartes allégées acceptées, semaine de mesure
  // acceptée) : la suite que l'app donne est copiée avec son `regime` ; le moteur écrit la date ou se tait. Rien n'est écrit, rien n'est mémorisé. Un exercice
  // sans suite, ou dont la suite se tait, n'a pas de régime : le régime ne crée jamais d'annonce.
  function suiteSousRegime(suite, e, seance, slug) {
    if (!suite || !suite.consigne || seance.edition) return suite;
    var M = Moteur(), G = racine.THGenerateur;
    var jour = M.jourCivil(seance.debut);
    if (!jour) return suite;
    var famille = G && G.familleDeBarre ? G.familleDeBarre(slug, e.catalogue || {}) : null;
    var T = e.semaineDeTest;
    var r = M.regimeAVenir({ jour: jour, ecart: suite.ecart, blocs: blocsDuProgramme(e), finsAllegees: finsAllegees((e.escalier || {}).cartes),
      test: T && T.debut && T.fin ? { debut: T.debut, fin: T.fin } : null, slug: slug, famille: famille === undefined ? null : famille,
      zone: suite.consigne.zone === undefined ? null : suite.consigne.zone });
    return r ? Object.assign({}, suite, { regime: r }) : suite;
  }

  function blocsDuProgramme(e) { return (e && e.programme && e.programme.blocs) || []; }
  function finsAllegees(cartes) {
    return (cartes || []).filter(function (c) { return c && c.reponse === 'acceptee' && c.fin; })
      .map(function (c) { return c.fin; });
  }

  // ══ 189 (MOTEUR §14.11) — « UNE SÉRIE DE MOINS JUSQU'À LA FIN DE TA SÈCHE » ═════════════════════════════════════════
  //
  // La troisième réponse de la carte, en sèche : la décision dure ; elle se montre à chaque séance et s'annule. L'app donne
  // `escalier.serieDeMoins = { active }` (la réponse du profil, valable tant que la sèche de la réponse dure) ; le plan lit
  // la structure VIVANTE de la séance : rien n'est écrit dans la routine.
  function serieDeMoinsEnCours(e, seance, intentionProfil) {
    var E = e.escalier;
    return !!E && !!E.serieDeMoins && E.serieDeMoins.active === true && !seance.edition && intentionProfil !== 'entretien';
  }
  // Rend `{ [slug]: n }` : les exercices qui gardent une série de moins — ceux qui ont une consigne, ne sont pas une priorité
  // (jamais touchée), et dont la routine compte au moins une série. `n` : les séries de la routine, figées avec la consigne.
  function seriesDeMoinsActives(e, seance, consignes) {
    var sortie = {};
    var E = e.escalier;
    if (!E) return sortie;
    var routine = E.seriesRoutine || {};
    var prioritaires = Array.isArray(E.prioritaires) ? E.prioritaires : [];
    Object.keys(consignes).forEach(function (slug) {
      var c = consignes[slug];
      if (!c || !c.consigne || prioritaires.indexOf(slug) >= 0) return;
      var n = Object.prototype.hasOwnProperty.call(routine, slug) ? Number(routine[slug]) : NaN;
      if (isFinite(n) && n >= 1) sortie[slug] = n;
    });
    return sortie;
  }
  function serieDeMoinsDuPlan() {
    var M = Moteur();
    return { bandeau: M.bandeauSerieDeMoins(), libelle: M.libelleRevenirAuxSeries() };
  }

  // 189 — LA LIGNE EN MOINS, une fois : à l'acceptation et à la création d'une séance pendant la sèche (comme la série de plus,
  // jamais au rendu : une ligne remise par « + Série » reste). La DERNIÈRE ligne de travail non validée d'un exercice dont la
  // séance compte encore toutes les séries de sa routine. Jamais une série validée, jamais sous 2. Rend `[{ iExo, iSerie }]`.
  function lignesAEnlever(plan, iExo) {
    var sortie = [];
    ((plan && plan.exercices) || []).forEach(function (x) {
      var m = x && x.consigne && x.consigne.serieDeMoins;
      if (!m || (typeof iExo === 'number' && x.iExo !== iExo)) return;
      var travail = (x.lignes || []).filter(function (l) { return l.type === 'travail'; });
      if (travail.length !== m.routine || m.series >= m.routine) return;
      var libres = travail.filter(function (l) { return !l.validee; });
      if (!libres.length) return;
      var cible = libres[libres.length - 1];
      sortie.push({ iExo: x.iExo, iSerie: cible.iSerie });
    });
    return sortie;
  }

  // PR 3 (B4, MOTEUR §9.45) — « avec de la marge » au bandeau d'une décharge seulement si une cible (reps ou charge) baisse sur au moins un
  // exercice ; une séance que de simples au palier dit « Moins de séries. » (`plan.allegee.marge === false`, relu par la refabrication des
  // textes et par I166). Sans exercice allégé (rien de chiffré), le bandeau garde sa phrase générale.
  function margeDuBandeau(plan) {
    var a = plan && plan.allegee;
    if (!a || !a.bandeau) return;
    var M = Moteur();
    var allegees = (plan.exercices || []).filter(function (x) { return x && x.consigne && x.consigne.allegee; });
    if (!allegees.length || allegees.some(function (x) { return M.cibleBaisse(x.consigne); })) return;
    a.marge = false;
    a.bandeau = a.source === SOURCE_DECHARGE ? M.bandeauDecharge(a.semaine, a.semaines, false) : M.bandeauAllegee(a.fin, false);
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
    // 189 — UNE FOIS PAR ÉPISODE : aucune carte de fatigue dans les 4 semaines d'une autre, quel que soit son déclencheur
    // (elle s'ajoute à la mémoire du déclencheur, §14.3, sans la remplacer).
    if (b && (!M.carteAutorisee(b.declencheur, jour, cartes, esc.compteurs || [], blocs) || !M.fatigueAutorisee(cartes, jour))) b = null;
    // 189 (MOTEUR §14.11) — LE SECOND DÉCLENCHEUR, LA MÊME CARTE : tes séries baissent depuis 3 semaines. Aucune carte de fatigue
    // dans les 4 semaines d'une autre, ni pendant une semaine allégée ou une décharge planifiée (déjà rendues plus haut), ni
    // pendant une « série de moins » en cours. Les deux déclencheurs la même séance : une seule carte, le texte de la baisse.
    var baisse = null, attendue = null;
    var moinsPose = !!(esc.serieDeMoins && esc.serieDeMoins.active === true);
    if (e.escalier.baisse && !moinsPose && M.baisseAutorisee(cartes, jour, blocs)) {
      var donnees = typeof e.escalier.baisse === 'function' ? e.escalier.baisse(jour) : e.escalier.baisse;
      var r = donnees ? M.baisseGenerale(donnees) : null;
      if (r && r.declenche) baisse = r;
      // 198 — en sèche, sous 5 % : pas de carte, une phrase descriptive (MOTEUR §9.34).
      else if (r && phaseDuPlan(e.phase) === 'seche') {
        var att = M.baisseAttendue(r);
        if (att) attendue = { titre: M.titreBaisseAttendue(), phrase: M.phraseBaisseAttendue(att.noms, att.moyenne, att.reserve),
                              fait: { noms: att.noms, moyenne: att.moyenne, reserve: att.reserve },
                              // 202 — « D'où ça vient » : Garthe 2011, lu au registre (aucune règle sur le poids : l'écran Poids prime).
                              sources: M.sourcesDeRegles(['seche.baisse']) };
      }
    }
    if (!b && !baisse) return attendue ? { allegee: null, carte: null, attendue: attendue } : vide;
    var nom = function (s) { return esc.noms && esc.noms[s] ? esc.noms[s] : s; };
    if (!baisse) {
      return {
        allegee: null,
        carte: { jour: jour, declencheur: b.declencheur, compteur: b.compteur, cites: b.cites.slice(), source: 'blocage', titre: null,
                 phrase: M.phraseCarte(b.cites.map(nom)), detail: M.detailCarte(), oui: M.libelleAlleger() }
      };
    }
    var seche = phaseDuPlan(e.phase) === 'seche';
    var nomsBaisse = baisse.lignes.filter(function (l) { return baisse.baissent.indexOf(l.slug) >= 0; }).map(function (l) { return l.nom; });
    var cites = baisse.baissent.slice();
    (b ? b.cites : []).forEach(function (s) { if (cites.indexOf(s) < 0) cites.push(s); });
    var avant = {};
    baisse.lignes.forEach(function (l) { if (baisse.baissent.indexOf(l.slug) >= 0) avant[l.slug] = l.avant; });
    return {
      allegee: null,
      carte: { jour: jour, declencheur: b ? b.declencheur : baisse.baissent[0], compteur: b ? b.compteur : null, cites: cites,
               source: M.SOURCE_BAISSE, titre: M.titreBaisse(),
               phrase: M.phraseBaisse(nomsBaisse, baisse.moyenne, baisse.reserve, seche ? baisse.poids : null),
               detail: M.detailBaisse(seche), oui: M.libelleAlleger(),
               // La troisième réponse, en sèche seulement.
               serieDeMoins: seche ? M.libelleSerieDeMoins() : null,
               pourquoi: M.pourquoiBaisse(baisse), avant: avant, moyenne: baisse.moyenne,
               // De quoi refaire la phrase (I26 la relit) : les noms, la moyenne, la réserve et le poids dits.
               fait: { noms: nomsBaisse, moyenne: baisse.moyenne, reserve: baisse.reserve, poids: seche ? baisse.poids : null, seche: seche } }
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
    // 20/11/2026 — la barre vide se reconnaît à sa MARQUE (`chauffe.barre`), jamais à sa charge.
    var sousRef = function (c, ref, l) {
      return (c < ref && !memeChargeOuVides(c, ref)) || (barre && !!l && !!l.chauffe && l.chauffe.barre === true);
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
        if (l.chauffe.charge !== null || l.validee || l.chauffe.corps) return;
        // 20/11/2026 — « peu de temps » réduit un nombre fixé : les lignes laissées vides (après les chauffes gardées, CONTRA-725 D9), avec leur phrase.
        if (l.chauffe.peu_de_temps) {
          if ((ch.phrase || '').indexOf('Tu as peu de temps') < 0 && !lignes.some(function (q) { return q.validee; })) err('I16', 'une chauffe laissée par « peu de temps » sans sa phrase (série ' + l.iSerie + ')');
          return;
        }
        if (l.chauffe.trop_leger) {
          if (ch.phrase !== null && (ch.phrase || '').indexOf('Trop léger pour une chauffe de plus.') < 0) err('I16', 'une chauffe trop légère sans sa phrase (série ' + l.iSerie + ')');
          return;
        }
        // 265 (§9.15.7, I149) — une chauffe vide parce que trop proche de la charge de travail a toujours sa phrase, même
        // après une chauffe faite (`phrase_apres_faites`).
        if (l.chauffe.trop_proche) {
          if ((ch.phrase || '').indexOf('Trop proche de ta charge de travail pour une chauffe de plus.') < 0) err('I149', 'une chauffe trop proche sans sa phrase (série ' + l.iSerie + ')');
          return;
        }
        if (vues <= ch.prevues) err('I16', 'une chauffe de la routine restée vide (série ' + l.iSerie + ')');
      });
      lignes.forEach(function (l) {
        if (!l.chauffe || l.chauffe.charge === null) return;
        var c = nombre(l.chauffe.charge);
        if (!sousRef(c, ch.reference, l)) err('I16', 'chauffe ' + c + ' pas sous la référence ' + ch.reference + ' (série ' + l.iSerie + ')');
        if (avant !== null && c < avant && !memeChargeOuVides(c, avant)) err('I16', 'chauffe ' + c + ' après ' + avant + ' : la montée redescend (série ' + l.iSerie + ')');
        if (!l.validee && (!l.fantome || !memeChargeOuVides(l.fantome.charge, c))) err('I16', 'la chauffe de la série ' + l.iSerie + ' n’est pas dans son fantôme');
        avant = c;
      });
    }
    if (x.proposition) {
      var pa = null, pr = null;
      x.proposition.lignes.forEach(function (q) {
        if (q[0] === null) return;
        if (!sousRef(q[0], x.proposition.reference)) err('I16', 'chauffe proposée ' + q[0] + ' pas sous la référence ' + x.proposition.reference);
        if (pa !== null && q[0] < pa) err('I16', 'chauffe proposée ' + q[0] + ' après ' + pa);
        if (pr !== null && q[1] > pr) err('I16', 'reps proposées ' + q[1] + ' après ' + pr + ' : elles montent');
        pa = q[0]; pr = q[1];
      });
      if (lignes.some(function (l) { return l.type === 'echauffement'; })) err('I16', 'une proposition de chauffes alors que l’exercice en a');
    }
    // 151 — I17 étendu : la chaîne des baisses (la première, puis la seconde, puis les lignes en trop).
    [x.degressive].concat(x.degressivesPlus || []).filter(Boolean).forEach(function (d, rangD) {
      var l = lignes[d.iSerie] || {};
      if (rangD >= 1 && d.charge !== null) {
        if (rangD >= 2) err('I17', 'une troisième ligne dégressive remplie (' + d.charge + ' kg)');
        if (d.lourde) err('I17', 'une seconde baisse remplie à la barre lourde (' + d.charge + ' kg)');
        if (d.premiereReps !== null && d.premiereReps !== undefined && d.premiereReps < 4) {
          err('I17', 'une seconde baisse remplie après une première à ' + d.premiereReps + ' reps');
        }
      }
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
      if (d.charge !== null && !(d.charge < d.reference && !memeChargeOuVides(d.charge, d.reference))) {
        err('I17', 'dégressive ' + d.charge + ' pas sous la dernière série de travail ' + d.reference);
      }
      if (!l.validee && (!l.fantome || !memeChargeOuVides(l.fantome.charge, d.charge))) err('I17', 'la dégressive n’est pas dans son fantôme');
    });
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
      return u !== null && v !== null && u < v && !memeChargeOuVides(u, v);
    };
    var faite = function (l) { return l && l.validee && l.faite ? nombre(l.faite.charge) : null; };
    // Plus légère que sa ligne, au sens de la phrase : jamais le test remis à
    // plus tard ; sous un élan, plus légère aussi que ce qu'il remplaçait.
    var legereSurSaLigne = function (l) {
      var f = faite(l);
      if (f === null || !plusLegere(f, l.charge)) return false;
      if ((l.role === 'test' || l.role === 'elan') && memeChargeOuVides(f, P)) return false;
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
      } else if ((d.role === 'test' || d.role === 'elan') && memeChargeOuVides(f41, P)) {
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
    // I41 étendu (16/11/2026, MOTEUR §9.14 bis) — « plus léger », « pas encore » ne disent jamais « la suite reste … vise N » avec N sous le bas de la zone
    // de la consigne (hors ligne de test, qui vise moins par nature) : le fait seul.
    if (msg && (msg.type === 'plus_leger' || msg.type === 'pas_encore_soi' || msg.type === 'pas_encore') && msg.suite && nombre(msg.suite.vise) !== null) {
      var zI41 = racine.THMoteur.zoneParCle(k.zone), ligneSuite = couvertes[msg.rang];
      if (zI41 && nombre(msg.suite.vise) < zI41.bas && !(ligneSuite && ligneSuite.role === 'test')) {
        err('I41', 'la phrase dit « la suite … vise ' + msg.suite.vise + ' », sous le bas de la zone (' + zI41.bas + ')');
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
      for (var u = arret; u < j; u++) if (memeChargeOuVides(faite(couvertes[u]), l.charge)) repose = true;
      if (!repose) {
        err('I43', 'la ligne d\'élan ' + j + ' (' + l.charge + ') survit à la série plus légère de la position ' + arret);
      }
    });
    if (msg && (msg.type === 'elan' || msg.type === 'effort_suggere')) {
      var porte = couvertes.some(function (l, j) {
        return j >= msg.rang && !l.validee && l.role === 'elan' && memeChargeOuVides(l.charge, msg.charge);
      });
      if (!porte) err('I43', '« ' + msg.type + ' » sans ligne d\'élan à ' + msg.charge);
    }
    // I44 (MOTEUR §9.14 ter, 68B ; réécrit le 20/11/2026, Lot F étape 1) — une ligne « à fond » (source `a_fond`) suit la DERNIÈRE série validée avant
    // elle : à fond, à la même charge, et vise ses reps moins une (la règle d'avant, garde ≥ 1 ou série plus lourde que sa ligne) ; OU, à garde 0
    // (la propagation), elle vise la plus basse borne des séries validées avant elle, à fond et à sa charge (`max(bas, r − 1)`, CONTRA-723 B2) :
    // jamais sous le bas de la zone.
    var z44 = x.consigne ? Moteur().zoneParCle(x.consigne.zone) : null;
    couvertes.forEach(function (l, j) {
      if (l.source !== 'a_fond') return;
      var avant44 = [];
      for (var q = j - 1; q >= 0; q--) if (couvertes[q] && couvertes[q].validee && couvertes[q].faite) avant44.push(couvertes[q].faite);
      var f44 = avant44.length ? avant44[0] : null;
      if (!f44) { err('I44', 'la ligne « à fond » ' + j + ' sans série validée avant elle'); return; }
      var estAFond = function (f) { return racine.THPalier.cranDeSerie({ rpe: f.rpe, ressenti: f.ressenti }) === 'max'; };
      var aFond = estAFond(f44);
      var ancienne = aFond && memeChargeOuVides(l.charge, f44.charge) && nombre(l.vise) === nombre(f44.reps) - 1;
      var borne = null;
      if (z44) {
        avant44.forEach(function (f) {
          var r = nombre(f.reps);
          if (!estAFond(f) || r === null || r < 1 || !memeChargeOuVides(l.charge, f.charge)) return;
          var b = Math.max(z44.bas, r - 1);   // CONTRA-723 B2 : sous le bas, le bas
          borne = borne === null ? b : Math.min(borne, b);
        });
      }
      var propagee = borne !== null && nombre(l.vise) === borne;
      if (!ancienne && !propagee) {
        err('I44', 'la ligne « à fond » ' + j + ' (' + l.charge + ' × ' + l.vise + ') après ' + f44.charge + ' × ' + f44.reps +
          (aFond ? '' : ', une série qui n\'est pas à fond'));
      }
    });
  }

  // I78 (193-1, MOTEUR §9.28) — LES SÉRIES DE RECUL. Une ligne de recul n'est jamais couverte (rôle `hors`, I1) et ne vote nulle
  // part : sa charge est celle de la grosse série du jour moins un écart borné (5 à 20 %), strictement sous elle ; son fantôme, la
  // charge du recul ; son pari, un seul par recul, de rôle `recul` et de rang `r1`, `r2`… (jamais un rang de la couverture).
  function verifierReculs(x, err) {
    var lignes = x.lignes || [];
    var rec = lignes.filter(function (l) { return l.type === 'recul'; });
    rec.forEach(function (l) {
      if (l.role !== 'hors') err('I78', 'série ' + l.iSerie + ' : un recul couvert (rôle ' + l.role + ')');
      if (l.figee) err('I78', 'série ' + l.iSerie + ' : un recul figé comme une ligne de la consigne');
      var q = x.paris && x.paris[l.iSerie];
      if (q && (q.fondement.role !== 'recul' || typeof q.fondement.rang !== 'string')) {
        err('I78', 'série ' + l.iSerie + ' : le pari d\u2019un recul doit dire « recul » et porter un rang texte (' + q.fondement.role + ', ' + q.fondement.rang + ')');
      }
    });
    var R = x.reculs;
    if (!R) {
      rec.forEach(function (l) { if (l.fantome) err('I78', 'série ' + l.iSerie + ' : un fantôme de recul sans plan de reculs'); });
      return;
    }
    var g = nombre(R.grosse), c = nombre(R.charge), e = nombre(R.ecart);
    // I82 (193-5, MOTEUR §9.28) — LE RECUL SUR LE MAX DU JOUR. Seulement quand les reps visées des reculs dépassent celles de la grosse
    // série (connues) ; la charge est celle que la table donne (max du jour × pourcentage des reps du recul, marge 2, × (1 + correction)),
    // arrondie au cran le plus proche, strictement sous la grosse série ; la correction reste dans ± 10 %, un pas de 2,5 %. Sinon : 193-1.
    if (R.mode === 'max_du_jour') {
      var M = Moteur();
      var gr = nombre(R.grosseReps), vi = nombre(R.vise), co = nombre(R.correction), mg = nombre(R.marge);
      if (c === null || gr === null || vi === null || !(vi > gr)) err('I82', 'un recul sur le max du jour sans reps plus hautes que la grosse série (' + vi + ' contre ' + gr + ')');
      else {
        if (mg === null || mg < 0 || co === null || Math.abs(co) > 0.10 + 1e-9 || Math.abs(Math.round(co / 0.025) * 0.025 - co) > 1e-6) {
          err('I82', 'la marge (' + mg + ') ou la correction (' + co + ') des reculs sort de ses bornes (± 10 %, par pas de 2,5 %)');
        } else if (!R.surSalle) {
          var attendu = M.reculSurLeMaxDuJour({ grosse: g, grosseReps: gr, marge: mg, reps: vi, correction: co, cran: R.cran === null ? undefined : R.cran });
          if (attendu === null || attendu.charge !== c) err('I82', 'le recul à ' + c + ' kg n\u2019est pas celui de la table (' + (attendu === null ? 'aucun' : attendu.charge) + ' kg)');
        }
        if (Math.abs(R.max_du_jour - (g / (M.pctDuMax(gr, mg) / 100))) > 0.5 + 1e-9) err('I82', 'le max du jour (' + R.max_du_jour + ' kg) n\u2019est pas celui de la grosse série');
      }
    }
    // I147 (266, MOTEUR §9.28) — LE DÉPART DE L'ÉCART : sans séance à reculs, l'écart est celui de la table des reps (`ecartDeDepartDeRecul`) ;
    // sans reps connues, le 10 % de départ.
    if (R.mode !== 'max_du_jour' && R.depart === true && c !== null) {
      var M147 = Moteur();
      if (R.deduit === true) {
        var att147 = M147.ecartDeDepartDeRecul(R.grosseReps, R.margeGrosse, R.vise);
        if (att147 === null || e === null || Math.abs(e - att147) > 1e-9) err('I147', 'le départ des reculs (' + e + ') n\u2019est pas celui de la table (' + att147 + ')');
      } else if (e === null || Math.abs(e - M147.RECUL_ECART_DEPART) > 1e-9) {
        err('I147', 'le départ des reculs sans reps connues (' + e + ') n\u2019est pas le ' + M147.RECUL_ECART_DEPART + ' de départ');
      }
    }
    if (c !== null) {
      if (g === null || !(c > 0) || !(c < g)) err('I78', 'le recul à ' + c + ' kg n\u2019est pas sous la grosse série (' + g + ' kg)');
      // I78 amendé (193-5) : les bornes 5 à 20 % valent pour la 193-1 ; sur le max du jour, l'écart est un fait descriptif (I82).
      if (R.mode !== 'max_du_jour' && (e === null || e < 0.05 - 1e-9 || e > 0.2 + 1e-9)) err('I78', 'l\u2019écart des reculs (' + e + ') sort des bornes 5 à 20 %');
      rec.forEach(function (l) {
        if (l.validee) return;
        if (!l.fantome || l.fantome.source !== 'recul' || !memeChargeOuVides(l.fantome.charge, c)) {
          err('I78', 'série ' + l.iSerie + ' : le fantôme du recul n\u2019est pas la charge du plan (' + c + ' kg)');
        }
      });
    } else {
      rec.forEach(function (l) {
        if (l.fantome) err('I78', 'série ' + l.iSerie + ' : un fantôme de recul alors que le plan n\u2019a pas de charge à proposer');
      });
    }
  }

  // Les paris d'un recul écrits (la séance) : un seul par rang, observé sur une série de recul validée.
  function verifierParisDeRecul(x, err, parisRecul) {
    var vus = {};
    (parisRecul || []).forEach(function (q) {
      var r = String(q.fondement.rang);
      if (!/^r[0-9]+$/.test(r)) err('I78', 'un pari de recul au rang « ' + r + ' » : le rang d\u2019un recul est « r1 », « r2 »…');
      var cle = r + '|' + (Number(q.fondement.revision) || 0);
      if (vus[cle]) err('I78', 'deux paris de recul pour le rang ' + r);
      vus[cle] = true;
      if (!q.set_observe) return;
      var l = (x.lignes || []).filter(function (c) { return c.id === q.set_observe; })[0];
      if (!l || !l.validee || l.type !== 'recul') err('I78', 'un pari de recul (rang ' + r + ') est observé sur une série qui n\u2019est pas un recul validé');
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
      // 193-1 — la SEULE ligne hors couverture qui parie est le recul (rang `r1`…, rôle `recul` : I78).
      if (l.role === 'hors' && l.type !== 'recul' && x.paris && x.paris[l.iSerie]) err('I1', 'série ' + l.iSerie + ' hors couverture, avec un pari');
    });
    verifierAutour(x, err);
    verifierReculs(x, err);
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
      // 251 (D2) — la porte du cran fermée (et non tentée) : plus aucun test attendu sur les lignes libres (la couverture ne le pose plus).
      var porte5 = !!(x.porteDuCran && x.porteDuCran.fermee && !x.porteDuCran.tente);
      var attendus5 = porte5 ? 0 : Math.min(Math.max(0, k5 - figes5), libres5.length);
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
      if (ch !== null && prevue !== null && ch < prevue && !memeChargeOuVides(ch, prevue)) {
        err('I3', 'proposition ' + ch + ' plus basse que la ligne prévue ' + prevue + ' (ligne ' + i + ')');
      }
      // Sans exception (49-U7) : la tolérance de 49-U5 pour une reprise longue
      // « au palier » (P008, F028) est partie avec les cas corrigés — le cran
      // se lit au-dessus de la charge retenue (`reactionPour`).
      if (ch !== null && P !== null && !(ch > P && !memeChargeOuVides(ch, P))) {
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
      if (suivi && !memeChargeOuVides(p.charge, testI14)) {
        err('I14', 'la proposition du coach (ligne ' + i + ', ' + p.charge + ') précède un test prévu à ' +
          testI14 + ', à une autre charge');
      }
    });

    // I15, LE REPLI (§9.9, delta 49-13 ; numéroté par le delta 49-14) — une reprise longue ne descend jamais de
    // plus de 10 % sous le dernier palier : ni la consigne figée, ni une ligne
    // qui la reprend.
    // 16/11/2026 — la ligne posée au bas de la zone (`fondement.reprisePlancher`) est jugée contre son propre calcul par I205, pas contre le palier.
    var posee = x.consigne.fondement && x.consigne.fondement.reprisePlancher;
    if (x.consigne.etat === 'reprise_longue' && !posee) {
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
          if (f.rang !== g.rang || f.role !== g.role || !memeChargeOuVides(f.charge, g.charge) || nombre(f.vise) !== nombre(g.vise)) {
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
        // 179 (A-F-03) — la visée du TEST de l'en-tête est celle de la ligne de test que le plan affiche (`consigneDeLEntete`) :
        // un test que « à fond » a retouché se dit à sa visée du moment, jamais à celle d'avant.
        var viseDuTest = s.role === 'haut' && src && (x.lignes || []).some(function (l) {
          return l && l.role === 'test' && nombre(l.vise) === nombre(s.vise) && memeChargeOuVides(nombre(l.charge), nombre(src.charge));
        });
        if (src && (!memeChargeOuVides(s.charge, src.charge) || (nombre(s.vise) !== nombre(src.vise) && !viseDuTest))) {
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
          if (tenue && memeChargeOuVides(t.charge, tenue.charge)) avant = true;
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
      if (!memeChargeOuVides(f.charge, l.charge) || nombre(f.reps) !== repsPlan) {
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
        if (prevue === null) return tI10 !== null && fait > tI10 && !memeChargeOuVides(fait, tI10);
        if (l.role === 'coach' || l.role === 'elan') return fait > prevue || memeChargeOuVides(fait, prevue);
        return memeChargeOuVides(fait, prevue);
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
        if (!k10.montee || !memeChargeOuVides(k10.montee.charge, tenue) ||
            /^Pas de palier/.test(verdict) || /^Pas encore/.test(verdict)) {
          err('I10', 'une montée du coach a tenu à ' + tenue + ', le constat ne la dit pas : « ' + verdict + ' »');
        }
        var proposees = (k10.suiteCharges || []).map(nombre).filter(function (v) { return v !== null; });
        var max = proposees.length ? Math.max.apply(null, proposees) : null;
        if (max === null || (max < tenue && !memeChargeOuVides(max, tenue))) {
          err('I10 suite', 'la montée a tenu à ' + tenue + ', la prochaine séance propose ' +
            (max === null ? 'aucune charge' : max) + ' (état ' + k10.suiteEtat + ')');
        }
      }
      if (/^Pas de palier/.test(verdict) && couvertes.every(suivieI10)) {
        err('I10', '« Pas de palier » alors que toutes les séries ont suivi le plan');
      }
    }

    // I163 — LE VERDICT NE CONTREDIT JAMAIS LE CHIFFRE (« Les mots disent vrai », PR 2, MOTEUR §9.44), DANS LES DEUX SENS. Relu ici sur les
    // lignes du plan, par une arithmétique à part de `Moteur.cibleFaite` (qui décide la phrase) :
    //   (a) « Pas encore » ⇒ les séries faites à la charge de la ligne sont au moins aussi nombreuses que celles qu'elle couvre,
    //       et l'une d'elles est sous la cible — jamais à qui a fait toutes ses séries à la cible ; la phrase dit la même cible
    //       que la ligne (« pour une cible de N ») ;
    //   (b) « Cible faite » ⇒ la ligne est complète à sa charge, aucune série n'est à plus d'une rep sous la cible (la tolérance du
    //       moteur, nommée), et aucun test proposé n'est laissé de côté ; la meilleure série du réglage Franc ne suffit jamais ;
    //   (c) le jugement du moteur (`constat.cible`, posé quand le verdict tombe sur la dernière branche) et la phrase se disent la même chose.
    if (k10) {
      var texte163 = String(k10.verdict || '').replace(/[\u00a0\u202f]/g, ' ');
      var pas163 = /^Pas encore/.test(texte163), faite163 = /^Cible faite/.test(texte163);
      var jug163 = k10.cible && k10.cible.etat ? k10.cible.etat : null;
      if (pas163 || faite163) {
        // Une consigne sans ligne (« tout passe », « rejoint » : le test seul) se juge sur son test, comme `Moteur.cibleFaite`.
        var cons163 = x.consigne || null;
        var lg163 = cons163 && cons163.ligne ? cons163.ligne : (cons163 && cons163.haut ? cons163.haut : null);
        // (la ligne haute compte même à charge inconnue — « le cran au-dessus » : elle est dans `n`, comme pour `Moteur.cibleFaite`)
        var hautK163 = cons163 && cons163.ligne && cons163.haut && cons163.haut.charge !== undefined
          ? (nombre(cons163.haut.k) === null ? 1 : nombre(cons163.haut.k)) : 0;
        var n163 = cons163 ? nombre(cons163.n) : null;
        var vise163 = lg163 ? nombre(lg163.vise) : null;
        if (!lg163 || vise163 === null || n163 === null) {
          err('I163', '« ' + texte163 + ' » sans ligne ni cible chiffrée à juger');
        } else {
          var nL163 = n163 - hautK163;
          var reps163 = couvertes.filter(function (l) {
            return l.validee && l.faite && nombre(l.faite.reps) !== null && memeChargeOuVides(nombre(l.faite.charge), nombre(lg163.charge));
          }).map(function (l) { return nombre(l.faite.reps); }).slice(0, Math.max(nL163, 0));
          var complete163 = reps163.length >= nL163 && nL163 >= 1;
          var sous163 = reps163.filter(function (r) { return r < vise163; }).length;
          if (pas163) {
            if (!complete163) err('I163', '« Pas encore » alors que la ligne n\'est pas faite en entier à sa charge : ' + texte163);
            else if (sous163 === 0) err('I163', '« Pas encore » alors que toutes les séries sont à la cible (' + vise163 + ') : ' + texte163);
            var dit163 = /pour une cible de (\d+)\.$/.exec(texte163);
            if (!dit163 || Number(dit163[1]) !== vise163) err('I163', '« Pas encore » ne dit pas la cible de la ligne (' + vise163 + ') : ' + texte163);
            if (jug163 !== null && jug163 !== 'pas_encore') err('I163', '« Pas encore » mais le jugement du moteur est « ' + jug163 + ' »');
          } else {
            if (!complete163) err('I163', '« Cible faite » alors que la ligne n\'est pas faite en entier à sa charge : ' + texte163);
            else if (reps163.some(function (r) { return r < vise163 - 1; })) err('I163', '« Cible faite » alors qu\'une série est à plus d\'une rep sous la cible (' + vise163 + ') : ' + texte163);
            if (hautK163 > 0) err('I163', '« Cible faite » alors qu\'un test est proposé : ' + texte163);
            if (sous163 > 0 && !/tolérée/.test(texte163)) err('I163', '« Cible faite » sans nommer la tolérance d\'une rep : ' + texte163);
            if (jug163 !== null && jug163 !== 'faite') err('I163', '« Cible faite » mais le jugement du moteur est « ' + jug163 + ' »');
          }
        }
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
        return q && q.exercise_slug === x.slug && q.fondement && q.fondement.role !== 'recul';
      });
      // 193-1 — I7 amendé : le pari d'un recul (rôle `recul`, rang `r1`…) n'est pas un pari de la couverture ; I78 le relit.
      verifierParisDeRecul(x, err, parisSeance.filter(function (q) {
        return q && q.exercise_slug === x.slug && q.fondement && q.fondement.role === 'recul';
      }));
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
        if (!memeChargeOuVides(q.fondement.charge, l.charge)) {
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
    // Lot F, étape 1 (I243) — un message « à fond » qui cède la parole à la réaction au raté s'efface quand elle parle (`x.rate`) : une voix.
    var cedee = msg && msg.cede === true && !x.message && !!x.rate;
    if (!cedee && (x.message ? 1 : 0) !== (msg ? 1 : 0) ||
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
        // 152 : « À l'échec » (1 rep et +) reste une série de travail, mais changer son type de base vide son
        // observation (le geste et la base, `v2_050`) : une ligne passée de `travail` à `echec` n'est plus la même ligne figée.
        if (la.typeBase === 'travail' && lp.typeBase === 'echec') return;
        var nom = 'I4 — exercice ' + xa.iExo + ' (' + xa.slug + '), série ' + la.id + ' : ';
        if (!lp.figee) { erreurs.push(nom + 'figée avant, plus maintenant'); return; }
        if (lp.rang !== la.rang) erreurs.push(nom + 'rang ' + la.rang + ' → ' + lp.rang);
        if (lp.role !== la.role) erreurs.push(nom + 'rôle ' + la.role + ' → ' + lp.role);
        if (!memeChargeOuVides(lp.charge, la.charge)) erreurs.push(nom + 'charge ' + la.charge + ' → ' + lp.charge);
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
    // 149 — la règle des secondes (la tenue max, les tenues, leurs phrases) est une voix du coach.
    if (x.figure || (x.lignes || []).some(function (l) { return l && l.tenue; })) raisons.push('la règle des secondes (tenue max, tenues)');
    if (jusquaLaVoix) {
      if (x.degressive) raisons.push('une dégressive');
      if ((x.lignes || []).some(function (l) { return l.fantome && l.fantome.source; })) raisons.push('un fantôme du coach');
      if (x.chauffes) raisons.push('des chauffes calculées');
      if (x.proposition) raisons.push('une proposition de chauffes');
      if (x.escalier) raisons.push('une marche de l’escalier');
      if (x.carteLest) raisons.push('la carte du lest');
      if (x.carteMarche) raisons.push('la carte « marche suivante »');
      if (x.carteReprise) raisons.push('la carte de reprise');
      if ((x.phrases || []).length) raisons.push('une phrase du coach');
    }
    return raisons;
  }

  // ══ I52 À I55 (MOTEUR §9.17 ter, 149) — LES FIGURES EN SECONDES ═══════════════════════════════════════════════════
  //
  //   I52  une ligne de tenue du coach (la tenue max, une tenue) n'existe que sur une ÉCHELLE DE FIGURES (l'app a donné
  //        l'exercice dans `entrees.figures`, lu au catalogue), en mesure `temps`, coach actif : jamais en « Juste un
  //        carnet », en Entretenir (profil ou exercice), en Édition, ni sous « J'ai mal » ; et un exercice de figure,
  //        coach actif, première occurrence, a sa règle (jamais un coach muet par oubli) ;
  //   I53  la tenue max est la PREMIÈRE ligne de travail de l'exercice, une seule par séance ; toutes les autres
  //        lignes de travail sont des tenues ; une chauffe ou une dégressive n'est jamais une tenue ;
  //   I54  la durée visée d'une tenue = `max(2, arrondi(part × tenue max du jour))`, part 50 / 60 / 70 % selon le
  //        réglage ; pas de durée tant que la tenue max n'est pas validée ; la tenue max du jour est lue sur la SÉRIE
  //        de la séance (`entrees.seance`), pas sur ce que le plan en dit ; le fantôme de la tenue max est le max de
  //        la dernière séance ;
  //   I55  aucun pari, aucune consigne, aucune chauffe, aucune dégressive, aucun message de charge ; les phrases
  //        (« Ton max la dernière fois… », « 22 s : 2 s de plus… ») se rédigent de ce que le plan porte, une à la fois.
  function verifierLesSecondes(plan, entrees, x, err) {
    var M = Moteur(), S = Seance();
    var lignes = x.lignes || [];
    var tenues = lignes.filter(function (l) { return l && l.tenue; });
    var fg = x.figure || null;
    var donnee = entrees && entrees.figures && x.slug && Object.prototype.hasOwnProperty.call(entrees.figures, x.slug)
      ? entrees.figures[x.slug] : null;
    var silence = [];
    if (plan.intention === 'entretien') silence.push('Entretenir (profil)');
    if (plan.edition === true) silence.push('Édition');
    if (x.intention === 'entretien' || x.mode === 'entretien') silence.push('Entretenir (cet exercice)');
    if (x.sansCoach) silence.push(x.douleur ? '« J’ai mal »' : '« Sans coach cette fois »');
    // I52
    if (!fg && tenues.length) err('I52', 'une ligne de tenue sans la règle des secondes');
    if (fg) {
      if (x.mesure !== 'temps') err('I52', 'la règle des secondes sur une mesure « ' + x.mesure + ' » (une échelle de figures est en secondes)');
      if (entrees && !donnee) err('I52', 'la règle des secondes sur un exercice qui n’est pas sur une échelle de figures');
      silence.forEach(function (c) { err('I52', 'la règle des secondes en ' + c); });
      if (x.consigne) err('I52', 'la règle des secondes avec une consigne de charge');
    } else if (donnee && !silence.length && x.mesure === 'temps' && !x.sansCoach) {
      var premiereOcc = (plan.exercices || []).filter(function (q) { return q.slug === x.slug; })[0];
      var travailPlan = lignes.some(function (l) { return l && l.type === 'travail'; });
      if (premiereOcc === x && travailPlan && !x.consigne) {
        err('I52', 'une figure, coach actif, sans la règle des secondes (aucune tenue max)');
      }
    }
    if (!fg) return;
    // I53
    var travail = lignes.filter(function (l) { return l && l.type === 'travail'; });
    var maxs = lignes.filter(function (l) { return l && l.tenue === 'max'; });
    if (maxs.length !== 1) err('I53', maxs.length + ' tenues max (une seule, la première)');
    else if (!travail.length || travail[0] !== maxs[0]) err('I53', 'la tenue max n’est pas la première ligne de travail');
    travail.slice(1).forEach(function (l) {
      if (l.tenue !== 'tenue') err('I53', 'la ligne de travail ' + l.iSerie + ' n’est pas une tenue');
    });
    lignes.forEach(function (l) {
      if (l && l.type !== 'travail' && l.tenue) err('I53', 'la ligne ' + l.iSerie + ' (' + l.type + ') est une tenue');
    });
    // I54 — la tenue max du jour se lit sur la série de la séance.
    var exoS = entrees && entrees.seance && entrees.seance.exercices ? entrees.seance.exercices[x.iExo] : null;
    var sMax = maxs.length === 1 && exoS && exoS.series ? exoS.series[maxs[0].iSerie] : null;
    var maxLu = exoS ? (sMax && S.partEnBase(sMax) && nombre(sMax.duree_s) > 0 ? nombre(sMax.duree_s) : null) : fg.max;
    if (exoS && fg.max !== maxLu) err('I54', 'la tenue max du jour est ' + maxLu + ' s dans la séance, le plan dit ' + fg.max + ' s');
    if (fg.part !== M.partDeLaTenue(plan.reglage)) {
      err('I54', 'la part ' + fg.part + ' % n’est pas celle du réglage « ' + plan.reglage + ' » (' + M.partDeLaTenue(plan.reglage) + ' %)');
    }
    var attendu = maxLu === null ? null : M.dureeVisee(maxLu, plan.reglage);
    if (attendu !== null && attendu < M.TENUE_MIN_S) err('I54', 'une durée visée sous ' + M.TENUE_MIN_S + ' s');
    if (nombre(fg.vise) !== attendu) err('I54', 'la durée visée est ' + fg.vise + ' s, le calcul donne ' + attendu + ' s');
    lignes.forEach(function (l) {
      if (!l || l.tenue !== 'tenue') return;
      if (nombre(l.vise) !== attendu) err('I54', 'la tenue ' + l.iSerie + ' vise ' + l.vise + ' s, le calcul donne ' + attendu + ' s');
      var f = l.prerempli ? nombre(l.prerempli.duree_s) : null;
      if (f !== attendu) err('I54', 'le fantôme de la tenue ' + l.iSerie + ' est ' + f + ' s, la cible est ' + attendu + ' s');
    });
    var dernierLu = donnee && Array.isArray(donnee.tenues) && donnee.tenues.length
      ? nombre(donnee.tenues[donnee.tenues.length - 1]) : (donnee ? null : fg.dernier);
    if (nombre(fg.dernier) !== dernierLu) err('I54', 'le max de la dernière fois est ' + dernierLu + ' s, le plan dit ' + fg.dernier + ' s');
    if (maxs.length === 1) {
      var fm = maxs[0].prerempli ? nombre(maxs[0].prerempli.duree_s) : null;
      if (fm !== dernierLu) err('I54', 'le fantôme de la tenue max est ' + fm + ' s, le max de la dernière fois est ' + dernierLu + ' s');
    }
    // I55
    if (x.consigne) err('I55', 'une consigne de charge sur une figure');
    if ((x.paris || []).some(Boolean)) err('I55', 'un pari sur une figure');
    if (x.chauffes || x.proposition) err('I55', 'des chauffes sur une figure');
    if (x.degressive) err('I55', 'une dégressive sur une figure');
    if (x.message || x.escalier || x.carteLest || x.carteReprise) err('I55', 'une voix de charge (message, escalier, lest, reprise) sur une figure');
    if (maxs.length === 1) {
      var m1 = maxs[0];
      var dit = maxLu === null;
      if (dit && (!m1.phraseAvant || m1.phraseApres)) err('I55', 'avant la tenue max, une seule phrase : « Ton max la dernière fois… »');
      if (!dit && (!m1.phraseApres || m1.phraseAvant)) err('I55', 'après la tenue max, une seule phrase : la tenue du jour et la cible');
      var refaite = Voix().capturer(function () {
        return dit ? M.phraseDeLaTenueMax({ dernier: dernierLu })
          : M.phraseDesTenues({ max: maxLu, dernier: dernierLu, vise: attendu, dessous: fg.dessous });
      }).texte;
      var posee = dit ? m1.phraseAvant : m1.phraseApres;
      if (posee !== refaite) err('I55', 'la phrase « ' + posee + ' » n’est pas celle des faits (« ' + refaite + ' »)');
      if (!dit && maxLu < M.TENUE_SOUS_S && fg.dessous && !/marche d'en dessous/.test(String(posee))) {
        err('I55', 'sous ' + M.TENUE_SOUS_S + ' s, la phrase de la marche d’en dessous manque');
      }
      if (!dit && (maxLu >= M.TENUE_SOUS_S || !fg.dessous) && /marche d'en dessous/.test(String(posee))) {
        err('I55', 'la phrase de la marche d’en dessous sans raison (' + (maxLu >= M.TENUE_SOUS_S ? 'tenue max de ' + maxLu + ' s' : 'rang 1') + ')');
      }
    }
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
      // I202 (PR 2) — I33 généralisé : une occurrence sans coach, douleur ou non (`x.sansCoach`, LE prédicat), n'a aucune ligne du coach, aucun pari,
      // aucun message, aucune carte, aucun calage ; la demande « + Chauffe » (`x.surDemande`) reste possible. La douleur garde l'I33 ci-dessus.
      if (x.sansCoach) {
        sansCoach(x).forEach(function (r) { err('I202', 'occurrence « sans coach » : ' + r); });
        [['carteReprise', 'la carte de reprise'], ['carteLest', 'la carte du lest'], ['carteMarche', 'la carte « marche suivante »'], ['escalier', 'une marche de l’escalier'],
          ['proposition', 'une proposition de chauffes']].forEach(function (q) { if (x[q[0]]) err('I202', 'occurrence « sans coach » : ' + q[1]); });
      }
      if (x.sansCoach && x.calage) err('I202', 'occurrence « sans coach » avec un calage');
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
        // I113 (202) — la douleur répétée : à 2 séances avec douleur ou plus, le premier choix n'est jamais « Comme avant » et la phrase du
        // kiné est là, une fois ; en dessous, la carte est celle d'avant et ne parle pas du kiné.
        var compteC = entrees && entrees.nbDouleurs && Object.prototype.hasOwnProperty.call(entrees.nbDouleurs, x.slug) ? entrees.nbDouleurs[x.slug] : null;
        var kine = [x.carteReprise.titre, x.carteReprise.phrase].concat((x.carteReprise.choix || []).map(function (q) { return q.texte; }))
          .filter(function (t) { return /kiné/.test(String(t)); }).length;
        if (Moteur().douleurRepetee(compteC)) {
          if (!x.carteReprise.choix || !x.carteReprise.choix.length || x.carteReprise.choix[0].cle === 'avant') err('I113', 'la ' + compteC + 'ᵉ séance avec douleur et « Comme avant » en premier');
          if (x.carteReprise.phrase !== Moteur().phraseDouleurRepetee(compteC)) err('I113', 'la phrase du kiné ne se refait pas de la règle');
          if (kine !== 1) err('I113', 'la phrase du kiné doit être dite une seule fois (' + kine + ')');
        } else if (kine) {
          err('I113', 'la phrase du kiné avant la 2ᵉ séance avec douleur');
        }
        var textes = [x.carteReprise.titre, x.carteReprise.phrase].concat((x.carteReprise.choix || []).map(function (q) { return q.texte; }));
        if (textes.some(function (t) { return /\?/.test(String(t)); })) err('I35', 'la carte de reprise pose une question');
      }
      var r = Object.prototype.hasOwnProperty.call(reprises, x.slug) ? reprises[x.slug] : null;
      if (k && r && r.choix === 'leger' && r.repli && !memeChargeOuVides(k.ligne && k.ligne.charge, r.repli.ligne[0])) {
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
      if (x.consigne.allegee && x.consigne.allegee.routine !== null && x.consigne.allegee.routine !== tr) {
        erreurs.push(nom + 'la semaine allégée part de ' + x.consigne.allegee.routine + ' séries, la routine complète en a ' + tr);
      }
      if (x.consigne.serieDePlus && x.consigne.serieDePlus.routine !== tr) {
        erreurs.push(nom + 'la série de plus part de ' + x.consigne.serieDePlus.routine + ' séries, la routine complète en a ' + tr);
      }
      if (!x.consigne.repli && c && c.consigne) {
        var ref = M.consigneFigee(c.consigne);
        var chargeDe = function (k) { var l = k && (k.ligne || k.haut); return l ? l.charge : null; };
        if (!memeChargeOuVides(chargeDe(x.consigne), chargeDe(ref))) {
          erreurs.push(nom + 'la charge ' + chargeDe(x.consigne) + ' diffère de la consigne de la séance complète (' + chargeDe(ref) + ')');
        }
      }
    });
  }

  function verifierPoidsDuCorps(plan, erreurs, entrees) {
    if (!plan) return;
    var M = Moteur();
    var cartes = 0;
    var marches = {};
    (plan.exercices || []).forEach(function (x) {
      var nom = 'exercice ' + x.iExo + ' (' + x.slug + ')';
      var err = function (inv, texte) { erreurs.push(inv + ' — ' + nom + ' : ' + texte); };
      var k = x.consigne || null;

      // I13 — et I31, qui n'en est que le même silence pour un exercice choisi.
      var horsMesure = x.mesure === 'temps' || x.mesure === 'distance_temps' || x.mesure === 'charge_distance' || x.mesure === 'charge_temps';   // 268 : une charge portée sort du coach comme le cardio
      var causes = [];
      if (plan.intention === 'entretien') causes.push('Entretenir (profil)');
      if (plan.edition === true) causes.push('Édition');
      // 149 — SAUF une figure : I13 ne s'ouvre QUE pour les échelles de figures (la règle des secondes, I52 à I55) ;
      // gainage, étirements, cardio, sorties : rien ne change.
      if (horsMesure && !x.figure) causes.push('une mesure en ' + (x.mesure === 'temps' || x.mesure === 'charge_temps' ? 'durée' : 'distance'));
      // 119 (audit du 16/10/2026, E6) — sur une mesure en durée ou en distance, le coach ne dit RIEN, comme en
      // Entretenir : ni dégressive, ni chauffe, ni phrase (« Pas de charge de travail pour caler la dégressive. »
      // passait sous I13, qui ne regardait pas la dégressive).
      if (causes.length) {
        sansCoach(x, plan.intention === 'entretien' || horsMesure).forEach(function (r) { err('I13', causes.join(', ') + ' : ' + r); });
      }
      verifierLesSecondes(plan, entrees, x, err);
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
        // 175 (§9.17 bis) — la variante sans matériel : un autre exercice que le lest, jamais seul sur la carte.
        if (x.carteLest.variante !== undefined && (!x.carteLest.variante || !x.carteLest.variante.slug ||
            x.carteLest.variante.slug === x.carteLest.leste || x.slug === x.carteLest.variante.slug)) {
          err('I29', 'la variante de la carte du lest est absente, ou c’est le lest ou l’exercice lui-même');
        }
        if (/\?/.test(String(x.carteLest.titre) + String(x.carteLest.detail))) err('I29', 'un point d’interrogation dans la carte du lest (§20.2)');
        if (k && k.allegee) err('I29', 'la carte du lest pendant une semaine allégée');
        // I50 (§9.17 bis, 127) — la carte du lest jamais sous 8 reps sur les deux séances : le seuil est le haut de
        // la zone ET 8 (`seuilDeMarche`), lu au moteur.
        var seuil50 = M.seuilDeMarche(x.carteLest.haut);
        // 149 — en Franc, la dernière séance suffit (les deux entrées la valent) ; la phrase dit la règle (§20 bis).
        var franc50 = plan.reglage === 'franc';
        var enTete = !Array.isArray(nv) ? [] : franc50 ? nv.slice(-1) : nv;
        if (!Array.isArray(nv) || !enTete.length || !enTete.every(function (n) { return typeof n === 'number' && n >= seuil50; })) {
          err('I50', 'une carte du lest sous ' + seuil50 + ' reps (' + JSON.stringify(nv) + ')');
        }
        if (franc50 ? /deux séances/.test(String(x.carteLest.titre)) : !/deux séances de suite/.test(String(x.carteLest.titre))) {
          err('I50', 'la carte du lest ne dit pas la règle du réglage « ' + plan.reglage + ' » (' + x.carteLest.titre + ')');
        }
      }

      // I49 (§9.17 bis, 127) — la carte « marche suivante ». Relue sur ce que le plan porte : la consigne (ses deux
      // séances, sa zone), la réponse du profil, l'intention, la carte elle-même.
      var cm = x.carteMarche;
      if (cm) {
        var e49 = function (t) { err('I49', t); };
        marches[x.slug] = (marches[x.slug] || 0) + 1;
        if (cm.cibleHabilete || cm.type === 'habilete' || cm.proposable !== true || cm.type === 'lest') {
          e49('une marche qui ne se propose pas (' + cm.type + (cm.cibleHabilete ? ', une habileté' : '') + ')');
        }
        if (plan.intention === 'entretien' || x.intention === 'entretien' || x.mode === 'entretien') e49('une carte en Entretenir');
        if (x.carteLest) e49('avec la carte du lest');
        if (k && k.allegee) e49('pendant une semaine allégée');
        if (cm.secondes) {
          // 149 (MOTEUR §9.17 ter) — la carte EN SECONDES : la tenue max de chaque séance lue (Franc : la dernière)
          // atteint le seuil du catalogue ; la dernière est celle du jour, validée (la carte lit la tenue max du jour).
          var fg49 = x.figure;
          var seuilCat = entrees && entrees.figures && Object.prototype.hasOwnProperty.call(entrees.figures, x.slug)
            ? nombre(entrees.figures[x.slug].seuil) : cm.seuil;
          if (!fg49) e49('une carte en secondes sans la règle des secondes');
          if (!(nombre(seuilCat) > 0) || nombre(cm.seuil) !== nombre(seuilCat)) {
            e49('le seuil de la carte (' + cm.seuil + ' s) n’est pas celui du catalogue (' + seuilCat + ' s)');
          }
          var tn = Array.isArray(cm.tenues) ? cm.tenues.map(nombre) : [];
          var franc49s = plan.reglage === 'franc';
          var lues = tn.slice(franc49s ? -1 : -2);
          if (tn.length < (franc49s ? 1 : 2) || !lues.every(function (v) { return v !== null && v >= nombre(seuilCat); })) {
            e49('sans ' + (franc49s ? 'la dernière séance' : 'deux séances') + ' à ' + seuilCat + ' s de tenue max (' + JSON.stringify(cm.tenues) + ')');
          }
          if (!fg49 || fg49.max === null || tn[tn.length - 1] !== fg49.max) e49('la carte en secondes sans la tenue max du jour validée');
          if (nombre(cm.niveau) !== tn[tn.length - 1]) e49('la carte dit ' + cm.niveau + ' s, la dernière tenue max est ' + tn[tn.length - 1] + ' s');
          if (franc49s ? /deux séances/.test(String(cm.titre)) : !/deux séances de suite/.test(String(cm.titre))) {
            e49('la carte ne dit pas la règle du réglage « ' + plan.reglage + ' » (' + cm.titre + ')');
          }
          if (cm.proposable !== true || cm.type !== 'marche') e49('une marche qui ne se propose pas (' + cm.type + ')');
          var rep2 = plan.marcheReponses && Object.prototype.hasOwnProperty.call(plan.marcheReponses, x.slug) ? plan.marcheReponses[x.slug] : null;
          if (rep2) e49('la carte revient après une réponse (' + rep2.r + ')');
          if (/\?/.test(String(cm.titre) + String(cm.detail))) e49('un point d’interrogation dans la carte (§20.2)');
          return;
        }
        var zk = k ? M.zoneParCle(k.zone) : null;
        var ds = k && k.fondement && Array.isArray(k.fondement.deuxSeances) ? k.fondement.deuxSeances : null;
        var seuil49 = zk ? M.seuilDeMarche(zk.haut) : null;
        // 149 — en Franc, UNE séance suffit : la dernière (les deux entrées la valent) ; la garde « à la même aide »
        // n'a plus d'objet.
        var franc49 = plan.reglage === 'franc';
        var requises = !ds ? [] : franc49 ? ds.slice(-1) : ds;
        if (!ds || ds.length !== 2 || seuil49 === null || !requises.length ||
            !requises.every(function (q) { return q && typeof q.niveau === 'number' && q.niveau >= seuil49; })) {
          e49((franc49 ? 'sans la dernière séance' : 'sans deux séances') + ' au haut de la zone et à ' + M.SEUIL_MARCHE + ' reps (' + JSON.stringify(ds) + ')');
        } else if (cm.aide && !franc49 && !memeChargeOuVides(ds[0].charge, ds[1].charge)) {
          e49('deux séances à des aides différentes (' + ds[0].charge + ', ' + ds[1].charge + ')');
        }
        if (franc49 ? /deux séances/.test(String(cm.titre)) : !/deux séances de suite/.test(String(cm.titre))) {
          e49('la carte ne dit pas la règle du réglage « ' + plan.reglage + ' » (' + cm.titre + ')');
        }
        var rep = plan.marcheReponses && Object.prototype.hasOwnProperty.call(plan.marcheReponses, x.slug)
          ? plan.marcheReponses[x.slug] : null;
        if (rep && rep.r === 'oui') e49('la carte revient après « Ajouter »');
        if (rep && rep.r === 'non') {
          if (!cm.aide) e49('la carte revient après « Pas maintenant » (hors aide : une fois)');
          else if (!ds || !ds[1] || !(nombre(ds[1].charge) > nombre(rep.aide) + 1e-9)) {
            e49('la carte revient à une aide qui n’est pas plus légère que celle du « Pas maintenant » (' + rep.aide + ')');
          }
        }
        if (/\?/.test(String(cm.titre) + String(cm.detail))) e49('un point d’interrogation dans la carte (§20.2)');
        // 16/11/2026 (« Essayer la marche ») — I49 réécrit : jamais en séance douloureuse, jamais si la marche est déjà dans la
        // séance ou dans la routine, jamais avec moins de 2 séries de travail restantes. Relu sur les ENTRÉES, pas sur la carte.
        var exo49 = entrees && entrees.seance && (entrees.seance.exercices || [])[x.iExo];
        var S49 = Seance(), Mo49 = racine.THModele;
        var rest49 = exo49 ? (exo49.series || []).filter(function (q) { return !!q && !S49.partEnBase(q) && Mo49.estTravail(q); }).length : 0;
        if (rest49 < M.SERIES_ESSAI_MIN) e49('une carte avec ' + rest49 + ' série(s) de travail restante(s) : au moins ' + M.SERIES_ESSAI_MIN);
        if (exo49 && exo49.essai_marche) e49('une carte sur une marche déjà essayée');
        var nbD49 = entrees && entrees.nbDouleurs && Object.prototype.hasOwnProperty.call(entrees.nbDouleurs, x.slug) ? nombre(entrees.nbDouleurs[x.slug]) : null;
        if (x.douleur || x.carteReprise || (nbD49 !== null && nbD49 >= 2)) e49('une carte en séance douloureuse');
        var cib49 = Array.isArray(cm.cible) ? cm.cible : [cm.cible];
        if (entrees && entrees.seance && (entrees.seance.exercices || []).some(function (q) { return !!q && cib49.indexOf(q.exercise_slug) >= 0; })) {
          e49('une carte alors que la marche est déjà dans la séance');
        }
        var echs49 = (entrees && entrees.echelles) || {};
        if (Object.prototype.hasOwnProperty.call(echs49, x.slug) && echs49[x.slug] && echs49[x.slug].dansLaRoutine === true) {
          e49('une carte alors que la marche est déjà dans la routine');
        }
        if (cm.oui !== M.ouiMarche(cm.nom)) e49('le bouton n’est pas « Essayer … » (' + cm.oui + ')');
      }

      // I220 à I222 (16/11/2026, « Essayer la marche ») — sur la marche essayée.
      var exoE = entrees && entrees.seance && (entrees.seance.exercices || [])[x.iExo];
      if (exoE && exoE.essai_marche && !(entrees.seance.edition)) verifierEssaiDeMarche(x, exoE, entrees, err);
      else if (x.essaiMarche) err('I220', 'un essai de marche sur un exercice qui n’est pas essayé');

      // I30 — sur une aide : ni chauffes, ni dégressive, ni repli, ni seconde
      // charge, ni double saut.
      if (estAide(k)) {
        if (x.chauffes || x.proposition) err('I30', 'des chauffes sur une aide');
        if (x.degressive) err('I30', 'une dégressive sur une aide');
        if (k.repli || (x.escalier && x.escalier.marche === M.MARCHE_REPLI)) err('I30', 'un repli sur une aide');
        if (k.etat === 'reprise_longue' && k.ligne && !memeChargeOuVides(k.ligne.charge, k.palier)) {
          err('I30', 'un repli de reprise longue sur une aide (' + k.ligne.charge + ' pour ' + k.palier + ')');
        }
        if (x.contexte && x.contexte.haut) err('I30', 'une seconde charge sur une aide');
        var msg = x.reaction && x.reaction.message;
        if (msg && Array.isArray(msg.charges) && msg.charges.length > 1) err('I30', 'une seconde charge dans le message sur une aide');
        if (k.fondement && k.fondement.preuve) err('I30', 'un double saut sur une aide (' + k.fondement.preuve + ')');
      }
    });
    if (cartes > 1) erreurs.push('I29 — ' + cartes + ' cartes du lest dans la même séance : au plus une');
    Object.keys(marches).forEach(function (s) {
      if (marches[s] > 1) erreurs.push('I49 — ' + marches[s] + ' cartes « marche suivante » pour ' + s + ' dans la même séance : au plus une');
    });
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
      // PR 3 (B1) — la base est la donnée que la consigne porte : la routine quand elle est connue, sinon les séries de la consigne normale
      // (`a.base`) ; jamais le défaut inventé « 1 » d'une routine nulle.
      var base = a.routine !== null && a.routine !== undefined ? a.routine : (nombre(a.base) !== null ? a.base : null);
      if (a.series !== M.seriesAllegees(base)) err('une consigne à ' + a.series + ' série(s), pour 60 % de ' + base + ' (' + M.seriesAllegees(base) + ')');
      var attendu = Math.min(a.series, travail);
      if (couvertes !== attendu) {
        err(couvertes + ' ligne(s) couverte(s), pour ' + attendu + ' attendue(s) (60 % de ' + base + ')');
      }
      (x.paris || []).forEach(function (q, i) {
        if (q && !(q.fondement && q.fondement.allegee === true)) err('le pari de la série ' + i + ' ne dit pas « allégée »');
      });
    });
  }

  // ══ I79 à I81 — L'ONDULATION (193-3, MOTEUR §9.29) ═════════════════════════════
  //   · I79 — une zone de plan n'est jamais remplacée en silence : la consigne d'un exercice à zone de plan porte cette zone
  //     (ni la correction de l'exercice, ni un bloc, ni l'habitude ne la déplacent) ;
  //   · I80 — une sous-histoire vide ou périmée donne le report de zone ou « première fois », jamais un palier d'une autre
  //     zone qui se présente comme celui de la zone ;
  //   · I81 — un exercice à zone de plan est hors du bloc ce jour-là.
  var ETATS_SANS_PALIER_DE_ZONE = { nouvelle_zone: true, silence: true, bord: true, bord_garde: true, bord_recul: true, bord_vague: true,
                                    reprise_courte: true, reprise_longue: true, zero_rep: true };
  function verifierOndulation(plan, erreurs) {
    if (!plan) return;
    var enBloc = (plan.programme && plan.programme.enBloc) || {};
    (plan.exercices || []).forEach(function (x) {
      var zp = x && x.zonePlan;
      if (!zp || !x.consigne) return;
      var nom = 'exercice ' + x.iExo + ' (' + x.slug + ') : ';
      // La zone à ménager prime : la zone de la routine (Lourd) est suspendue, dite, et la consigne ne porte pas Lourd
      // (sauf une zone que la personne a choisie elle-même, I75).
      if (zp.suspendue === true) {
        if (x.consigne.zone === 'lourd' && !(x.menagee && x.menagee.choisie)) {
          erreurs.push('I79 — ' + nom + 'la zone à ménager suspend la routine (Lourd), la consigne porte pourtant Lourd');
        }
        if (enBloc[x.slug]) erreurs.push('I81 — ' + nom + 'dans un bloc en cours alors que la routine fixe sa zone');
        return;
      }
      if (x.consigne.zone !== undefined && x.consigne.zone !== null && x.consigne.zone !== zp.zone) {
        erreurs.push('I79 — ' + nom + 'la routine fixe ' + zp.zone + ', la consigne porte ' + x.consigne.zone);
      }
      if (zp.mode === 'premiere' && zp.zoneAvant && !ETATS_SANS_PALIER_DE_ZONE[x.consigne.etat]) {
        erreurs.push('I80 — ' + nom + 'première fois en ' + zp.zone + ' mais l\u2019état est « ' + x.consigne.etat + ' » : un palier d\u2019une autre zone');
      }
      if (enBloc[x.slug]) erreurs.push('I81 — ' + nom + 'dans un bloc en cours alors que la routine fixe sa zone');
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
  //   · I37 — un bloc porte une zone connue (Lourd, Mix, Hypertrophie) ; la restriction par objectif (Hypertrophie seulement en Muscle ou Les deux, `Moteur.zonesDeBloc`) vaut pour la proposition et la création, pas pour un bloc déjà lancé (221) ;
  //   · I114 (221) — un bloc Hypertrophie : le soulevé de terre est posé en Mix (jamais 8-10) ; une grosse série gardée n'existe que dans
  //     un bloc Hypertrophie, et ne se pose ni au soulevé, ni hors d'une barre ;
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
    var familles = pr.familles || {};
    blocs.forEach(function (b) {
      if (!b) return;
      if (b.id) parId[b.id] = b;
      if (M.ZONES_DE_BLOC.indexOf(b.zone) < 0) erreurs.push('I37 — le bloc ' + (b.id || '?') + ' porte la zone « ' + b.zone + ' »');
      // 221 — la restriction par objectif vaut pour ce qui est PROPOSÉ et pour la création/le changement de zone (écran, écriture), pas pour
      // un bloc déjà lancé : si l'objectif change pendant un bloc Hypertrophie, le bloc va à son terme (MOTEUR §19.2, amendement 221).
      // I114 — la grosse série gardée n'existe que dans un bloc Hypertrophie.
      if (b.grosse_serie === true && b.zone !== 'hypertrophie') erreurs.push('I114 — le bloc ' + (b.id || '?') + ' garde une grosse série sans être en Hypertrophie');
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
      // 221 — la ligne d'un bloc Hypertrophie est celle de `structureDeBloc` (le soulevé en Mix, jamais 8-10), I114.
      var attendue = b.zone === 'hypertrophie' && Object.prototype.hasOwnProperty.call(familles, l.exercise_slug)
        ? M.structureDeBloc(b, familles[l.exercise_slug]).zone : b.zone;
      // Une ligne posée au début du bloc, ou — en cours de bloc — par un ajustement (221) : même zone que la sienne.
      if (minuit !== null && (t === minuit || (b.statut === 'en_cours' && t > minuit && t === new Date(b.modifie_a).getTime() && l.zone === attendue))) {
        if (M.ZONES_DE_BLOC.indexOf(l.zone) < 0) erreurs.push('I37 — ' + dit + ' pose « ' + l.zone + ' »');
        else if (b.zone === 'hypertrophie' && Object.prototype.hasOwnProperty.call(familles, l.exercise_slug) && attendue !== l.zone) {
          erreurs.push('I114 — ' + dit + ' : « ' + l.zone + ' » dans un bloc Hypertrophie (attendu « ' + attendue + ' »)');
        }
        else if (b.zone !== 'hypertrophie' && l.zone !== b.zone) erreurs.push('I36 — ' + dit + ' : « ' + l.zone + ' » pour un bloc ' + b.zone);
        else if (b.zone === 'hypertrophie' && !Object.prototype.hasOwnProperty.call(familles, l.exercise_slug) && l.zone !== b.zone && l.zone !== 'mix') {
          erreurs.push('I36 — ' + dit + ' : « ' + l.zone + ' » pour un bloc ' + b.zone);
        }
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
            ' jours la décharge finie le ' + c.fin);
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
                          'regle|degressive.vise': true, 'regle|degressive': true, 'regle|degressive.enleve': true, 'fait_passe|seance': true, 'regle|constante': true,
                          // Les nombres de séries de chaque segment (PR 7) : « sur les 2
                          // dernières » et « sur les 3 d'avant » disent deux segments.
                          'regle|series': true,
                          // 193-1 — l'écart d'aujourd'hui et l'écart d'avant ; les reps de la fois d'avant, de la cible, du jour.
                          'regle|recul.ecart': true, 'regle|recul.reps': true, 'regle|recul.marge': true,
                          // 236 — les chiffres de la réaction après un raté (reps, garde, charges) : plusieurs faits distincts par clé.
                          'regle|rate.reps': true, 'regle|rate.garde': true, 'regle|rate.charge': true,
                          // 251 — la porte du cran : les reps de la série fermante, du cran et de la table (plusieurs faits sous une clé).
                          'regle|porte.reps': true,
                          // 20/11/2026 — le repos conseillé : reps, garde, séries, durée et membres, un fait distinct par clé.
                          'regle|repos.reps': true, 'regle|repos.garde': true, 'regle|repos.series': true, 'regle|repos.duree': true, 'regle|repos.membres': true };

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
      if (q.charge === null ? nombre(src.charge) !== null : !memeChargeOuVides(q.charge, src.charge)) return 'charge';
    }
    if (q.reps !== undefined && Array.isArray(src.reps) && !memesReps(q.reps, src.reps)) return 'reps';
    if (q.date !== undefined && src.date && !memeJour(q.date, src.date)) return 'date';
    return null;
  }

  // Une citation du jour contre les séries faites à une charge : la charge, et
  // des reps qui sont TOUTES parmi celles de cette charge (un multi-ensemble).
  function dansLeJour(q, g) {
    if (q.objet && q.objet.champ === 'charge') return q.valeur !== undefined && memeChargeOuVides(q.valeur, g.charge);
    if (q.charge !== undefined && !(q.charge !== null && memeChargeOuVides(q.charge, g.charge))) return false;
    var reste = g.reps.map(nombre);
    var dites = Array.isArray(q.reps) ? q.reps : (q.valeur !== undefined ? [q.valeur] : []);
    return dites.every(function (r) {
      var i = reste.indexOf(nombre(r));
      if (i < 0) return false;
      reste.splice(i, 1);
      return true;
    });
  }

  // 236 — tous les chiffres que les phrases du coach après un raté écrivent pour cet exercice (réaction, forme du jour, paris).
  function chiffresDuRate(x) {
    var out = { reps: [], garde: [], charge: [] };
    [x.rate, x.carteForme, x.parisRates && x.parisRates.carte ? x.parisRates : null].forEach(function (q) {
      if (!q || !q.chiffres) return;
      out.reps = out.reps.concat(q.chiffres.reps || []);
      out.garde = out.garde.concat(q.chiffres.garde || []);
      out.charge = out.charge.concat(q.chiffres.charge || []);
    });
    return out;
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
      var g = parCharge.filter(function (x) { return memeChargeOuVides(x.charge, l.faite.charge); })[0];
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
      var g = seanceParCharge.filter(function (x) { return memeChargeOuVides(x.charge, c); })[0];
      if (!g) seanceParCharge.push(g = { charge: c, reps: [] });
      g.reps.push(sr.reps);
    });
    if (f.depasse !== undefined && f.depasse !== null) fait.depasse = { valeur: f.depasse };
    if (f.palierPrecedent !== undefined && f.palierPrecedent !== null) fait.reste = { charge: f.palierPrecedent };
    if (f.serieAFond) fait.a_fond = { charge: f.serieAFond.charge, reps: [f.serieAFond.reps] };
    // 154 (§9.26) — l'effort visé : la série (charge × reps), la réserve notée, la visée, la charge gardée ou du test.
    if (f.effortVise) {
      fait.effort_vise = { charge: f.effortVise.charge, reps: [f.effortVise.reps] };
      fait['effort_vise.reserve'] = { valeur: f.effortVise.reserve };
      fait['effort_vise.visee'] = { valeur: f.effortVise.visee };
      fait['effort_vise.charge'] = { charge: f.effortVise.charge };
      if (k.haut && k.haut.charge !== null && k.haut.charge !== undefined) fait['effort_vise.haut'] = { charge: k.haut.charge, reps: [k.haut.vise === undefined ? null : k.haut.vise] };
    }
    // 174 (§9.1.2) — la règle de bord qui recule : la séance d'avant (charge × reps faites), la visée, la réserve, la vague.
    if (f.bord) {
      fait.bord = { charge: f.bord.charge, reps: [f.bord.faites !== undefined ? f.bord.faites : f.bord.reps] };
      fait['bord.charge'] = { charge: f.bord.charge };
      if (f.bord.visees !== undefined) fait['bord.visees'] = { valeur: f.bord.visees };
      if (f.bord.vise !== undefined) fait['bord.vise'] = { valeur: f.bord.vise };
      if (f.bord.reserve !== undefined) fait['bord.reserve'] = { valeur: f.bord.reserve };
      if (f.bord.depuis !== undefined) fait['bord.depuis'] = { valeur: f.bord.depuis };
      if (f.bord.vers !== undefined) fait['bord.vers'] = { charge: f.bord.vers };
    }
    // PR 2 (§9.42) — le zéro rep : la charge échouée (0 rep), le nombre de séries, la charge d'où l'on repart, ses reps.
    if (f.zeroRep) {
      fait.zero_rep = { charge: f.zeroRep.charge, reps: [0] };
      fait['zero_rep.charge'] = { charge: f.zeroRep.charge };
      if (f.zeroRep.vers !== undefined) fait['zero_rep.vers'] = { charge: f.zeroRep.vers };
      if (f.zeroRep.visees !== undefined) fait['zero_rep.visees'] = { valeur: f.zeroRep.visees };
    }
    // R2 (jour sans) — le zéro d'une séance d'avant et ce qui était tenu : des faits datés (jamais écrits autrement que cités, I26).
    var js = f.zeroRep && f.zeroRep.jourSans ? { zero: { charge: f.zeroRep.charge, date: f.zeroRep.jourSans.date, vers: f.zeroRep.vers, tenue: f.zeroRep.jourSans.tenue } }
      : f.jourSans && f.jourSans.retour === true ? { zero: { charge: f.jourSans.charge, date: f.jourSans.date }, tenue: f.jourSans.tenue } : null;
    if (js) {
      fait['jour_sans.zero'] = { charge: js.zero.charge, reps: [0], date: js.zero.date || null };
      var tn = js.zero.tenue || js.tenue || null;
      if (tn) fait['jour_sans.tenue'] = { charge: tn.charge, reps: [tn.reps], date: tn.date || null };
      if (js.zero.vers !== undefined) fait['jour_sans.vers'] = { charge: js.zero.vers };
    }
    // PR 4b (R-A) — la réaction au zéro : le « 0 » de « … est resté à 0 rep » est un fait de la série (I26).
    if (x.rate && x.rate.niveau === 'zero') fait.rate_zero = { charge: x.rate.zero, reps: [0] };
    // PR 4b (R-A) — le plafond après un zéro : la charge restée à 0 rep (jamais écrite autrement que citée, I26).
    if (f.plafondZero && f.plafondZero.mord === true) {
      fait.plafond_zero = { charge: f.plafondZero.charge, reps: [0] };
      fait['plafond_zero.charge'] = { charge: f.plafondZero.charge };
    }
    // 174 (3/3) — la zone 3-5 proposée sous 3 reps : le record (charge × reps) et le compte long.
    var eb = x.escalier && x.escalier.bord;
    if (eb) {
      fait['bord.record'] = { charge: eb.charge, reps: [eb.reps] };
      fait['bord.long'] = { valeur: eb.total };
    }
    if (f.horsPalier) fait.hors_palier = { charge: f.horsPalier.charge, reps: [f.horsPalier.reps] };
    var ed = x.escalier && x.escalier.depassement;
    if (ed) {
      fait.depassement = { charge: ed.charge, reps: [ed.niveau] };
      fait['depassement.n'] = { valeur: ed.n };
    }
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
    (x.lignes || []).forEach(function (l) {
      if (l.chauffe && l.chauffe.charge !== null) chauffes.push(l.chauffe.charge);
      // 20/11/2026 — les reps dites des lignes, et la chauffe d'avant d'une chauffe ajoutée (« entre 120 et 135 kg »).
      if (l.chauffe && l.chauffe.repsDites !== null && l.chauffe.repsDites !== undefined) chauffesReps.push(l.chauffe.repsDites);
      if (l.chauffe && Array.isArray(l.chauffe.entre)) chauffes.push(l.chauffe.entre[0]);
    });
    var chauffesParts = [];
    [x.proposition, x.surDemande].forEach(function (pp) {
      if (!pp) return;
      (pp.lignes || []).forEach(function (q) { if (q[0] !== null) chauffes.push(q[0]); chauffesReps.push(q[1]); });
      var dern = (pp.lignes || []).length ? nombre(pp.lignes[pp.lignes.length - 1][0]) : null, rf = nombre(pp.reference);
      if (dern !== null && rf !== null && rf > 0) chauffesParts.push(Math.round(100 * dern / rf));
    });
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
    if (k.alleger) { nbSeries.push(k.alleger.series); nbSeries.push(k.alleger.routine); }
    if (k.serieDeMoins) { nbSeries.push(k.serieDeMoins.series); nbSeries.push(k.serieDeMoins.routine); }
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
      // 20/11/2026 — la part de la dernière chauffe proposée, recalculée ici depuis ses charges (jamais lue sur la phrase).
      'chauffe.part': { valeurs: chauffesParts },
      reference: x.chauffesReference ? { charge: x.chauffesReference.charge } : x.chauffes ? { charge: x.chauffes.reference } : x.proposition && x.proposition.reference !== null ? { charge: x.proposition.reference } : null,
      // 15/11/2026 — « Le plan disait 90 kg » : la charge de la consigne, quand la montée est calée sur la saisie.
      'reference.plan': x.chauffesReference && x.chauffesReference.plan !== null && x.chauffesReference.plan !== undefined ? { charge: x.chauffesReference.plan } : null,
      degressive: x.degressive ? (x.degressivesPlus
        ? { charge: undefined, valeurs: [x.degressive].concat(x.degressivesPlus).map(function (q) { return q.charge; }).filter(function (v) { return v !== null && v !== undefined; }) }
        : { charge: x.degressive.charge }) : null,
      'degressive.enleve': x.degressive && x.degressive.enleve !== undefined && !x.degressivesPlus ? { charge: x.degressive.enleve }
        : x.degressivesPlus ? { charge: undefined, valeurs: [x.degressive].concat(x.degressivesPlus).map(function (q) { return q.enleve; }).filter(function (v) { return v !== null && v !== undefined; }) } : null,
      'degressive.arret': { valeurs: (x.degressivesPlus || []).map(function (q) { return q.premiereReps; }).filter(function (v) { return v !== null && v !== undefined; }) },
      // Une constante du moteur écrite dans la phrase (10 %, 3 reps, 15 %) :
      // déclarée, elle n'a pas d'autre source qu'elle-même.
      constante: { libre: true },
      'zone.bas+1': z ? { valeur: z.bas + 1 } : null,
      'habitude.seances': f.habitude ? { valeur: f.habitude.seances } : null,
      'habitude.valeur': f.habitude ? { valeur: f.habitude.valeur } : null,
      seuil: f.seuil === undefined ? null : { valeur: f.seuil },
      cible: f.cible === undefined ? null : { valeur: f.cible },
      'allegee.series': k.allegee ? { valeur: k.allegee.series } : null,
      'allegee.routine': k.allegee && k.allegee.routine !== null && k.allegee.routine !== undefined ? { valeur: k.allegee.routine } : null,
      // « Les mots disent vrai » PR 1 — la cible d'avant la décharge (la consigne normale), dite au « Pourquoi » : « 52,5 kg × 6 au lieu de 52,5 kg × 8 ».
      // Quand la phrase ne cite que les reps (poids du corps : « × 8 » ; charge inconnue : « 5 reps »), la règle est une valeur seule.
      'allegee.avant': k.allegee && k.allegee.avant
        ? (nombre(k.allegee.avant.charge) === null || (nombre(k.allegee.avant.charge) === 0 && k.ligne && nombre(k.ligne.charge) === 0)
          ? { valeur: k.allegee.avant.vise } : { charge: k.allegee.avant.charge, reps: [k.allegee.avant.vise] }) : null,
      // PR 3 — la ligne de la décharge quand sa charge est inconnue : « 3 reps au lieu de 5 reps » (jamais « le cran au-dessus » dans une décharge).
      'allegee.ligne': k.allegee && k.ligne ? { valeur: k.ligne.vise } : null,
      // PR 5b-1 — la date du régime à venir dite par l'annonce (« Ta décharge commence le 16 nov. ») : le jour que le plan porte (`constat.regime.debut`) ; I169 le recalcule depuis les entrées.
      'regime.debut': x.constat && x.constat.regime ? { date: x.constat.regime.debut } : null,
      // « Les mots disent vrai » PR 2 (I163) — le test proposé et laissé de côté (« Le test à 127,5 kg n'a pas été fait ») : la charge de la ligne haute de la consigne.
      'cible.test_non_fait': k.haut && k.haut.charge !== null && k.haut.charge !== undefined ? { charge: k.haut.charge } : null,
      // 165 — « Décharge, semaine k sur N » : le rang de la semaine dans le bloc.
      'bloc.semaine': k.allegee && k.allegee.decharge && nombre(k.allegee.semaine) !== null ? { valeur: k.allegee.semaine } : null,
      'bloc.semaines': k.allegee && k.allegee.decharge && nombre(k.allegee.semaines) !== null ? { valeur: k.allegee.semaines } : null,
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
      'lest.saut': { charge: M.SAUT_LEST },
      // §9.17 bis (127) — la carte « marche suivante » : le niveau et l'aide de la dernière des deux séances.
      'marche.niveau': x.carteMarche ? { valeur: x.carteMarche.niveau } : null,
      'marche.aide': x.carteMarche ? { charge: x.carteMarche.charge } : null,
      // 175 — le gros cran : le pourcentage, les reps d'écart et le plancher que le moteur seul écrit.
      'cran.de': f.cranGros ? { valeur: f.cranGros.de } : null,
      'cran.vers': f.cranGros ? { charge: f.cranGros.vers } : null,
      'cran.pct': f.cranGros ? { valeur: f.cranGros.pct } : null,
      'cran.reps': f.cranGros ? { valeur: f.cranGros.reps } : null,
      'cran.plancher': f.cranGros ? { valeur: f.cranGros.plancher } : null,
      // 193-1 (§9.28) — les reculs : la charge du recul, la grosse série, l'écart (d'aujourd'hui et d'avant, en %), les reps.
      recul: x.reculs && x.reculs.charge !== null && x.reculs.charge !== undefined ? { charge: x.reculs.charge } : null,
      'recul.grosse': x.reculs && x.reculs.grosse !== null ? { charge: x.reculs.grosse } : null,
      'recul.ecart': x.reculs ? { valeurs: [x.reculs.ecart, x.reculs.reel].filter(function (v) { return nombre(v) !== null; })
        .map(function (v) { return Math.round(v * 1000) / 10; }) } : null,
      'recul.reps': x.reculs ? { valeurs: (x.reculs.reps || []).concat(x.reculs.faites || [], [x.reculs.cible], x.reculs.mode === 'max_du_jour'
        ? [x.reculs.grosseReps, x.reculs.vise].concat(x.reculs.derniere ? [x.reculs.derniere.faites, x.reculs.derniere.prevision === null ? null : x.reculs.derniere.faites - x.reculs.derniere.prevision, x.reculs.derniere.cible] : [])
        : (x.reculs.depart === true && x.reculs.deduit === true ? [x.reculs.grosseReps, x.reculs.vise] : [])).filter(function (v) { return nombre(v) !== null; }) } : null,
      // 193-5 — le recul sur le max du jour : le max (entier), son pourcentage, la marge de la grosse série et celle du recul (2), la correction, la dernière série.
      'recul.max': x.reculs && x.reculs.mode === 'max_du_jour' ? { charge: x.reculs.max_du_jour } : null,
      'recul.pct': x.reculs && x.reculs.mode === 'max_du_jour' ? { valeur: x.reculs.pct } : null,
      'recul.marge': x.reculs && x.reculs.mode === 'max_du_jour' ? { valeurs: [x.reculs.marge, Moteur().RECUL_MARGE_VISEE] }
        : (x.reculs && x.reculs.depart === true && x.reculs.deduit === true ? { valeurs: [x.reculs.margeGrosse, Moteur().RECUL_MARGE_VISEE] } : null),
      // 266 — le plancher du départ de l'écart (5 %), cité quand le départ est tiré de la table.
      'recul.depart': x.reculs && x.reculs.depart === true && x.reculs.deduit === true ? { valeur: Math.round(Moteur().RECUL_ECART_MIN * 1000) / 10 } : null,
      'recul.correction': x.reculs && x.reculs.mode === 'max_du_jour' ? { valeur: Math.round(Math.abs(x.reculs.correction) * 1000) / 10 } : null,
      'recul.derniere': x.reculs && x.reculs.derniere ? { charge: x.reculs.derniere.charge } : null,
      // 236 — le coach après un raté : les reps, la garde et les charges dits par la réaction, la carte de la forme du jour, la carte des paris.
      'rate.reps': chiffresDuRate(x).reps.length ? { valeurs: chiffresDuRate(x).reps } : null,
      'rate.garde': chiffresDuRate(x).garde.length ? { valeurs: chiffresDuRate(x).garde } : null,
      'rate.charge': chiffresDuRate(x).charge.length ? { charge: undefined, valeurs: chiffresDuRate(x).charge } : null,
      // 251 — la porte du cran : le cran (charge), la série qui a fermé la porte (charge), la force du jour (charge), les reps (série, cran, table), la zone.
      'porte.cran': x.porteDuCran && x.porteDuCran.cran ? { charge: x.porteDuCran.cran.charge } : null,
      'porte.travail': x.porteDuCran && x.porteDuCran.serie ? { charge: x.porteDuCran.serie.charge } : null,
      'porte.force': x.porteDuCran && x.porteDuCran.force !== null && x.porteDuCran.force !== undefined ? { charge: x.porteDuCran.force } : null,
      'porte.reps': x.porteDuCran ? { valeurs: [x.porteDuCran.serie ? x.porteDuCran.serie.reps : null, x.porteDuCran.cran ? x.porteDuCran.cran.vise : null,
        x.porteDuCran.repsAuCran].filter(function (v) { return nombre(v) !== null; }) } : null,
      'porte.bas': x.porteDuCran && x.porteDuCran.zone ? { valeur: x.porteDuCran.zone.bas } : null,
      'porte.haut': x.porteDuCran && x.porteDuCran.zone ? { valeur: x.porteDuCran.zone.haut } : null,
      // 193-4 — la semaine de mesure : la charge proposée (l'essai ou la série), le rang de l'essai, les reps, les pourcentages, le max, la réserve, le pari.
      test: x.semaineDeTest && x.semaineDeTest.charge !== null && x.semaineDeTest.charge !== undefined ? { charge: x.semaineDeTest.charge } : null,
      'test.rang': x.semaineDeTest && x.semaineDeTest.prochain ? { valeur: x.semaineDeTest.prochain.rang } : null,
      'test.reps': x.semaineDeTest && x.semaineDeTest.prochain ? { valeur: x.semaineDeTest.prochain.reps } : null,
      'test.visee_bas': x.semaineDeTest && x.semaineDeTest.serie ? { valeur: x.semaineDeTest.serie.visee[0] } : null,
      'test.visee_haut': x.semaineDeTest && x.semaineDeTest.serie ? { valeur: x.semaineDeTest.serie.visee[1] } : null,
      'test.plafond': x.semaineDeTest && x.semaineDeTest.serie ? { valeur: x.semaineDeTest.serie.plafond } : null,
      // 20/11/2026 (MOTEUR §9.52, I266) — le repos conseillé : les chiffres de sa phrase (reps visées, garde des lignes, séries, durée, membres du tour). Leur arithmétique
      // est relue par `verifierReposConseille` (I256 à I266), jamais par la source ici : ils ne sont citables que s'ils sont écrits au plan.
      'repos.reps': x.reposConseille && x.reposConseille.reps !== null ? { valeur: x.reposConseille.reps } : null,
      'repos.garde': x.reposConseille && x.reposConseille.garde !== null ? { valeur: x.reposConseille.garde } : null,
      'repos.series': x.reposConseille && x.reposConseille.series !== null ? { valeur: x.reposConseille.series } : null,
      'repos.duree': x.reposConseille ? { valeur: x.reposConseille.s } : null,
      'repos.membres': x.reposConseille && x.reposConseille.membres !== null ? { valeur: x.reposConseille.membres } : null,
      'test.pct1': x.semaineDeTest && x.semaineDeTest.testee ? { valeur: Moteur().TEST_ESSAI_1 } : null,
      'test.pct2': x.semaineDeTest && x.semaineDeTest.testee ? { valeur: Moteur().TEST_ESSAI_2 } : null,
      'test.pct_serie': x.semaineDeTest && x.semaineDeTest.serie ? { valeur: x.semaineDeTest.serie.pct } : null,
      'test.max': x.semaineDeTest && x.semaineDeTest.max !== null && x.semaineDeTest.max !== undefined ? { charge: x.semaineDeTest.max } : null,
      'test.reserve': x.semaineDeTest && x.semaineDeTest.prochain ? { valeur: x.semaineDeTest.prochain.reserve }
        : x.semaineDeTest && x.semaineDeTest.serie ? { valeur: x.semaineDeTest.serie.reserve } : null,
      'test.pari': x.semaineDeTest && x.semaineDeTest.pari ? { charge: x.semaineDeTest.pari.valeur_predite } : null,
      // 19/11/2026 — « Squat : pas d'essai cette semaine » : la série d'où vient la force estimée (charge × reps) et son jour.
      'test.source': x.semaineDeTest && x.semaineDeTest.pasDEssai && x.semaineDeTest.pasDEssai.source
        ? { charge: x.semaineDeTest.pasDEssai.source.charge, reps: [x.semaineDeTest.pasDEssai.source.reps] } : null,
      'test.source_le': x.semaineDeTest && x.semaineDeTest.pasDEssai && x.semaineDeTest.pasDEssai.source
        ? { date: x.semaineDeTest.pasDEssai.source.date } : null
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
    echelle.forEach(function (s, i) { if (memeChargeOuVides(nombre(s.charge_kg), nombre(f.palierPrecedent))) ou.push(i); });
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
        !memeChargeOuVides(a.charge, b.charge)) return false;
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
          ? Moteur().bandeauDecharge(plan.allegee.semaine, plan.allegee.semaines, plan.allegee.marge)
          : Moteur().bandeauAllegee(plan.allegee.fin, plan.allegee.marge);
      }, function (t) { return t === b; });
    }
    if (plan && plan.carte) {
      var ca = plan.carte;
      if (ca.source === Moteur().SOURCE_BAISSE && ca.fait) {
        // 189 — la carte de baisse : titre, fait et détail se refont de ce que la carte porte.
        refaite('carte.titre', ca.titre, function () { return Moteur().titreBaisse(); }, function (t) { return t === ca.titre; });
        refaite('carte.phrase', ca.phrase, function () { return Moteur().phraseBaisse(ca.fait.noms, ca.fait.moyenne, ca.fait.reserve, ca.fait.poids); },
                function (t) { return t === ca.phrase; });
        refaite('carte.detail', ca.detail, function () { return Moteur().detailBaisse(ca.fait.seche); },
                function (t) { return t === ca.detail; });
      } else {
        if (ca.phrase) {
          refaite('carte.phrase', ca.phrase, function () { return Moteur().phraseCarte(ca.cites || []); },
                  function (t) { return queue(t) === queue(ca.phrase); });
        }
        if (ca.detail) {
          refaite('carte.detail', ca.detail, function () { return Moteur().detailCarte(); },
                  function (t) { return t === ca.detail; });
        }
      }
    }
    // 189 — le bandeau de la « série de moins » se refait de la règle.
    if (plan && plan.serieDeMoins && plan.serieDeMoins.bandeau) {
      var bm = plan.serieDeMoins.bandeau;
      refaite('serieDeMoins.bandeau', bm, function () { return Moteur().bandeauSerieDeMoins(); }, function (t) { return t === bm; });
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
    verifierOndulation(plan, erreurs);
    verifierMarches(plan, erreurs);
    verifierPoidsDuCorps(plan, erreurs, entrees);
    if (entrees && entrees.raccourci) verifierRaccourci(plan, entrees, erreurs);
    verifierDouleur(plan, entrees, erreurs);
    verifierReserve(plan, entrees, erreurs);
    verifierCalage(plan, entrees, erreurs);
    verifierZoneMenagee(plan, entrees, erreurs);
    verifierBlocHypertrophie(plan, erreurs);
    verifierRate(plan, entrees, erreurs);
    verifierPorte(plan, entrees, erreurs);
    verifierReportDeZone(plan, erreurs, entrees);
    verifierRepriseAuBasDeZone(plan, entrees, erreurs);
    verifierRestPause(plan, erreurs);
    verifierSansRestPause(plan, erreurs);
    verifierBaisseAttendue(plan, erreurs);
    verifierEffortVise(plan, entrees, erreurs);
    verifierCapacite(plan, entrees, erreurs);
    verifierPlancherDeBarre(plan, entrees, erreurs);
    verifierMonotonieAFond(plan, entrees, erreurs);
    verifierBord(plan, erreurs);
    verifierZeroRep(plan, entrees, erreurs);
    verifierJourSans(plan, entrees, erreurs);
    verifierDecharge(plan, erreurs);
    verifierTete(plan, erreurs);
    verifierVerbe(plan, erreurs);
    verifierChutes(plan, entrees, erreurs);
    verifierAnnonce(plan, erreurs);
    verifierRegimes(plan, entrees, erreurs);
    verifierSuiteAujourdhui(plan, erreurs);
    verifierRoutinesPretes(plan, entrees, erreurs);
    verifierVoixDuZero(plan, entrees, erreurs);
    verifierLeviers(plan, erreurs);
    verifierHorsCalcul(plan, entrees, erreurs);
    verifierReposLong(plan, erreurs);
    verifierReposConseille(plan, entrees, erreurs);
    verifierDepassement(plan, erreurs);
    verifierDessous(plan, erreurs);
    verifierGrosCran(plan, erreurs);
    verifierAlleger(plan, erreurs);
    verifierFatigue(plan, entrees, erreurs);
    verifierSansAuMax(plan, erreurs);
    verifierMobilite(plan, entrees, erreurs);
    verifierVeilleActivite(plan, entrees, erreurs);
    verifierVeilleReprise(plan, entrees, erreurs);
    verifierVeilleLegere(plan, entrees, erreurs);
    verifierChauffesProposees(plan, entrees, erreurs);
    verifierLaMontee(plan, entrees, erreurs);
    verifierSemaineDeTest(plan, erreurs, entrees);
    verifierCalisthenie(plan, erreurs);
    verifierForme(plan, entrees, erreurs);
    verifierApprochee(plan, erreurs);
    verifierApresLaDecharge(plan, entrees, erreurs);
    verifierSalle(plan, erreurs);
    verifierEscalierSalle(plan, entrees, erreurs);
    verifierElastiques(plan, entrees, erreurs);
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

  // I72 à I74 (MOTEUR §9.21 bis, 187) — LE CALAGE DE LA PREMIÈRE SÉANCE.
  //   I72  il ne s'ouvre que sur une consigne « première fois » sans charge de départ (ni historique, ni routine qui en porte),
  //        pour une charge × reps ; jamais en Édition ni en « Juste un carnet » ;
  //   I73  il ne propose jamais plus que le plafond : au plus +15 % (+10 % pour un débutant ou 65 ans et plus, 191) de la série qu'on vient de faire,
  //        sauf la première montée depuis le plus petit cran (deux crans au plus) ; jamais moins que la série d'avant ; trois
  //        séries au plus, et plus aucune proposition après la troisième ;
  //   I74  une proposition n'est JAMAIS une série : elle porte sur une ligne non validée, une seule par exercice, et la série
  //        qu'elle porte n'a ni charge ni reps écrites par le plan.
  // Les nombres sont lus tels que le plan les porte : cette garde ne rappelle pas la règle, elle la contrôle.
  var I73_CRANS_DEPUIS_LE_PLANCHER = 2;
  function verifierCalage(plan, entrees, erreurs) {
    var exos = entrees && entrees.seance && entrees.seance.exercices ? entrees.seance.exercices : null;
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.calage;
      var nom = ' — exercice ' + i + ' (' + (x && x.slug) + ') : ';
      if (!k) return;
      var c = x.consigne || {};
      if (c.etat !== 'silence' || c.raison !== 'premiere_fois') erreurs.push('I72' + nom + 'un calage sans « première fois »');
      if (plan.edition) erreurs.push('I72' + nom + 'un calage en Édition');
      if (plan.intention === 'entretien' || x.intention === 'entretien') erreurs.push('I72' + nom + 'un calage en « Juste un carnet »');
      if (x.mesure && x.mesure !== 'charge_reps') erreurs.push('I72' + nom + 'un calage sur une mesure sans charge');
      if (c.fondement && c.fondement.departRoutine) erreurs.push('I72' + nom + 'un calage malgré une charge de départ');
      // Le nombre de séries vient de la séance vivante (routine, personne, coach) : I73 ne le compare jamais à un nombre fixe ; le
      // calage ne crée, n'ajoute ni ne retire aucune série.
      var s = k.suivante;
      // 26/11/2026 (lot 5 n° 6, extension d'I74) — la réponse en ligne : une seule ligne, une série de travail non validée, tant que la question est posée ; jamais avec une proposition.
      var reponses = (x.lignes || []).filter(function (l) { return l.reponseCalage === true; });
      if (reponses.length > 1) erreurs.push('I74' + nom + 'la réponse du calage sur ' + reponses.length + ' lignes');
      reponses.forEach(function (l) {
        if (!k.saisieEnLigne || !k.demandeHabituelle) erreurs.push('I74' + nom + 'une ligne qui sert de réponse sans question posée');
        if (l.validee || l.type === 'echauffement') erreurs.push('I74' + nom + 'la réponse du calage sur une ligne validée ou une chauffe');
        if (s || l.calage === true) erreurs.push('I74' + nom + 'une réponse et une proposition en même temps');
      });
      if (k.saisieEnLigne && reponses.length !== 1) erreurs.push('I74' + nom + 'la question posée en ligne sans ligne qui réponde');
      // 191 — la prudence de montée du plan (âge et ancienneté, gelés avec la séance) : le plafond du calage n'est jamais plus haut
      // que le sien, et « un cran à la fois » ne laisse passer ni deux crans ni trois (sauf les approches, qui ne sont pas une montée).
      var pru = plan.prudence || null;
      if (pru && nombre(k.plafond) !== null && k.plafond > pru.plafond + 1e-9) {
        erreurs.push('I73' + nom + 'un plafond de ' + Math.round(k.plafond * 100) + ' %, la prudence de montée dit ' + Math.round(pru.plafond * 100) + ' %');
      }
      if (pru && pru.unCran && s && s.crans > 1 && s.pourquoi !== 'en_montant') erreurs.push('I73' + nom + s.crans + ' crans, un seul à la fois');
      if (s) {
        if (s.role !== 'approche' && s.reps !== k.n) erreurs.push('I73' + nom + 'des reps proposées différentes des ' + k.n + ' de la routine');
        if (s.depuis !== undefined && s.depuis !== null) {
          // PR 3 (B5-03) — sauf la proposition BORNÉE : une charge restée à 0 rep ne se reprend pas, la suivante peut être plus légère que la série d'avant (I153 prime).
          if (!(s.charge >= s.depuis - 1e-9) && s.bornee !== true) erreurs.push('I73' + nom + 'une proposition plus légère que la série d’avant');
          if (s.bornee === true && !(nombre(s.borne) !== null && s.charge < s.borne - 1e-9)) erreurs.push('I73' + nom + 'une proposition bornée qui n’est pas sous sa borne');
          var surLePlancher = s.depuis <= k.plancher + 1e-9;
          if (!surLePlancher && s.crans > 1 && s.charge > s.depuis * (1 + k.plafond) + 1e-9) {
            erreurs.push('I73' + nom + s.charge + ' kg dépasse le plafond de ' + Math.round(k.plafond * 100) + ' % sur ' + s.depuis + ' kg');
          }
          if (surLePlancher && s.crans > I73_CRANS_DEPUIS_LE_PLANCHER) erreurs.push('I73' + nom + 'plus de deux crans depuis le plus petit');
        } else if (s.pourquoi === 'plancher' && Math.abs(s.charge - k.plancher) > 1e-9) {
          erreurs.push('I73' + nom + 'la première série n’est pas au plus petit cran');
        }
        // I74 — une proposition est portée par UNE ligne non validée, jamais écrite.
        var porteuses = (x.lignes || []).filter(function (l) { return l.calage === true; });
        if (porteuses.length > 1) erreurs.push('I74' + nom + 'la proposition sur ' + porteuses.length + ' lignes');
        porteuses.forEach(function (l) {
          if (l.validee) erreurs.push('I74' + nom + 'une proposition sur une série validée');
          var brute = exos && exos[i] && exos[i].series ? exos[i].series[l.iSerie] : null;
          if (brute && Seance().partEnBase(brute)) erreurs.push('I74' + nom + 'une proposition écrite dans une série validée');
        });
        if (k.iSerie !== null && k.iSerie !== undefined && !porteuses.length) erreurs.push('I74' + nom + 'une proposition sans ligne');
      } else if ((x.lignes || []).some(function (l) { return l.calage === true; })) {
        erreurs.push('I74' + nom + 'une ligne de calage sans proposition');
      }
    });
  }

  // I75 (MOTEUR §9.1, 187) — UNE ZONE À MÉNAGER SE LIT EN SÉANCE : un exercice qui charge la zone (le profil + la table du
  // générateur) ne reçoit AUCUNE série lourde — ni zone Lourd (3-5 reps), ni ligne à 5 reps ou moins —, sauf une zone que la
  // personne a choisie elle-même (le moteur propose, elle décide). Les approches du calage sont des séries de travail à 6 reps au moins.
  // 15/11/2026 (§9.51 quinquies, PR B) : la « série lourde » est `Modele.estSerieLourde` (5 reps ou moins), jamais un seuil copié ici.
  // I105 et I106 (MOTEUR §9.33, 196) — LE REST-PAUSE, À LA LECTURE SEULEMENT (21/11/2026 : le coach ne le propose plus, I268) : une
  // mini-série (une ligne dégressive à la charge de la série de travail qui la précède, vue par `Modele.restPauseDe`, ou un vieux brouillon
  // qui porte la marque) n'est jamais une dégressive du coach ni une série de travail.
  //   · I105 — sa charge proposée est CELLE de la série de travail qui la précède (jamais une baisse de 22,5 %), sans phrase ni
  //     dégressive du coach sur elle ;
  //   · I106 — elle est hors couverture (rôle `hors`), sans pari, et ne compte pas : une série rest-pause = UNE série de travail.
  function verifierRestPause(plan, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var nom = ' — exercice ' + i + ' (' + (x && x.slug) + ') : ';
      var lignes = (x && x.lignes) || [];
      lignes.forEach(function (l, k) {
        if (!l || !l.restPause) return;
        if (l.role !== 'hors') erreurs.push('I106' + nom + 'la mini-série ' + l.iSerie + ' est couverte par la consigne');
        if (x.paris && x.paris[l.iSerie]) erreurs.push('I106' + nom + 'un pari sur la mini-série ' + l.iSerie);
        if (x.degressive && x.degressive.iSerie === l.iSerie) erreurs.push('I105' + nom + 'la dégressive du coach est posée sur la mini-série ' + l.iSerie);
        if (l.degressive) erreurs.push('I105' + nom + 'une phrase de dégressive sur la mini-série ' + l.iSerie);
        if (l.fantome) {
          var j = k - 1;
          while (j > 0 && lignes[j] && lignes[j].restPause) j--;
          var t = lignes[j];
          var ref = t ? (t.validee ? nombre(t.faite && t.faite.charge) : (t.fantome ? nombre(t.fantome.charge) : nombre(t.charge))) : null;
          if (l.fantome.source !== 'rest_pause' || (ref !== null && nombre(l.fantome.charge) !== ref)) {
            erreurs.push('I105' + nom + 'la mini-série ' + l.iSerie + ' ne reprend pas la charge de sa série de travail (' + l.fantome.charge + ' pour ' + ref + ')');
          }
        }
      });
    });
  }

  // I268 (MOTEUR §9.33, delta 21/11/2026, décision du fondateur) — LE COACH NE PROPOSE PLUS LE REST-PAUSE : aucune chaîne d'un plan (une phrase,
  // un bouton, un levier de la réaction au raté, une carte) ne le dit ni ne le nomme. La seule trace permise est la LECTURE d'une mini-série
  // déjà posée (`ligne.restPause`, la clé ; `fantome.source`, d'un vieux brouillon) : jamais une valeur de texte.
  function verifierSansRestPause(plan, erreurs) {
    var vus = [];
    (function marcher(v, chemin, cle) {
      if (typeof v === 'string') {
        // Deux lectures permises, nommées par leur chemin : `fantome.source` d'une mini-série d'un vieux brouillon, et `rate.pris`, la trace
        // d'un geste DE LA PERSONNE noté avant la mise à jour (contradicteur à froid de #741, défaut 1) — jamais le coach qui parle.
        var lecture = /\.fantome\.source$/.test(chemin) || /\.rate\.pris\.\d+$/.test(chemin);
        if (!lecture && /rest[-_ ]?pause/i.test(v)) erreurs.push('I268 — le coach propose le rest-pause (« ' + v.slice(0, 60) + ' ») à ' + chemin);
        return;
      }
      if (!v || typeof v !== 'object' || vus.indexOf(v) >= 0) return;
      vus.push(v);
      Object.keys(v).forEach(function (k) { marcher(v[k], chemin + '.' + k, k); });
    })(plan, 'plan', '');
  }

  // I107 et I108 (MOTEUR §9.34, 198) — LA BAISSE ATTENDUE EN SÈCHE.
  //   · I107 — la phrase « baisse attendue » n'existe qu'en sèche, jamais avec une carte de fatigue ni une semaine allégée, annonce
  //     2 à 5 % en moyenne, se refait de la règle et dit « sèche » une seule fois ;
  //   · I108 — une carte de baisse en sèche annonce plus de 5 % (en dessous, c'est la phrase, pas la carte).
  function verifierBaisseAttendue(plan, erreurs) {
    if (!plan) return;
    var M = Moteur(), a = plan.baisseAttendue;
    if (a) {
      if (plan.phase !== 'seche') erreurs.push('I107 — la baisse attendue hors sèche');
      if (plan.carte) erreurs.push('I107 — la baisse attendue avec une carte de fatigue');
      if (plan.allegee) erreurs.push('I107 — la baisse attendue pendant une semaine allégée');
      var f = a.fait || {};
      if (!(f.moyenne >= 0 && f.moyenne <= M.FATIGUE_BAISSE_MIN)) erreurs.push('I107 — la baisse attendue annonce ' + f.moyenne + ' % en moyenne');
      if (a.phrase !== M.phraseBaisseAttendue(f.noms, f.moyenne, f.reserve)) erreurs.push('I107 — la phrase de la baisse attendue ne se refait pas de la règle');
      if ((String(a.phrase).match(/sèche/g) || []).length !== 1) erreurs.push('I107 — « sèche » doit être dit une seule fois');
      if (a.titre !== M.titreBaisseAttendue()) erreurs.push('I107 — le titre de la baisse attendue');
    }
    var c = plan.carte;
    if (c && c.source === M.SOURCE_BAISSE && plan.phase === 'seche' && c.fait && c.fait.moyenne < M.FATIGUE_BAISSE_MIN) {
      erreurs.push('I108 — une carte de baisse en sèche à ' + c.fait.moyenne + ' % (la phrase attendue suffit sous 5 %)');
    }
  }

  // ══ I115 à I122 (236, MOTEUR §9.39) — LE COACH EN TEMPS RÉEL APRÈS UN RATÉ, lu sur le plan ═══════════════════════════════════════════
  //   I115  au plus une phrase de réaction par exercice, sous la DERNIÈRE série validée, et jamais avec la réaction existante (§9.14) ;
  //   I116  jamais une charge baissée sans geste : une ligne dont la charge a changé le doit à « Prendre X kg » ou à « un cran dessous » ; (251) jamais
  //         une charge SOUS la charge de travail sans geste — une ligne abaissée par la porte du cran repasse à la charge de travail, elle ne porte aucune
  //         charge de réaction (`l.rate.charge`) ;
  //   I117  « Comme prévu » respecté : une réponse à la forme du jour, et la carte ne revient pas ;
  //   I118  aucune réaction en Entretenir, décharge, semaine de mesure, calage, « J'ai mal », Édition ; (251) la PORTE du cran, elle, parle même au calage et
  //         au débutant : elle change le plan, ce n'est pas une réaction au raté (I138 la tait dans les autres contextes) ;
  //   I119  la fourchette tient (bornes entières, basse ≤ haute) et contient les reps faites, sauf la baisse (bas de zone à bas + 2) ;
  //   I120  (« Au max » disparaît, 20/11/2026 : sa clause « pas d'« Au max » après un échec franc ou « Ajuster la fin » » est sans objet, I251 la couvre) ;
  //   I121  la carte de la forme du jour : une seule, 2 exercices au moins sur 3 au plus ;
  //   I122  « un cran dessous » est le palier ou moins, jamais plus lourd que le pari raté.
  function verifierRate(plan, entrees, erreurs) {
    var xs = (plan && plan.exercices) || [];
    var gestes = entrees && entrees.seance && Array.isArray(entrees.seance.gestes) ? entrees.seance.gestes : [];
    var M = Moteur();
    var cartes = 0;
    xs.forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var r = x.rate, pr = x.parisRates, cf = x.carteForme;
      var phrases = (x.phrases || []).filter(function (p) { return p.ou === 'rate'; });
      var silence = plan.intention === 'entretien' || x.intention === 'entretien' || x.mode === 'entretien' || !!plan.allegee || (x.consigne && x.consigne.allegee) ||
        !!plan.semaineDeTest || !!x.semaineDeTest || !!x.calage || !!x.sansCoach || plan.edition === true;
      if (silence && (r || (pr && pr.carte) || cf)) erreurs.push('I118' + nom + 'une réaction du coach dans un contexte où il se tait');
      if (phrases.length > 1) erreurs.push('I115' + nom + phrases.length + ' phrases de réaction');
      if (r) {
        if (phrases.length !== 1) erreurs.push('I115' + nom + 'une réaction sans sa phrase');
        var plusTard = (x.lignes || []).some(function (l) { return (l.type === 'travail' || l.type === 'recul') && l.role !== 'hors' && l.validee && l.iSerie > r.iSerie; });
        if (plusTard) erreurs.push('I115' + nom + 'la réaction n’est pas sous la dernière série validée');
        if (x.message) erreurs.push('I115' + nom + 'deux phrases sous la même série (la réaction du coach et celle du §9.14)');
        var f = r.fourchette;
        if (f) {
          if (!(f.length === 2 && f[0] === Math.round(f[0]) && f[1] === Math.round(f[1]) && f[0] >= 1 && f[0] <= f[1])) {
            erreurs.push('I119' + nom + 'une fourchette mal formée (' + JSON.stringify(f) + ')');
          } else if (r.faites !== null && r.charge && r.charge.action !== 'baisse' && !(f[0] <= r.faites && r.faites <= f[1])) {
            erreurs.push('I119' + nom + 'la fourchette ' + f[0] + '-' + f[1] + ' ne contient pas les ' + r.faites + ' reps faites');
          }
        }
        // I216 (16/11/2026, MOTEUR §9.39 delta) — là où la réserve affichée est un plancher (population protégée I160, reprise longue I206), le « garde N » d'une réaction affichée n'est jamais dessous : la même carte
        // ne dit pas « garde 2 » puis « garde 1 ». Le pari des lignes qu'elle recale porte `fondement.reserve_visee` (la réserve affichée) : jamais au-dessus du garde dit.
        // « Une seule garde » (19/11/2026) — le plancher au rôle `ligne`, recalculé depuis les entrées : il vaut aussi quand la dernière ligne est un test.
        var plancherR = plan.protegee === true || M.enRepriseLongue(x.consigne) || plancherDeBarreRelevant(x.consigne, plan.reglage, familleDeLExercice(entrees, x.slug))
          ? nombre(gardeDeLigneDesEntrees(x, entrees)) : null;
        if (r.garde !== null && r.garde !== undefined && plancherR !== null && r.garde < plancherR) erreurs.push('I216' + nom + 'une réaction qui dit « garde ' + r.garde + ' » sous la réserve affichée de ' + plancherR);
        if (r.garde !== null && r.garde !== undefined && plancherR !== null) {
          (x.lignes || []).forEach(function (l) {
            var pr2 = x.paris && x.paris[l.iSerie] ? x.paris[l.iSerie] : null;
            var rvp = pr2 && pr2.fondement ? nombre(pr2.fondement.reserve_visee) : null;
            if (l.rate && !l.validee && rvp !== null && r.garde < rvp) erreurs.push('I216' + nom + 'un pari de réserve ' + rvp + ' sous une réaction qui dit « garde ' + r.garde + ' »');
          });
        }
        // I238 (lot E, A5, 20/11/2026, MOTEUR §9.39 et §14.8) — un levier « Dégressive » de la réaction satisfait la règle de l'escalier,
        // relue depuis les ENTRÉES (`Moteur.degressivePossible` : isolation, ni Lourd ni Mix, ni sèche, ni décharge, ni Entretenir, ni débutant).
        if ((r.boutons || []).some(function (b) { return b && b.cle === 'degressive'; }) &&
            !M.degressivePossible(conditionsDegressiveDuRate(plan, x, entrees || {}, entrees && entrees.seance))) {
          erreurs.push('I238' + nom + 'un levier « Dégressive » là où la dégressive n’est pas permise (zone ' + (x.consigne ? x.consigne.zone : '?') + ', phase ' + plan.phase + ')');
        }
        // I232 (« Une seule garde », 19/11/2026, MOTEUR §9.39) — à garde 0 des lignes (recalculée depuis les entrées), la réaction ne demande pas une
        // marge que la ligne ne demande pas : aucun « garde N » > 0, aucun cas M, et aucun échec (L) sur une série à fond à au moins
        // le bas de la zone.
        if (r.niveau !== 'zero' && x.consigne && gardeDeLigneDesEntrees(x, entrees) === 0) {
          if (nombre(r.garde) !== null && nombre(r.garde) > 0) erreurs.push('I232' + nom + 'une réaction qui dit « garde ' + r.garde + ' » sur des lignes en garde 0');
          if (r.cas === 'M') erreurs.push('I232' + nom + 'le cas M (« sans marge ») sur des lignes en garde 0');
          var zone7 = M.zoneParCle(x.consigne.zone);
          var sr7 = ((entrees && entrees.seance && entrees.seance.exercices && entrees.seance.exercices[i] && entrees.seance.exercices[i].series) || [])[r.iSerie] || null;
          var rp7 = sr7 ? nombre(sr7.reps) : null;
          if (zone7 && rp7 !== null && rp7 >= zone7.bas && (r.cas === 'L' || r.base === 'L')) {
            erreurs.push('I232' + nom + 'un échec (cas ' + r.cas + ') sur ' + rp7 + ' reps, dans la zone, à garde 0');
          }
        }
      }
      // I116 — une charge changée a son geste.
      (x.lignes || []).forEach(function (l) {
        if (!l.rate || l.rate.charge === undefined) return;
        var prise = gestes.some(function (g) { return g && g.slug === x.slug && g.geste === 'rate_prise' && g.bouton === 'prendre' && g.kg === l.rate.charge; });
        var cran = gestes.some(function (g) { return g && g.slug === x.slug && g.geste === 'paris_cran'; });
        if (!prise && !cran) erreurs.push('I116' + nom + 'la ligne ' + l.iSerie + ' a changé de charge (' + l.rate.charge + ') sans geste');
      });
      if (cf) {
        cartes++;
        if (!(cf.n >= M.RATE_FORME_FLANCHENT && cf.sur <= M.RATE_FORME_SUR && cf.n <= cf.sur)) erreurs.push('I121' + nom + 'la carte de la forme du jour pour ' + cf.n + ' sur ' + cf.sur);
      }
      // I122 — « un cran dessous ».
      if (pr && pr.cran && pr.palier) {
        if (!(pr.cran.charge < pr.palier.charge)) erreurs.push('I122' + nom + 'un cran dessous (' + pr.cran.charge + ') qui n’est pas sous le pari raté (' + pr.palier.charge + ')');
        if (pr.cran.reps !== pr.palier.reps) erreurs.push('I122' + nom + 'un cran dessous aux reps de ' + pr.cran.reps + ' pour un pari de ' + pr.palier.reps);
      }
    });
    if (cartes > 1) erreurs.push('I121 — ' + cartes + ' cartes de la forme du jour dans la séance');
    // I129 (237, suite de 236 × 225, MOTEUR §9.39) — la forme du jour et la veille : après « plus léger aujourd'hui » (§9.40), aucune carte de forme du jour
    // (pas de second allègement par-dessus) ; le fait de la veille n'est nommé que si le plan a été gardé, et c'est le sport NOTÉ.
    var ev = entrees || {};
    if (ev.veilleChoix === 'leger' && cartes > 0) erreurs.push('I129 — la carte de la forme du jour après « plus léger aujourd’hui » (second allègement)');
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var q = x && x.carteForme;
      if (!q || !q.veille) return;
      var noteHier = ev.activiteVeille && typeof ev.activiteVeille.nom === 'string' ? ev.activiteVeille.nom.toLowerCase() : null;
      if (ev.veilleChoix !== 'garder' || noteHier === null || String(q.veille).toLowerCase() !== noteHier) {
        erreurs.push('I129 — exercice ' + i + ' : la forme du jour nomme « ' + q.veille + ' » sans activité notée hier ni plan gardé');
      }
    });
    var rep = gestes.some(function (g) { return g && (g.geste === 'forme_gardee' || g.geste === 'forme_ajustee'); });
    if (rep && cartes > 0) erreurs.push('I117 — la carte de la forme du jour revient après une réponse');
    if (rep && plan && plan.formeDuJour && plan.formeDuJour.carte) erreurs.push('I117 — la forme du jour porte une carte après une réponse');
  }

  // I134 à I139 (251, MOTEUR §9.39, la recette du coach) — LA PORTE DU CRAN, LE NIVEAU 2 SOUS LA ZONE, LA BAISSE CONTRE LA CHARGE DE TRAVAIL, LA
  // GROSSE SÉRIE RATÉE. Lus sur le plan et sur la séance : le plan ne dit rien que la séance ne prouve.
  //   I134  la carte de la forme du jour ne cite un exercice dans `baisses` que s'il a une série de travail validée sous min(ligne, travail)
  //   I135  dans un bloc à grosse série, `x.reculs.vise` est la visée du premier recul non validé (le premier si tous le sont) ; tous visent pareil
  //   I136  porte fermée et non tentée : aucune ligne `test` non validée, aucune ligne non validée plus lourde que la charge de travail (sauf coach, élan) ;
  //         aucune porte fermée sans série validée sous la zone (ou allée à l'échec), ni sans geste `forme_ajustee` pour la raison forme
  //   I137  `x.rate.niveau === 'exercice'` jamais quand la dernière série de travail validée est classée D ou L
  //   I138  la voix de la porte : la phrase et le bouton sous la PREMIÈRE série qui ferme ; « Le test à … revient. » et « Annuler », sans phrase au Pourquoi
  //         une fois tentée ; rien dans les contextes muets
  //   I139  sous la première série de travail d'un exercice à reculs, le coach parle en cas G, jamais I
  // I143 (255, MOTEUR §9.10) — LE REPORT DE ZONE COMPTE LA RÉSERVE VISÉE : la charge reportée sur une nouvelle zone (origine « estimée »)
  // donne, au bas de la zone PLUS la réserve visée de la zone pour le réglage de la séance, un max estimé qui ne dépasse jamais celui de
  // la série dont elle part (palier × (niveau + la plus petite réserve notée, 0 si inconnue : l’hypothèse prudente)), reps visées montées par un gros cran comprises (255 bis). Sans cela, la nouvelle zone était plus dure
  // que le plan ne le disait (152,5 × 5 en Lourd → Mix 147,5 × 6, soit 2 % de plus).
  // I235 (« Une seule garde », C-3, MOTEUR §9.10 et §9.26 bis) — le report de zone lit la réserve AFFICHÉE (le plancher des populations protégées) :
  // `fondement.report.reserve`, quand il est écrit, est `Moteur.reserveAffichee` au rôle `ligne` recalculée depuis les entrées (zone, réglage, population
  // protégée). I143 relit la réserve écrite ; une consigne d'avant (sans `report.reserve`) garde la table. (La borne de domaine 3-10 reps de la source,
  // proposée avec C-3, n'est PAS appliquée : elle supprimait le report depuis Volume ou Séries longues et alourdissait « Plus léger ».)
  function verifierReportDeZone(plan, erreurs, entrees) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var c = x && x.consigne;
      if (!c || c.etat !== 'nouvelle_zone' || !c.fondement || !c.fondement.report) return;
      var rEcrite = nombre(c.fondement.report.reserve);
      if (entrees && rEcrite !== null) {
        var protegeeE = protegeeDeEntrees(entrees);
        var familleE = familleDeLExercice(entrees, x.slug);
        var rAttendue = M.reserveAffichee({ zone: c.zone, role: 'ligne', reglage: reglageDe(entrees), protegee: protegeeE, famille: familleE });
        // Contradicteur final (R1, 19/11/2026) — la clé du gel d'une consigne (séance, intention, réglage) ne porte pas la population : une consigne
        // figée avant que l'objectif, l'ancienneté ou l'âge changent garde la réserve de la population d'AVANT. Elle est admise aussi (le patron
        // d'I64) ; toute autre valeur reste une erreur.
        var rAutre = M.reserveAffichee({ zone: c.zone, role: 'ligne', reglage: reglageDe(entrees), protegee: !protegeeE, famille: familleE });
        // Lot F, A1 (I241) — et une consigne figée avant le plancher de barre : l'affichée sans la barre (l'une ou l'autre population).
        var rSansBarre = M.reserveAffichee({ zone: c.zone, role: 'ligne', reglage: reglageDe(entrees), protegee: protegeeE });
        var rSansBarreAutre = M.reserveAffichee({ zone: c.zone, role: 'ligne', reglage: reglageDe(entrees), protegee: !protegeeE });
        if (rEcrite !== rAttendue && rEcrite !== rAutre && rEcrite !== rSansBarre && rEcrite !== rSansBarreAutre) erreurs.push('I235 — exercice ' + i + ' (' + x.slug + ') : le report en ' + c.zone + ' a lu une réserve de ' + rEcrite + ', la réserve affichée est ' + rAttendue);
      }
      if (c.fondement.report.origine !== 'estimee') return;
      var charge = nombre(c.ligne && c.ligne.charge), vise = nombre(c.ligne && c.ligne.vise), d = c.fondement.report.depuis || {};
      var P = nombre(d.palier), n = nombre(d.niveau);
      if (charge === null || vise === null || P === null || n === null) return;
      // C-3 — la réserve que le report a utilisée (écrite) ; une consigne d'avant : la table.
      var rv = rEcrite !== null ? rEcrite : M.reserveVisee({ zone: c.zone, role: 'ligne', reglage: plan.reglage });
      var tenable = M.unRMEpley(charge, vise + (rv === null ? 0 : rv)), rs = nombre(d.reserve), source = M.unRMEpley(P, n + (rs === null ? 0 : rs));
      if (tenable > source + 1e-6) {
        erreurs.push('I143 — exercice ' + i + ' (' + x.slug + ') : le report en ' + c.zone + ' propose ' + charge + ' kg × ' + vise +
          ' (réserve visée ' + (rv === null ? 0 : rv) + ') : un max estimé de ' + (Math.round(tenable * 10) / 10) + ' kg, sous ' + P + ' kg × ' + n + ' il n’est que de ' + (Math.round(source * 10) / 10));
      }
    });
  }
  // I204 et I205 (16/11/2026, MOTEUR §9.9) — LA REPRISE LONGUE VISE LE BAS DE LA ZONE.
  //   I204  en reprise longue, la visée d'une ligne chiffrée n'est pas sous le bas de la zone de la ligne ; hors exemption (charge qui n'est pas une masse :
  //         corps, aide, lest, élastique ; niveau à 1-2 reps ou au-delà de 10, sans estimation, I170 ; salle déclarée), une ligne sous le bas SANS marque est une erreur ;
  //   I205  la ligne marquée (`fondement.reprisePlancher`) = l'estimation au bas de zone avec la réserve AFFICHÉE × le repli de 10 % au plus, recalculée
  //         depuis la source de la marque (palier, niveau, réserve notée) et le plan : visée = bas, jamais plus lourde que le palier, jamais plus de
  //         10 % sous l'estimation au cran, et un max estimé (à `vise` + réserve affichée) qui ne dépasse jamais celui de la source.
  // (I206, la réserve affichée à la séance de reprise longue, est dans `verifierEffortVise`.)
  function verifierRepriseAuBasDeZone(plan, entrees, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var c = x && x.consigne;
      if (!c || c.etat !== 'reprise_longue' || !c.ligne || c.allegee || c.repli || c.plusLegere || c.veilleLegere || c.alleger) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var z = M.zoneParCle(c.zone), ch = nombre(c.ligne.charge), vise = nombre(c.ligne.vise), P = nombre(c.palier);
      var marque = c.fondement && c.fondement.reprisePlancher;
      if (!z || ch === null || vise === null) return;
      if (!marque) {
        var cat = (entrees && entrees.catalogue && entrees.catalogue[x.slug]) || {};
        var exempt = P === null || !(P > 0) || ch <= 0 || !cat.equipement || cat.equipement === M.EQUIPEMENT_LEST || cat.equipement === 'elastique' ||
          !!(c.fondement && (c.fondement.salle || c.fondement.elastique)) || racine.THModele.modeDeReps(c.niveau) !== 'projection';
        if (vise < z.bas && !exempt) erreurs.push('I204' + nom + 'la reprise longue vise ' + vise + ' reps, sous le bas de la zone (' + z.bas + '), sans la marque du plancher');
        return;
      }
      if (vise !== z.bas) erreurs.push('I204' + nom + 'la reprise au bas de la zone vise ' + vise + ' reps, le bas est ' + z.bas);
      var d = marque.depuis || {}, Ps = nombre(d.palier), n = nombre(d.niveau), rs = nombre(d.reserve);
      if (Ps === null || n === null || Ps !== P) { erreurs.push('I205' + nom + 'la marque ne part pas du palier de la consigne'); return; }
      var rv = M.reserveAffichee({ zone: c.zone, role: 'ligne', reglage: plan.reglage, protegee: plan.protegee === true, repriseLongue: true });
      if (rv !== marque.reserve || rv === null || rv < M.RESERVE_PLANCHER) erreurs.push('I205' + nom + 'la réserve de la marque (' + marque.reserve + ') n’est pas la réserve affichée de la reprise (' + rv + ')');
      var source = M.unRMEpley(Ps, n + (rs === null ? 0 : rs)), estimee = source / M.unRMEpley(1, z.bas + (rv === null ? 0 : rv)), base = nombre(marque.base);
      if (base === null || base > estimee + 1e-6 || base > P + 1e-9) erreurs.push('I205' + nom + 'la base ' + base + ' kg dépasse l’estimation au bas de la zone (' + (Math.round(estimee * 100) / 100) + ' kg) ou le palier ' + P);
      else {
        if (ch > base + 1e-9) erreurs.push('I205' + nom + 'la ligne (' + ch + ' kg) dépasse sa base (' + base + ' kg)');
        if (ch < base * (1 - M.REPLI_MAX_REPRISE) - 1e-9) erreurs.push('I205' + nom + 'la ligne (' + ch + ' kg) est à plus de 10 % sous sa base (' + base + ' kg)');
      }
      if (M.unRMEpley(ch, vise + (rv === null ? 0 : rv)) > source + 1e-6) erreurs.push('I205' + nom + 'la ligne ' + ch + ' kg × ' + vise + ' donne un max estimé au-dessus de celui de la source');
    });
  }
  function verifierPorte(plan, entrees, erreurs) {
    var xs = (plan && plan.exercices) || [];
    var exos = entrees && entrees.seance && Array.isArray(entrees.seance.exercices) ? entrees.seance.exercices : [];
    var gestes = entrees && entrees.seance && Array.isArray(entrees.seance.gestes) ? entrees.seance.gestes : [];
    var M = Moteur(), P = Palier(), T = racine.THModele;
    var sp = function (t) { return String(t === null || t === undefined ? '' : t).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim(); };
    var travailLu = function (l) { return (l.type === 'travail' || l.type === 'recul') && l.role !== 'hors'; };
    var catalogue = (entrees && entrees.catalogue) || {};
    // I134
    xs.forEach(function (x, i) {
      var cf = x && x.carteForme;
      if (!cf || !Array.isArray(cf.baisses)) return;
      cf.baisses.forEach(function (nom) {
        var cible = xs.filter(function (q) { var c = catalogue[q.slug]; return ((c && c.nom) || q.slug) === nom; })[0];
        var ou = ' — exercice ' + i + ' (' + (x && x.slug) + ') : ';
        if (!cible || !cible.consigne) { erreurs.push('I134' + ou + 'la carte cite « ' + nom + ' » dans ses baisses, un exercice que le plan ne porte pas'); return; }
        var ligne = nombre(cible.consigne.ligne && cible.consigne.ligne.charge), travail = chargeDeTravail(cible.consigne);
        var seuil = ligne !== null && travail !== null ? Math.min(ligne, travail) : (ligne !== null ? ligne : travail);
        var iExo = cible.iExo !== undefined ? cible.iExo : xs.indexOf(cible);
        var series = (exos[iExo] && exos[iExo].series) || [];
        var sous = seuil !== null && series.some(function (sr) {
          var c = nombre(sr.charge_kg);
          return T.estTravail(sr) && !T.estRecul(sr) && sr.validee_a && c !== null && c > 0 && c < seuil - 1e-9;
        });
        if (!sous) erreurs.push('I134' + ou + 'la carte cite « ' + nom + ' » comme baissé sans série de travail validée sous ' + seuil + ' kg');
      });
    });
    xs.forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var lignes = x.lignes || [];
      // I135
      if (x.reculs) {
        var visee = function (l) { return nombre(l.recul && l.recul.vise !== undefined ? l.recul.vise : l.vise); };
        var rec = lignes.filter(function (l) { return l.type === 'recul'; });
        var porteurs = rec.filter(function (l) { return !l.validee && visee(l) !== null; });
        var attendu = porteurs.length ? visee(porteurs[0]) : (rec.length ? visee(rec[0]) : null);
        if (nombre(x.reculs.vise) !== null && attendu !== null && nombre(x.reculs.vise) !== attendu) {
          erreurs.push('I135' + nom + 'les reculs visent ' + x.reculs.vise + ' reps, la ligne du premier recul non validé en vise ' + attendu);
        }
        var visees = porteurs.map(visee);
        if (visees.some(function (v) { return v !== visees[0]; })) erreurs.push('I135' + nom + 'des reculs qui ne visent pas les mêmes reps (' + visees.join(', ') + ')');
      }
      // I139
      var travail = lignes.filter(travailLu);
      var premiere = travail[0] || null;
      if (x.reculs && x.rate && premiere && x.rate.iSerie === premiere.iSerie && (x.rate.cas === 'I' || x.rate.cas === 'J')) {
        erreurs.push('I139' + nom + 'le coach parle sous la grosse série en cas ' + x.rate.cas + ' (« pas encore » / « dernière ») : c’est le cas G, qui recale les reculs');
      }
      // I137
      var dernierFait = travail.filter(function (l) { return l.validee; }).pop() || null;
      if (x.rate && x.rate.niveau === 'exercice' && dernierFait && x.consigne) {
        var zone = M.zoneParCle(x.consigne.zone), sr = ((exos[i] && exos[i].series) || [])[dernierFait.iSerie] || {};
        var ch = nombre(sr.charge_kg), rp = nombre(sr.reps), vi = nombre(dernierFait.vise);
        if (zone && rp !== null && vi !== null && ch !== null && ch > 0 && rp < vi) {
          var cat = catalogue[x.slug] || {};
          var lu = M.rateSousLaZone({ reps: rp, bas: zone.bas, objectif: entrees.objectif || null, barre: cat.equipement === 'barre', reserve: P.reserveDeSerie(sr), charge: ch,
            gardeAffichee: gardeDeLigneDesEntrees(x, entrees) === 0 ? 0 : null });
          if (lu.sous || lu.echec) erreurs.push('I137' + nom + 'le niveau 2 parle après une série classée ' + (lu.echec ? 'L' : 'D') + ' (le niveau 1 garde la parole)');
        }
      }
      // I136, I138
      var q = x.porteDuCran || null;
      var portePhrases = (x.phrases || []).filter(function (p) { return p.ou === 'porte'; });
      var muet = plan.intention === 'entretien' || x.intention === 'entretien' || x.mode === 'entretien' || !!plan.allegee || (x.consigne && x.consigne.allegee) ||
        !!plan.semaineDeTest || !!x.semaineDeTest || !!x.sansCoach || plan.edition === true;
      if (!q) {
        var priseA = !muet && x.consigne && x.consigne.haut && x.consigne.ligne && !x.consigne.allegee && !x.consigne.repli
          ? gestes.filter(function (g) { return g && g.geste === 'rate_prise' && g.bouton === 'prendre' && g.slug === x.slug; })[0] : null;
        if (priseA) {
          var srP = ((exos[i] && exos[i].series) || [])[priseA.rang] || {}, crP = nombre(x.consigne.haut.charge), chP = nombre(srP.charge_kg);
          // 19/11/2026 — un « Prendre » pris sous une réaction AU ZÉRO (Z1) ne ferme pas la porte : la porte se tait sur un 0 rep (une seule voix, I157) ; les lignes qui restent passent à D.
          if (srP.validee_a && nombre(srP.reps) !== 0 && crP !== null && chP !== null && chP < crP - 1e-9 && lignes.some(function (l) { return l.role === 'test' && !l.validee; })) {
            erreurs.push('I136' + nom + 'un « Prendre » accepté et une ligne de test encore proposée');
          }
        }
        if (portePhrases.length) erreurs.push('I138' + nom + 'la phrase de la porte sans porte fermée');
        return;
      }
      if (muet) erreurs.push('I138' + nom + 'une porte du cran dans un contexte où le coach se tait');
      var travailKg = x.consigne ? chargeDeTravail(x.consigne) : null;
      if (!q.tente) {
        lignes.forEach(function (l) {
          if (l.validee || l.figee || !travailLu(l) && l.role !== 'test') return;
          if (l.role === 'test') erreurs.push('I136' + nom + 'la ligne ' + l.iSerie + ' est un test alors que la porte est fermée');
          else if (travailKg !== null && nombre(l.charge) !== null && nombre(l.charge) > travailKg + 1e-9 && l.source !== 'coach' && l.source !== 'elan') {
            erreurs.push('I136' + nom + 'la ligne ' + l.iSerie + ' à ' + l.charge + ' kg dépasse la charge de travail (' + travailKg + ' kg) porte fermée');
          }
          if (l.role !== 'test' && travailKg !== null && nombre(l.charge) !== null && nombre(l.charge) < travailKg - 1e-9 && l.source === 'consigne' && l.rate && l.rate.charge === undefined &&
              !gestes.some(function (g) { return g && g.geste === 'rate_prise' && g.slug === x.slug; })) {
            erreurs.push('I116' + nom + 'la ligne ' + l.iSerie + ' est sous la charge de travail sans geste');
          }
        });
      }
      if (q.raison === 'forme') {
        if (!gestes.some(function (g) { return g && g.geste === 'forme_ajustee'; })) erreurs.push('I136' + nom + 'une porte fermée pour la forme sans geste « forme_ajustee »');
        if (q.phrase !== null || q.bouton !== null || portePhrases.some(function (p) { return p.texte && sp(p.texte) === sp(q.phrase); }) && q.phrase) {
          erreurs.push('I138' + nom + 'la porte fermée pour la forme parle sous une série (seul le Pourquoi la dit)');
        }
      } else {
        var sr2 = q.iSerie !== null && q.iSerie !== undefined ? ((exos[i] && exos[i].series) || [])[q.iSerie] : null;
        var zone2 = x.consigne ? M.zoneParCle(x.consigne.zone) : null;
        if (!sr2 || !sr2.validee_a) erreurs.push('I136' + nom + 'une porte fermée sans série validée qui la ferme');
        else if (q.raison === 'prise') {
          var cran3 = q.cran ? nombre(q.cran.charge) : null, ch3 = nombre(sr2.charge_kg);
          if (ch3 === null || cran3 === null || !(ch3 < cran3)) erreurs.push('I136' + nom + 'la série qui ferme n’est pas sous le cran');
          if (!gestes.some(function (g) { return g && g.geste === 'rate_prise' && g.bouton === 'prendre' && g.slug === x.slug && g.rang === q.iSerie; })) {
            erreurs.push('I136' + nom + 'une porte fermée par un « Prendre » que la séance n’a pas accepté');
          }
        } else {
          var rep2 = nombre(sr2.reps), ch2 = nombre(sr2.charge_kg), cran2 = q.cran ? nombre(q.cran.charge) : null;
          if (ch2 === null || cran2 === null || !(ch2 < cran2)) erreurs.push('I136' + nom + 'la série qui ferme n’est pas sous le cran');
          if (q.raison === 'sous_la_zone' && zone2 && !(rep2 !== null && rep2 < zone2.bas)) erreurs.push('I136' + nom + 'la porte se ferme sur ' + rep2 + ' reps, pas sous la zone');
          if (q.raison === 'echec' && P.reserveDeSerie(sr2) !== 0) erreurs.push('I136' + nom + 'la porte se ferme sur un échec que la série ne note pas');
          // I232 (« Une seule garde ») — à garde 0 des lignes (recalculée depuis les entrées), une série à fond à au moins le bas de la zone a fait l'effort demandé.
          if (q.raison === 'echec' && zone2 && rep2 !== null && rep2 >= zone2.bas && gardeDeLigneDesEntrees(x, entrees) === 0) {
            erreurs.push('I232' + nom + 'la porte se ferme pour « échec » sur ' + rep2 + ' reps dans la zone, à garde 0');
          }
        }
        // I138 — la phrase et le bouton, sous la PREMIÈRE série qui ferme.
        var attendu0 = /^Pas de test à .+ kg aujourd’hui : (ta série est (sous ta zone|allée jusqu’à l’échec)|tu as baissé la charge)\.$/;
        if (!q.tente) {
          if (!attendu0.test(sp(q.phrase))) erreurs.push('I138' + nom + 'la phrase de la porte fermée n’est pas la phrase écrite (« ' + sp(q.phrase) + ' »)');
          if (!q.bouton || !/^Tenter .+ kg quand même$/.test(sp(q.bouton))) erreurs.push('I138' + nom + 'la porte fermée sans son bouton « Tenter … quand même »');
        } else {
          if (!/^Le test à .+ kg revient\.$/.test(sp(q.phrase))) erreurs.push('I138' + nom + 'la porte tentée ne dit pas « Le test à … revient. »');
          if (sp(q.annuler) !== 'Annuler') erreurs.push('I138' + nom + 'la porte tentée sans « Annuler »');
          if (x.pourquoi && x.pourquoi.porte) erreurs.push('I138' + nom + 'le Pourquoi dit la porte fermée alors que le test est revenu (« ' + sp(x.pourquoi.porte) + ' »)');
        }
        // I138 — q.iSerie est la PREMIÈRE série qui ferme : relue sur la séance, avec la même lecture que le plan.
        if (x.consigne && x.consigne.haut && x.consigne.ligne) {
          var cat4 = catalogue[x.slug] || {};
          var prise4 = gestes.filter(function (g) { return g && g.geste === 'rate_prise' && g.bouton === 'prendre' && g.slug === x.slug; })[0];
          var relue = porteDeLExercice((exos[i] && exos[i].series) || [], x.consigne, { tente: q.tente === true, formeAjustee: false,
            prise: prise4 ? { iSerie: prise4.rang, kg: prise4.kg } : null, objectif: entrees.objectif || null, barre: cat4.equipement === 'barre',
            gardeAffichee: gardeDeLigneDesEntrees(x, entrees) === 0 ? 0 : null });
          if (!relue || relue.serie !== q.iSerie) erreurs.push('I138' + nom + 'la phrase est sous la série ' + q.iSerie + ', la première série qui ferme est la ' + (relue ? relue.serie : 'aucune'));
        }
        if (portePhrases.length !== 1) erreurs.push('I138' + nom + portePhrases.length + ' phrases de porte (une seule, sous la série qui ferme)');
      }
    });
  }

  // I114 (221, MOTEUR §19.2) — LE BLOC HYPERTROPHIE, lu sur le plan : le soulevé reste en Mix (jamais 8-10) ; en grosse série gardée, la
  // consigne est celle du Lourd, la première série de travail reste une série de travail, les suivantes sont des reculs (aux reps du bloc,
  // 8-10) ; sans grosse série, la consigne est en Hypertrophie, sans recul que le bloc ait fait naître.
  function verifierBlocHypertrophie(plan, erreurs) {
    var M = Moteur(), z = M.zoneParCle('hypertrophie');
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var b = x && x.blocHypertrophie;
      if (!b) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var k = x.consigne;
      if (k && !k.allegee && !k.repli && k.zone !== undefined && k.zone !== null && k.zone !== b.zone) {
        erreurs.push('I114' + nom + 'la zone ' + k.zone + ' dans un bloc Hypertrophie (attendu ' + b.zone + ')');
      }
      if (b.zone === 'mix' && b.grosse) erreurs.push('I114' + nom + 'une grosse série gardée sur le soulevé');
      if (b.zone === 'mix' && k && k.zone === 'hypertrophie') erreurs.push('I114' + nom + 'le soulevé en 8-10');
      if (!b.grosse) return;
      var types = (x.lignes || []).map(function (l) { return l.type; }).filter(function (t) { return t === 'travail' || t === 'recul'; });
      if (types.length && types[0] !== 'travail') erreurs.push('I114' + nom + 'la première série n’est pas la grosse série');
      if (types.slice(1).some(function (t) { return t !== 'recul'; })) erreurs.push('I114' + nom + 'une série après la grosse série n’est pas un recul');
      var vises = (x.lignes || []).filter(function (l) { return l.type === 'recul'; });
      if (vises.some(function (l) { return typeof l.vise === 'number' && (l.vise < z.bas || l.vise > z.haut); })) {
        erreurs.push('I114' + nom + 'des reculs hors de ' + z.bas + '-' + z.haut + ' reps');
      }
    });
  }

  function verifierZoneMenagee(plan, entrees, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var m = x && x.menagee;
      if (!m || m.choisie || !x.consigne) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      if (x.consigne.zone === 'lourd') erreurs.push('I75' + nom + 'la zone Lourd sur un exercice qui charge ' + (m.zones || []).join(', '));
      (x.lignes || []).forEach(function (l) {
        if (l.validee || l.role === 'hors') return;
        var v = nombre(l.vise);
        if (v !== null && racine.THModele.estSerieLourde(v)) erreurs.push('I75' + nom + 'une série lourde proposée (' + v + ' reps) sur un exercice qui charge ' + (m.zones || []).join(', '));
      });
      var k = x.calage && x.calage.suivante;
      if (k && racine.THModele.estSerieLourde(k.reps)) erreurs.push('I75' + nom + 'un calage à ' + k.reps + ' reps sur un exercice qui charge ' + (m.zones || []).join(', '));
    });
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

  // I59, I60 (MOTEUR §9.22, §9.26, 165) — UNE SÉANCE ALLÉGÉE NE SERT JAMAIS DE RÉFÉRENCE.
  //   I59  pendant une semaine allégée ou une décharge, aucune consigne allégée ne porte d'effort visé, de réserve visée
  //        ni de question « Il t'en restait combien ? » ;
  //   I60  aucune consigne ne cite, comme séance de référence (`fondement.date`), une séance dont le jour tombe dans
  //        une période allégée (`entrees.periodesAllegees`, `[{ debut, fin }]` en jours civils) : le coach lit la
  //        dernière séance normale.
  function verifierApresLaDecharge(plan, entrees, erreurs) {
    var M = Moteur();
    var periodes = entrees && entrees.periodesAllegees ? entrees.periodesAllegees : [];
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var nom = ' — exercice ' + i + ' (' + (x && x.slug) + ') : ';
      var k = x && x.consigne;
      if (!k || k.etat === 'silence') return;
      if (k.allegee) {
        if (x.effortVise) erreurs.push('I59' + nom + 'un effort visé sur une consigne allégée');
        if ((x.reserveVisee !== null && x.reserveVisee !== undefined) || (x.reserveAffichee !== null && x.reserveAffichee !== undefined)) erreurs.push('I59' + nom + 'une réserve visée sur une consigne allégée');
        if (x.questionReserve) erreurs.push('I59' + nom + 'une question de réserve sur une consigne allégée');
      }
      var d = k.fondement && k.fondement.date ? M.jourCivil(k.fondement.date) : null;
      if (d && periodes.some(function (p) { return p && p.debut && p.fin && p.debut <= d && d <= p.fin; })) {
        erreurs.push('I60' + nom + 'la consigne cite une séance allégée (' + d + ') comme référence');
      }
    });
  }

  // I62 à I64 (169) — la sortie de la garde, l'éligibilité, la visée du fondement : voir ci-dessous.
  // I56 à I58 (MOTEUR §9.26, 154) — L'EFFORT VISÉ.
  //   I56  une réserve visée n'existe que là où le coach parle (un pari, hors Édition, une mesure charge × reps), et vaut
  //        la table (`reserveVisee`) ; ce que l'écran lit (`x.effortVise`) n'existe que s'il y en a une, sur la dernière
  //        série de travail ;
  //   I57  un test posé « par la réserve » cite dans son fondement la série et sa réserve : une charge, des reps, une
  //        réserve d'au moins la visée + 2 (169 : sauf la SORTIE de la garde, qui pose le test avec R < V, I62) ;
  //   I58  une réserve sous la visée n'ouvre jamais une montée : ni test, ni ligne haute, ni double cran.
  // I241 (Lot F, A1, 20/11/2026, MOTEUR §9.26 ter) — LE PLANCHER DE RÉSERVE PAR BARRE. Sur un exercice dont la barre (`familleDeLExercice`, recalculée depuis
  // le catalogue des entrées, jamais lue sur le plan) n'est pas nulle : la réserve affichée de la visée (`x.reserveAffichee`) et la garde des lignes (celle du
  // plan et celle recalculée depuis les entrées) ne sont jamais sous `Moteur.plancherDeBarre` (`null` admis : ligne de test d'une protégée, après un zéro rep,
  // règle hors jeu). (La clause « Au max » est retirée avec l'objet, 20/11/2026.) Exemptée et nommée : la semaine de mesure (`x.semaineDeTest`, ses essais et
  // sa série au max, §9.32).
  // I243 (Lot F, étape 1, 20/11/2026, MOTEUR §9.14 ter delta ; CONTRA-723 B1, B2) — « À FOND » À GARDE 0, LA MONOTONIE. À garde 0 des lignes (recalculée
  // depuis les entrées), après une série à fond À LA CHARGE DE SA LIGNE, aucune ligne de travail non validée à cette charge (ni du coach ni d'élan) ne
  // vise plus que la borne la plus basse posée par ces séries (max(bas, r − 1)), un 0 rep venu après compris : quelle que soit la voix, la suite ne remonte
  // jamais. Et la voix : quand la réaction au raté parle sous la dernière série, aucun message de la règle (une voix, I115).
  function verifierMonotonieAFond(plan, entrees, erreurs) {
    var M = Moteur(), Pa = racine.THPalier;
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x || !x.consigne || !Array.isArray(x.lignes) || gardeDeLigneDesEntrees(x, entrees) !== 0) return;
      var z = M.zoneParCle(x.consigne.zone);
      var series = (entrees && entrees.seance && entrees.seance.exercices && entrees.seance.exercices[i] && entrees.seance.exercices[i].series) || [];
      if (!z) return;
      var bornes = [];
      x.lignes.forEach(function (l) {
        if (!l.validee || l.type !== 'travail') return;
        var s = series[l.iSerie] || {}, r = nombre(s.reps), c = nombre(s.charge_kg);
        if (r === null || c === null || r < 1 || Pa.cranDeSerie(s) !== 'max' || !memeChargeOuVides(nombre(l.charge), c)) return;
        var b = Math.max(z.bas, r - 1);   // CONTRA-723 B2 : sous le bas, le bas (jamais un retour silencieux à la visée)
        var deja = bornes.filter(function (q) { return memeChargeOuVides(q.charge, c); })[0];
        if (deja) deja.vise = Math.min(deja.vise, b); else bornes.push({ charge: c, vise: b });
      });
      if (!bornes.length) return;
      x.lignes.forEach(function (l) {
        if (l.validee || l.type !== 'travail' || l.source === 'coach' || l.source === 'elan' || l.role === 'elan') return;
        bornes.forEach(function (q) {
          if (memeChargeOuVides(nombre(l.charge), q.charge) && nombre(l.vise) !== null && nombre(l.vise) > q.vise) {
            erreurs.push('I243 — exercice ' + i + ' (' + x.slug + ') : la ligne ' + l.iSerie + ' vise ' + l.vise + ' à ' + q.charge + ' kg, au-dessus de la borne « à fond » ' + q.vise);
          }
        });
      });
      if (x.rate && x.message && x.message.type === 'a_fond_suite') erreurs.push('I243 — exercice ' + i + ' (' + x.slug + ') : deux voix (« à fond » et la réaction au raté)');
    });
  }
  function verifierPlancherDeBarre(plan, entrees, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x || !x.consigne || x.semaineDeTest) return;
      var famille = familleDeLExercice(entrees, x.slug), pb = M.plancherDeBarre(famille);
      if (pb === null) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var rv = nombre(x.reserveAffichee);
      if (rv !== null && rv < pb) erreurs.push('I241' + nom + 'une réserve affichée de ' + rv + ' sous le plancher de la barre (' + pb + ')');
      var gP = nombre(x.gardeDeLigne), gE = nombre(gardeDeLigneDesEntrees(x, entrees));
      if (gP !== null && gP < pb) erreurs.push('I241' + nom + 'une garde des lignes de ' + gP + ' sous le plancher de la barre (' + pb + ')');
      if (gE !== null && gE < pb) erreurs.push('I241' + nom + 'la garde des lignes recalculée vaut ' + gE + ', sous le plancher de la barre (' + pb + ')');
    });
  }
  // I252, I252 bis et I254 (« Capacité tenue », 20/11/2026, MOTEUR §9.26 delta ; décision d'Aurélien : variante A, la règle vaut aussi sur les barres).
  //   · I252 — une garde « sans marge », des zones (`fondement.effortVise.effet === 'garde'`) ou de la règle de bord (`bord_garde` avec `bord.reserve`), n'existe que
  //     si la capacité n'est PAS tenue (`Moteur.capaciteTenue`). Ce qui est RECALCULÉ depuis les entrées : les reps de la série (la dernière série de travail à
  //     la charge gardée de `entrees.precedents`, quand c'est la séance d'où la consigne repart), la population protégée (`plan.protegee`, I160), le plafond des
  //     reps visées (le haut de la zone, relu dans la table : la consigne reçue ne vise jamais au-dessus). Ce qui n'est que de la COHÉRENCE avec le fondement
  //     (le plan n'a ni la réserve de la séance d'avant, ni la consigne qu'elle a reçue) : la réserve notée, les reps visées (`ev.vise`, `bord.capacite.vise`) et
  //     les exclusions « après un zéro » et « reprise longue » (`horsCapacite`). Le cas M et la porte « échec » n'ont pas de vérification à part : M exige
  //     reps = visée à réserve 0 (la capacité n'y tient qu'à garde 0, I232) et la porte « échec » reps < visée (jamais tenue).
  //   · I252 bis — les reps relues sont les reps SAISIES (`ev.reps`, recoupées avec la séance des entrées) : un moteur qui garderait sur le calcul prudent (68B) est refusé.
  //   · I254 — la ligne de fait « … de plus que prévu » ne se dit que si la consigne suivante (`entrees.suites`) porte `fondement.capacite` (capacité tenue, réserve
  //     sous la visée), jamais avec une garde ni « je garde », et l'écart dit est reps − reps visées ; « Sur cette barre, je vise N » seulement si le plancher de
  //     la barre (recalculé : `familleDeLExercice`) relève la table de la zone (`reserveVisee`), N = la visée affichée.
  function verifierCapacite(plan, entrees, erreurs) {
    var M = Moteur();
    var suites = entrees && entrees.suites ? entrees.suites : {};
    var precedents = entrees && entrees.precedents ? entrees.precedents : {};
    var norm = function (t) { return String(t || '').replace(/[\u00a0\u202f]/g, ' '); };
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var k = x.consigne;
      var f = k && k.fondement ? k.fondement : null;
      var protege = plan.protegee === true;
      // Les reps de la dernière série de travail à `charge` de la séance des entrées, si c'est celle d'où repart la consigne (`fondement.date`).
      var repsDesEntrees = function (charge) {
        var pr = Object.prototype.hasOwnProperty.call(precedents, x.slug) ? precedents[x.slug] : null;
        if (!pr || !pr.seance || !f || !f.date || Date.parse(pr.seance.debut) !== Date.parse(f.date)) return null;
        var ss = (pr.series || []).filter(function (s) { return s && racine.THModele.estTravail(s) && !racine.THModele.estRecul(s) && nombre(s.charge_kg) !== null && Math.abs(nombre(s.charge_kg) - nombre(charge)) < 1e-6; });
        return ss.length ? nombre(ss[ss.length - 1].reps) : null;
      };
      var juger = function (quoi, charge, reps, reserve, vise, visee, hors) {
        var rE = repsDesEntrees(charge);
        if (rE !== null && rE !== nombre(reps)) erreurs.push('I252 bis' + nom + 'la ' + quoi + ' lit ' + reps + ' reps, la séance des entrées en a ' + rE + ' à ' + charge + ' kg');
        var exclu = protege || hors === 'apres_zero' || hors === 'reprise_longue';
        if (!exclu && M.capaciteTenue({ reps: rE !== null ? rE : reps, reserve: reserve, vise: vise, visee: visee })) {
          erreurs.push('I252' + nom + 'une ' + quoi + ' « sans marge » sur ' + charge + ' kg × ' + reps + ' (' + reserve + ' en réserve) : la capacité visée (' + vise + ' + ' + visee + ') est tenue');
        }
      };
      var ev = f && f.effortVise ? f.effortVise : null;
      if (ev && ev.effet === 'garde') {
        var z = M.zoneParCle(k.zone);
        // Une consigne figée avant la règle n'a pas `vise` : le haut de la zone en tient lieu (le repli du moteur).
        var vise = ev.vise !== undefined ? nombre(ev.vise) : (z ? z.haut : null);
        // 26/11/2026 : plus de borne `vise > z.haut` (I252 relâché) : `vise` est la ligne de la consigne REÇUE, qui peut dépasser le haut de la zone (etirement, zero_rep, tenue_apres_chute, retour_jour_sans).
        if (ev.protegee === true && !protege) erreurs.push('I252' + nom + 'une garde dite « protégée » hors population protégée');
        juger('garde', ev.charge, ev.reps, ev.reserve, vise, ev.visee, ev.horsCapacite);
      }
      var bd = f && f.bord && k.etat === 'bord_garde' && f.bord.reserve !== undefined && f.bord.capacite ? f.bord : null;
      if (bd) juger('garde de bord', bd.charge, bd.reps, bd.reserve, bd.capacite.vise, bd.capacite.visee, bd.capacite.horsCapacite);
      var phrase = x.effortVise && typeof x.effortVise.phrase === 'string' ? norm(x.effortVise.phrase) : '';
      if (/de plus que prévu/.test(phrase)) {
        var su = Object.prototype.hasOwnProperty.call(suites, x.slug) ? suites[x.slug] : null;
        var kS = su && su.consigne ? su.consigne : null;
        var cap = kS && kS.fondement ? kS.fondement.capacite : null;
        var evS = kS && kS.fondement ? kS.fondement.effortVise : null;
        if (!cap || !(cap.reserve < cap.visee) || !M.capaciteTenue({ reps: cap.reps, reserve: cap.reserve, vise: cap.vise, visee: cap.visee })) {
          erreurs.push('I254' + nom + '« de plus que prévu » sans capacité tenue sous la visée : ' + phrase);
        } else {
          var m = /× (\d+)[^:]*: (\d+) de plus que prévu/.exec(phrase);
          if (!m || nombre(m[1]) - nombre(m[2]) !== nombre(cap.vise)) erreurs.push('I254' + nom + 'l’écart dit n’est pas reps − reps visées (' + cap.vise + ') : ' + phrase);
        }
        if (evS && evS.effet === 'garde') erreurs.push('I254' + nom + '« de plus que prévu » avec une garde');
        if (/je garde/i.test(phrase)) erreurs.push('I254' + nom + '« de plus que prévu » avec « je garde » : ' + phrase);
        var pb = M.plancherDeBarre(familleDeLExercice(entrees, x.slug));
        var table = kS ? M.reserveVisee({ zone: kS.zone, role: 'ligne', reglage: plan.reglage }) : null;
        var barreDue = !!cap && pb !== null && table !== null && pb > table && cap.reserve < cap.visee;
        var mb = /Sur cette barre, je vise (\d+) en réserve/.exec(phrase);
        if (!!mb !== barreDue) erreurs.push('I254' + nom + '« Sur cette barre » ' + (mb ? 'dit' : 'tu') + ' (plancher ' + pb + ', table ' + table + ')');
        if (mb && cap && nombre(mb[1]) !== nombre(cap.visee)) erreurs.push('I254' + nom + '« je vise ' + mb[1] + ' », la visée affichée est ' + cap.visee);
      }
    });
  }
  function verifierEffortVise(plan, entrees, erreurs) {
    var xs = (plan && plan.exercices) || [];
    xs.forEach(function (x, i) {
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var rv = x.reserveAffichee === undefined ? null : x.reserveAffichee;
      var rvT = x.reserveVisee === undefined ? null : x.reserveVisee;
      if (rv === null) {
        if (x.effortVise) erreurs.push('I56' + nom + 'un effort visé sans réserve visée');
      } else {
        if (!aUnPari(x)) erreurs.push('I56' + nom + 'une réserve visée sans pari');
        if (plan.edition) erreurs.push('I56' + nom + 'une réserve visée en Édition');
        // Lot F, A1 (I241) — la barre recalculée depuis le catalogue des entrées (`familleDeLExercice`), jamais lue sur le plan.
        var attendu = x.consigne ? Moteur().reserveAffichee({ zone: x.consigne.zone, role: roleDeLaVisee(x), reglage: plan.reglage, protegee: plan.protegee === true, repriseLongue: Moteur().enRepriseLongue(x.consigne),
          famille: familleDeLExercice(entrees, x.slug) }) : null;
        var attenduT = x.consigne ? Moteur().reserveVisee({ zone: x.consigne.zone, role: roleDeLaVisee(x), reglage: plan.reglage }) : null;
        if (rv !== attendu) erreurs.push('I56' + nom + 'la réserve visée affichée est ' + rv + ', la règle donne ' + attendu);
        if (rvT !== attenduT) erreurs.push('I56' + nom + 'la table de la réserve visée est ' + rvT + ', la table donne ' + attenduT);
        var exos = entrees && entrees.seance && entrees.seance.exercices ? entrees.seance.exercices : null;
        // 221 — dans un bloc Hypertrophie à grosse série, le plan lit les séries suivantes comme des reculs : l'invariant fait de même.
        var exoI = exos ? exos[i] : null;
        if (exoI && x.blocHypertrophie && x.blocHypertrophie.grosse) {
          exoI = Object.assign({}, exoI, { series: Moteur().seriesEnGrosseEtReculs(exoI.series, { grosse: true }) });
        }
        if (x.effortVise && exos && x.effortVise.serie !== derniereSerieDeTravail(exoI)) {
          erreurs.push('I56' + nom + 'l’effort visé sur la série ' + x.effortVise.serie + ', pas sur la dernière série de travail');
        }
      }
      var f = x.consigne && x.consigne.fondement ? x.consigne.fondement : null;
      var ev = f && f.effortVise ? f.effortVise : null;
      if (ev) {
        if (ev.effet === 'test') {
          if (nombre(ev.charge) === null || nombre(ev.reps) === null || nombre(ev.reserve) === null || nombre(ev.visee) === null) {
            erreurs.push('I57' + nom + 'un test par la réserve sans sa série ou sa réserve dans le fondement');
          } else if (ev.sortie !== true && !Moteur().reserveAtteintLeSeuil(ev.reserve, ev.viseeTable !== undefined ? ev.viseeTable : ev.visee, { reglage: plan.reglage })) {
            // PR 4a — le test se déclenche sur la TABLE, jamais sur le plancher.
            erreurs.push('I57' + nom + 'un test par la réserve avec ' + ev.reserve + ' en réserve pour ' + (ev.viseeTable !== undefined ? ev.viseeTable : ev.visee) + ' visées (table)');
          }
          if (x.consigne.etat !== 'test_propose') erreurs.push('I57' + nom + 'un test par la réserve dans l’état « ' + x.consigne.etat + ' »');
        } else if (ev.effet === 'garde') {
          if (!(ev.reserve < ev.visee)) erreurs.push('I58' + nom + 'une montée retenue avec ' + ev.reserve + ' en réserve pour ' + ev.visee + ' visées');
          if (x.consigne.haut || ETATS_TEST_PLAN[x.consigne.etat] === true) erreurs.push('I58' + nom + 'une montée ouverte malgré une réserve sous la visée');
        } else {
          erreurs.push('I57' + nom + 'un effet « ' + ev.effet + ' » inconnu');
        }
      }
      // I234 (« Une seule garde », C-2, MOTEUR §9.26) — la réponse de réserve ne vaut « facile » (double cran) que 2 au-dessus de la visée AFFICHÉE
      // (`ev.visee`, le plancher des populations protégées) : « il t'en restait 2 : c'est ce que je visais » n'est pas « facile ».
      if (ev && ev.preuveFacile === true && nombre(ev.reserve) !== null && nombre(ev.visee) !== null && !Moteur().reserveAtteintLeSeuil(ev.reserve, ev.visee, { reglage: plan.reglage })) {
        erreurs.push('I234' + nom + 'une preuve « facile » tirée de ' + ev.reserve + ' en réserve pour une visée affichée de ' + ev.visee);
      }
      // I233 (C-1) est RETIRÉ (20/11/2026, « Au max » disparaît) : il n'y a plus de réserve demandée ; la capacité tenue (I252) le remplace.
      // 169 — I62 : la garde au haut de la zone ne dure qu'UNE séance (une garde est « première fois », une sortie est
      // « deuxième fois » et pose un test d'un cran) ; I63 : les puces et « garde-en N » n'existent que si la règle peut
      // jouer (ni poids du corps, ni aide) ; I64 : la visée et la charge du fondement sont celles de la table et du palier.
      if (ev && ev.effet === 'garde' && ev.auHaut === true && ev.deja !== false) {
        erreurs.push('I62' + nom + 'une garde au haut de la zone alors que la séance d’avant avait déjà gardé');
      }
      if (ev && ev.sortie === true) {
        if (ev.effet !== 'test' || ev.deja !== true) erreurs.push('I62' + nom + 'une sortie qui n’est pas un test posé après une première garde');
        if (x.consigne && x.consigne.fondement && x.consigne.fondement.preuve) erreurs.push('I62' + nom + 'une sortie en double cran');
        if (x.consigne && x.consigne.haut && x.consigne.ligne && !(x.consigne.haut.charge === null || x.consigne.haut.charge > x.consigne.ligne.charge)) {
          erreurs.push('I62' + nom + 'une sortie dont le test n’est pas au-dessus de la ligne');
        }
      }
      if ((x.effortVise || rv !== null) && !(x.consigne && Moteur().effortViseEligible(x.consigne.palier))) {
        erreurs.push('I63' + nom + 'des puces ou une réserve visée sur un exercice où la règle ne joue pas (palier ' + (x.consigne ? x.consigne.palier : null) + ')');
      }
      if (ev && x.consigne) {
        var tableLigne = Moteur().reserveVisee({ zone: x.consigne.zone, role: 'ligne', reglage: plan.reglage });
        // PR 4a — une consigne figée avant le plancher n'a ni `protegee` ni `viseeTable` (sa visée est la table) : seule une consigne qui les porte se compare.
        var protegeeEv = ev.protegee === true;
        var familleEv = familleDeLExercice(entrees, x.slug);
        var afficheeLigne = Moteur().reserveAffichee({ zone: x.consigne.zone, role: 'ligne', reglage: plan.reglage, protegee: protegeeEv, repriseLongue: Moteur().enRepriseLongue(x.consigne), famille: familleEv });
        // Lot F, A1 (I241) — une consigne figée avant le plancher de barre porte l'affichée SANS la barre : admise (le patron de la tolérance d'I235 R1).
        var afficheeSansBarre = Moteur().reserveAffichee({ zone: x.consigne.zone, role: 'ligne', reglage: plan.reglage, protegee: protegeeEv, repriseLongue: Moteur().enRepriseLongue(x.consigne) });
        if (ev.visee !== afficheeLigne && ev.visee !== afficheeSansBarre && !(plan.protegee === true && !protegeeEv && ev.visee === tableLigne)) {
          erreurs.push('I64' + nom + 'la visée du fondement est ' + ev.visee + ', la règle donne ' + afficheeLigne);
        }
        // Lot F, A1 — `viseeTable` s'écrit dès que l'affichée diffère de la table (protégée, barre, reprise longue) : quand elle est écrite, c'est la table.
        if ((protegeeEv || ev.viseeTable !== undefined) && ev.viseeTable !== tableLigne) erreurs.push('I64' + nom + 'la table du fondement est ' + ev.viseeTable + ', la table donne ' + tableLigne);
        if (nombre(ev.charge) !== nombre(x.consigne.palier)) erreurs.push('I64' + nom + 'l’effort visé porte ' + ev.charge + ' kg, le palier est ' + x.consigne.palier);
      }
      // PR 4a (§9.26 bis) — I160 : le plancher. Population protégée : aucune réserve visée affichée sous 2 sur une ligne qui n'est pas de test, aucune sur
      // une ligne de test (donc aucune question de réserve, C3) ; `plan.protegee` est le prédicat unique ; hors population, l'affichée est la table.
      var protegeP = plan.protegee === true;
      if (entrees && plan.protegee !== Moteur().populationProtegee({ plus65: entrees && entrees.plus65 === true, debutant: plan.debutant === true, objectif: plan.objectif })) {
        erreurs.push('I160' + nom + 'plan.protegee n’est pas la population protégée des entrées');
      }
      if (protegeP) {
        if (rv !== null && roleDeLaVisee(x) !== 'test' && rv < Moteur().RESERVE_PLANCHER) erreurs.push('I160' + nom + 'une réserve visée de ' + rv + ' pour la population protégée (plancher ' + Moteur().RESERVE_PLANCHER + ')');
        if (x.consigne && roleDeLaVisee(x) === 'test' && (rv !== null || x.effortVise || x.questionReserve)) erreurs.push('I160' + nom + 'une réserve affichée ou une question sur la ligne de test d’une population protégée');
      } else if (rv !== rvT && !(Moteur().enRepriseLongue(x.consigne) && rv !== null && rv >= Moteur().RESERVE_PLANCHER) &&
                 !(rv !== null && rv === Moteur().plancherDeReserve(rvT, false, familleDeLExercice(entrees, x.slug)))) {
        // Lot F, A1 (I241) — hors population : la table, ou la table relevée au plancher de la barre.
        erreurs.push('I160' + nom + 'hors population protégée, la réserve affichée (' + rv + ') n’est pas la table (' + rvT + ')');
      }
      // I206 (16/11/2026, MOTEUR §9.9) — la séance de reprise longue de CET exercice : la réserve affichée n'est jamais sous le plancher, quel que soit le réglage.
      if (rv !== null && Moteur().enRepriseLongue(x.consigne) && rv < Moteur().RESERVE_PLANCHER) {
        erreurs.push('I206' + nom + 'une réserve visée de ' + rv + ' à la séance de reprise longue (plancher ' + Moteur().RESERVE_PLANCHER + ')');
      }
      if (ev && ev.protegee !== undefined && ev.protegee !== protegeP) erreurs.push('I160' + nom + 'le fondement dit protegee=' + ev.protegee + ', le plan ' + protegeP);
      // I161 — le test se déclenche sur la TABLE ; « Au-dessus de ce que je visais » seulement si R > la visée affichée, « c'est ce que je visais » si R = elle.
      // Lu sur ce que l'écran lit (`x.effortVise` : la réponse, la visée, la phrase de la suite).
      var evx = x.effortVise;
      if (evx && evx.effet === 'test' && nombre(evx.reponse) !== null && nombre(evx.visee) !== null) {
        var phrE = evx.phrase ? String(evx.phrase) : '';
        if (rvT !== null && !Moteur().reserveAtteintLeSeuil(evx.reponse, rvT, { reglage: plan.reglage }) && !/Deux fois|au haut de ta zone/.test(phrE)) {
          erreurs.push('I161' + nom + 'un test avec ' + evx.reponse + ' en réserve pour une table de ' + rvT);
        }
        if (/Au-dessus de ce que je visais/.test(phrE) && !(evx.reponse > evx.visee)) erreurs.push('I161' + nom + '« Au-dessus de ce que je visais » pour ' + evx.reponse + ' en réserve et une visée de ' + evx.visee);
        if (/c.est ce que je visais/.test(phrE) && evx.reponse !== evx.visee) erreurs.push('I161' + nom + '« c’est ce que je visais » pour ' + evx.reponse + ' en réserve et une visée de ' + evx.visee);
      }
      if (x.effortVise && x.effortVise.effet === 'garde' && x.effortVise.reponse !== null && x.effortVise.reponse >= x.reserveAffichee) {
        erreurs.push('I58' + nom + 'une garde pour une réserve de ' + x.effortVise.reponse + ' (visée ' + x.reserveAffichee + ')');
      }
    });
  }
  // I66 (MOTEUR §14.5, §14.7, 174) — LA 4e MARCHE NE PROPOSE JAMAIS PLUS : ni plus de séries ni plus de charge que la séance d'avant
  // (la routine, le palier), jamais une ligne haute, jamais pendant une semaine allégée ; une série de moins retire vraiment une
  // série ; la charge d'un cran plus bas / de P x 0,95 est strictement sous le palier ; « une série de moins » ne s'applique ni
  // en zone force (elle y change la charge) ni sous 3 séries, « la charge » ni en zone muscle ni au poids du corps.
  function verifierAlleger(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x.consigne;
      var m = x.escalier && x.escalier.marche === M.MARCHE_ALLEGER ? x.escalier : null;
      var a = (k && k.alleger) || (m && m.carte ? m.alleger : null);
      if (!a) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var e = function (t) { erreurs.push('I66' + nom + t); };
      var P = k ? nombre(k.palier) : null;
      var mode = a.mode;
      var routine = nombre(a.routine), series = nombre(a.series);
      if (plan.allegee) e('une marche « alléger » pendant une semaine allégée');
      if (routine === null || series === null || series > routine) e('plus de séries (' + series + ') que la routine (' + routine + ')');
      if (mode === 'serie') {
        if (series >= routine) e('une série de moins qui n\'en retire aucune');
        if (routine < 3) e('une série de moins sous 3 séries');
        if (k && P !== null && P > 0 && M.zoneParCle(k.zone) && M.zoneParCle(k.zone).haut <= 5) e('une série de moins en zone force');
        if (nombre(a.charge) !== null) e('une série de moins qui change la charge');
      } else if (mode === 'cran' || mode === 'force') {
        var ch = nombre(a.charge);
        if (P === null || P <= 0) e('une charge allégée sur un palier de ' + P + ' kg');
        else if (ch === null || ch >= P - 1e-9) e('une charge allégée (' + ch + ' kg) pas sous le palier (' + P + ' kg)');
        var z = k ? M.zoneParCle(k.zone) : null;
        if (z && mode === 'force' && z.haut > 5) e('la charge allégée en zone muscle (' + k.zone + ')');
        if (z && mode === 'cran' && (z.haut <= 5 || routine >= 3)) e('un cran de moins hors du cas « zone muscle, 2 séries ou moins »');
      } else {
        e('un mode « ' + mode + ' » inconnu');
      }
      if (k && k.alleger) {
        if (k.haut) e('une ligne haute sur une consigne allégée');
        if (k.ligne && P !== null && nombre(k.ligne.charge) !== null && nombre(k.ligne.charge) > P + 1e-9) {
          e('la ligne (' + k.ligne.charge + ' kg) au-dessus du palier (' + P + ' kg)');
        }
        (x.planInitial || []).forEach(function (q, j) { if (q && q.role === 'haut') e('la ligne ' + j + ' est un test'); });
      }
    });
  }

  // I65 (MOTEUR §9.1.2, 174) — LA RÈGLE DE BORD QUI RECULE : une consigne de bord après une séance ratée (des reps faites
  // sous les reps visées) ne propose jamais plus que le palier de cette séance, et vise les reps VISÉES, pas les faites ;
  // une vague (trois séances sans monter) repart sous le palier. Le fondement `bord` ne dit que ce qu'il sait : un recul
  // porte `faites < visees`, une garde garde le palier, une vague baisse.
  function verifierBord(plan, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x.consigne;
      if (!k || !k.ligne) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var b = k.fondement ? k.fondement.bord : null;
      var P = nombre(k.palier), c = nombre(k.ligne.charge);
      // 179 — une semaine allégée porte sa propre ligne (la phrase du recul n'y est pas dite) : elle ne se compare pas aux visées.
      if (k.etat === 'bord_recul' && !k.allegee) {
        if (!b || !(nombre(b.faites) < nombre(b.visees))) erreurs.push('I65' + nom + 'un recul sans barre ratée dans le fondement');
        // 179 (A-F-05) — « aux mêmes reps » est le nombre que la ligne affiche : les reps visées, ou, quand une charge faite à fond
        // en borne la rep de plus, `bord.vise` (jamais au-dessus des visées), que la phrase dit alors elle-même.
        else if (nombre(k.ligne.vise) !== nombre(b.vise !== undefined && b.vise !== null ? b.vise : b.visees) ||
                 (b.vise !== undefined && b.vise !== null && !(nombre(b.vise) <= nombre(b.visees)))) {
          erreurs.push('I65' + nom + 'un recul qui vise ' + k.ligne.vise + ' reps, la consigne reçue en visait ' + b.visees +
            (b.vise !== undefined && b.vise !== null ? ' (bornée à ' + b.vise + ')' : ''));
        }
        if (c !== null && P !== null && c > P) erreurs.push('I65' + nom + 'un recul à ' + c + ' kg, au-dessus du palier ' + P + ' kg');
      }
      if (k.etat === 'bord_vague' && c !== null && P !== null && c > P) {
        erreurs.push('I65' + nom + 'une vague à ' + c + ' kg au-dessus du palier ' + P + ' kg');
      }
      if (k.etat === 'bord_garde' && c !== null && P !== null && c !== P) {
        erreurs.push('I65' + nom + 'une garde à ' + c + ' kg, le palier est ' + P + ' kg');
      }
    });
    verifierBordSchema(plan, erreurs);
    verifierBordUneSeance(plan, erreurs);
  }

  // I152 (chantier « première séance sûre », PR 2, MOTEUR §9.1.2) — AUCUNE MONTÉE DE BORD SUR UNE HISTOIRE D'UNE SEULE SÉANCE LUE. Le fait relu est
  // `_lues` de la consigne (le nombre de séances que la règle de bord a lues, `lecture.toutes`, celui qui pilote la règle — pas les séances du
  // couple, que 180 peut réduire à une) : à 1, la consigne n'est jamais `bord` (la montée) ; la garde « unique » vaut ssi la règle a lu UNE
  // séance, garde la charge du palier, aux reps faites, sans ligne haute.
  function verifierBordUneSeance(plan, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      if (!k || !k.fondement) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var lues = k._lues, b = k.fondement.bord;   // `_lues` : non énumérable, posé par la règle de bord (absent d'une copie : rien n'est alors jugé)
      if (k.etat === 'bord' && lues === 1) erreurs.push('I152' + nom + 'une montée de bord sur une histoire d’une seule séance lue');
      // I240 (lot E, A2, 20/11/2026, MOTEUR §9.1.2 et §9.8) — EN PRUDENT, aucune montée de bord sans une séance lue d'avant au même palier, non ratée
      // (`_confirmee`, posé par la règle : le palier de la séance d'avant, l'état de la consigne qu'a reçue la dernière) ; la garde de confirmation
      // n'existe qu'en Prudent, garde le palier aux reps faites, sans ligne haute.
      if (k.etat === 'bord' && plan.reglage === 'prudent' && lues !== undefined) {
        var cf = k._confirmee;
        if (!cf || nombre(cf.palier) === null || !Moteur().memeCharge(nombre(cf.palier), nombre(k.palier)) || cf.etat === 'bord_recul' || cf.etat === 'bord_vague') {
          erreurs.push('I240' + nom + 'une montée de bord en « Me ménager » sans une séance d’avant au même palier, non ratée');
        }
      }
      if (b && b.confirmation === true) {
        if (k.etat !== 'bord_garde' || plan.reglage !== 'prudent') erreurs.push('I240' + nom + 'une garde de confirmation hors de « Me ménager » (' + k.etat + ', ' + plan.reglage + ')');
        if (!k.ligne || nombre(k.ligne.charge) !== nombre(k.palier) || nombre(k.ligne.vise) !== nombre(b.reps) || k.haut) {
          erreurs.push('I240' + nom + 'une garde de confirmation qui ne garde pas le palier aux reps faites, sans ligne haute');
        }
      }
      if (b && b.unique === true) {
        if (k.etat !== 'bord_garde') erreurs.push('I152' + nom + 'une garde « unique » sur un état ' + k.etat);
        if (lues !== undefined && lues !== 1) erreurs.push('I152' + nom + 'une garde « unique » sur ' + lues + ' séances lues (une seule attendue)');
        if (!k.ligne || nombre(k.ligne.charge) !== nombre(k.palier) || nombre(k.ligne.vise) !== nombre(b.reps) || k.haut) {
          erreurs.push('I152' + nom + 'une garde « unique » qui ne garde pas le palier aux reps faites, sans ligne haute');
        }
      }
    });
  }

  // I165 (chantier « Les mots disent vrai », PR 1, MOTEUR §9.43) — LA DÉCHARGE DIT CE QU'ELLE FAIT, ET RIEN D'AUTRE.
  //   · jamais « N … au lieu de N » (séries, cibles) ;
  //   · une clause de séries (« 2 séries au lieu de 3 ») seulement si la routine est connue et que les deux nombres diffèrent ;
  //   · « cet exercice ne change pas » si et seulement si séries, reps et charge sont ceux de la consigne normale ;
  //   · la clause des cibles (« 52,5 kg × 6 au lieu de 52,5 kg × 8 ») au « Pourquoi » seulement si les deux cibles diffèrent ;
  //   · aucun « mêmes charges », « 2 reps de moins », « loin de l'échec », « Rien ne monte », « cette semaine » ni « semaine allégée » dans un
  //     texte affiché — le gris, le « Pourquoi », les bandeaux, la carte, son bouton, et les textes fixes (`Moteur.textesFixesDeLaDecharge`).
  var BANNIS_DECHARGE = /semaines?\s+allégées?|mêmes\s+charges|reps?\s+de\s+moins|loin\s+de\s+l[’']échec|rien\s+ne\s+monte|cette\s+semaine/i;
  function verifierDecharge(plan, erreurs) {
    var M = Moteur();
    var nombres = function (t) { return (String(t).match(/\d+(?:,\d+)?/g) || []).join('|'); };
    var texte = function (ou, t) {
      if (typeof t !== 'string' || !t) return;
      var m = BANNIS_DECHARGE.exec(t);
      if (m) erreurs.push('I165 — ' + ou + ' : « ' + m[0] + ' » dans un texte de décharge');
      var re = /([^.]*?)\s+au\s+lieu\s+de\s+([^.]*)/g, q;
      while ((q = re.exec(t))) {
        var gauche = q[1].split(/\s:\s|\u00a0:\s/).pop();
        if (nombres(gauche) !== '' && nombres(gauche) === nombres(q[2])) erreurs.push('I165 — ' + ou + ' : « ' + gauche.trim() + ' au lieu de ' + q[2].trim() + ' », deux nombres égaux');
      }
    };
    M.textesFixesDeLaDecharge().forEach(function (t, i) { texte('texte fixe ' + i, t); });
    if (plan && plan.allegee) texte('le bandeau', plan.allegee.bandeau);
    if (plan && plan.carte && plan.carte.oui === M.libelleAlleger()) texte('la carte', plan.carte.detail);
    if (plan && plan.carte) texte('le bouton de la carte', plan.carte.oui);
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne, a = k && k.allegee;
      if (!a) return;
      var nom = 'exercice ' + i + ' (' + x.slug + ')';
      var gris = x.entete && typeof x.entete.gris === 'string' ? x.entete.gris : '';
      var pq = x.pourquoi && typeof x.pourquoi.etat === 'string' ? x.pourquoi.etat : '';
      // 21/11/2026 (« Simplifier », décision 5) — la forme COURTE que l'en-tête affiche : le moteur l'écrit, I165 la vérifie comme le gris (elle ne dit plus la semaine, le bandeau la dit).
      var court = x.entete && typeof x.entete.court === 'string' ? x.entete.court : '';
      texte(nom + ', le gris', gris);
      texte(nom + ', la tête', court);
      if (court && /\bsemaine\b/i.test(court)) erreurs.push('I165 — ' + nom + ', la tête dit la semaine (« ' + court + ' ») : elle est au bandeau de la séance');
      texte(nom + ', le « Pourquoi »', pq);
      var connue = a.routine !== null && a.routine !== undefined;
      var base = connue ? a.routine : nombre(a.base);
      var retirees = base !== null && a.series < base;
      var avant = a.avant || null, l = k.ligne || null;
      // PR 3 (N6) — UNE fonction dit « les cibles diffèrent » : `Moteur.ciblesDifferent` (reps OU charge), lue par le texte et par ici.
      var cibles = M.ciblesDifferent(k);
      var sans = base !== null && a.series === base && !cibles;
      [['le gris', gris], ['la tête', court], ['le « Pourquoi »', pq]].forEach(function (p) {
        if (!p[1]) return;
        if (/\bséries?\s+au\s+lieu\s+de\b/.test(p[1]) !== (connue && retirees)) erreurs.push('I165 — ' + nom + ', ' + p[0] + ' : ' + (connue && retirees ? 'la clause des séries manque' : 'une clause de séries sans routine connue ou sans séries retirées'));
        if (/\b\d+\s+séries?\b/.test(p[1]) !== retirees) erreurs.push('I165 — ' + nom + ', ' + p[0] + ' : ' + (retirees ? 'le nombre de séries gardées manque' : 'un nombre de séries alors que rien n\u2019est retiré'));
        if (/ne\s+change\s+pas/.test(p[1]) !== sans) erreurs.push('I165 — ' + nom + ', ' + p[0] + ' : « cet exercice ne change pas » ' + (sans ? 'manque alors que rien ne change' : 'alors que quelque chose change'));
        if (!/^Décharge\b/.test(p[1]) && (p[0] === 'le gris' || p[0] === 'la tête')) erreurs.push('I165 — ' + nom + ', ' + p[0] + ' ne nomme pas « Décharge »');
      });
      var dit = false;
      if (pq) {
        dit = /kg\s*×\s*[^.]*\s+au\s+lieu\s+de\s+/.test(pq) || /×\s*\d+\s+au\s+lieu\s+de\s+/.test(pq) || /\d\s+reps?\s+au\s+lieu\s+de\s+/.test(pq);
        if (dit !== cibles && !(dit && !l)) erreurs.push('I165 — ' + nom + ', le « Pourquoi » : la clause des cibles ' + (cibles ? 'manque' : 'alors que les deux cibles sont égales'));
      }
      // I166 (PR 3, MOTEUR §9.45) — LA CHARGE DE LA DÉCHARGE NE DÉPASSE NI LE PALIER NI CELLE D'AVANT. Arithmétique à part, jamais relue de
      // `consigneAllegee` : le sens est celui du moteur (une aide est codée négative : −25 est plus léger que −22,5), `null` n'est jamais
      // comparé (en JS `125 > null` vaut vrai), et le palier d'une autre zone (nouvelle zone, report) ne plafonne rien.
      if (l && avant) {
        var lc = nombre(l.charge), ac = nombre(avant.charge), v1 = nombre(l.vise), v0 = nombre(avant.vise);
        var pal = k.etat === 'nouvelle_zone' || (k.fondement && k.fondement.report) ? null : nombre(k.palier);
        var memeC = function (x, y) { return Math.abs(x - y) < 1e-9; };
        if (pal !== null && lc === null) erreurs.push('I166 — ' + nom + ' : une décharge sans charge alors que le palier est ' + pal + ' kg');
        if (pal !== null && lc !== null && lc > pal && !memeC(lc, pal)) erreurs.push('I166 — ' + nom + ' : une décharge à ' + lc + ' kg, au-dessus du palier ' + pal + ' kg');
        if (lc !== null && ac !== null && lc > ac && !memeC(lc, ac)) erreurs.push('I166 — ' + nom + ' : une décharge à ' + lc + ' kg, plus lourde que la consigne normale (' + ac + ' kg)');
        var chargeChange = lc !== null && ac !== null && !memeC(lc, ac);
        if (pq && chargeChange && !dit) erreurs.push('I166 — ' + nom + ' : la charge change (' + ac + ' → ' + lc + ' kg), le « Pourquoi » ne le dit pas');
        var baisse = (v0 !== null && v1 !== null && v1 < v0) || (lc !== null && ac !== null && lc < ac && !memeC(lc, ac));
        if (pq && /avec\s+de\s+la\s+marge/.test(pq) !== baisse) erreurs.push('I166 — ' + nom + ', le « Pourquoi » : « avec de la marge » ' + (baisse ? 'manque alors qu\u2019une cible baisse' : 'alors qu\u2019aucune cible ne baisse'));
        if (/avec\s+de\s+la\s+marge/.test(gris)) erreurs.push('I166 — ' + nom + ', le gris : « avec de la marge » n\u2019y a pas sa place');
        if (!(l.vise === null || l.vise === undefined) && v1 !== null && v0 !== null && v1 > v0) erreurs.push('I166 — ' + nom + ' : une décharge à plus de reps (' + v1 + ') que la consigne normale (' + v0 + ')');
      }
    });
    // Le bandeau : « avec de la marge » seulement si une cible baisse quelque part (ou si rien n'est chiffré : phrase générale).
    var bandeau = plan && plan.allegee && typeof plan.allegee.bandeau === 'string' ? plan.allegee.bandeau : '';
    if (bandeau) {
      var chiffrees = ((plan && plan.exercices) || []).filter(function (x) { return x && x.consigne && x.consigne.allegee && x.consigne.ligne && x.consigne.allegee.avant; });
      var quelqueBaisse = chiffrees.some(function (x) {
        var a2 = x.consigne.allegee, l2 = x.consigne.ligne, w0 = nombre(a2.avant.vise), w1 = nombre(l2.vise), d0 = nombre(a2.avant.charge), d1 = nombre(l2.charge);
        return (w0 !== null && w1 !== null && w1 < w0) || (d0 !== null && d1 !== null && d1 < d0 - 1e-9);
      });
      if (/avec\s+de\s+la\s+marge/i.test(bandeau) !== (quelqueBaisse || !chiffrees.length)) erreurs.push('I166 — le bandeau : « avec de la marge » ' + (quelqueBaisse ? 'manque alors qu\u2019une cible baisse' : 'alors qu\u2019aucune cible ne baisse'));
    }
  }

  // I162 (chantier « Les mots disent vrai », PR 4a, MOTEUR §9.47) — LE VERBE DE LA CONSIGNE NE CONTREDIT JAMAIS LE CHIFFRE, ET LES TROIS CHAMPS LE DISENT.
  //   Sens 1 : le verbe suit la LIGNE (arithmétique à part de `Moteur.verbeDeLaConsigne`, jamais relue de lui) : sur l'axe de la charge d'abord, sur
  //     l'axe des reps seulement à charge égale ; une aide, un élastique, une variante du jour : `neutre` (exclus, listés au MOTEUR §9.47).
  //   Sens 2 : le TEXTE du gris, du Pourquoi et du constat (jamais `x.verbe`, ce serait tautologique) ne dit que ce que le verbe fait : « N reps de plus »
  //     seulement si la ligne monte de N reps, « tu restes à C × R » seulement si elle garde, « je garde C kg » à la charge de la ligne, « je baisse à »
  //     devant une charge plus légère, la cause « sans marge » seulement si le verbe la rend vraie ; une négation (« sans rep de plus ») jamais devant
  //     une ligne qui monte. Population protégée : jamais « sans marge » ni « il ne t'en restait aucune ».
  //   Sens 3 : la cause « sans marge » n'est jamais imprimée devant une ligne qui monte ; le cas existe (`Plan.causesTues`) et se COMPTE (dette
  //     « Le coach monte et recule » : une série à fond, une ligne qui monte quand même).
  var CAUSE_SANS_MARGE = /(?:la dernière|une série|une de tes séries) sans marge|(?:dernière série|séries?) (?:était|étaient) sans marge|il ne t[’']en restait aucune/;
  function verifierVerbe(plan, erreurs) {
    var M = Moteur();
    var memeC = function (x, y) { return Math.abs(x - y) < 1e-9; };
    var norm = function (t) { return String(t || '').replace(/[  ]/g, ' '); };
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      if (!k || k.etat === 'silence' && !k.ligne) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var v = x.verbe;
      if (!v || typeof v.verbe !== 'string') { erreurs.push('I162' + nom + 'aucun verbe sur la consigne finale'); return; }
      var fond = k.fondement || {};
      var l = k.ligne || null;
      var P = nombre(k.palier), niv = nombre(k.niveau);
      var ch = l ? nombre(l.charge) : null, vise = l ? nombre(l.vise) : null;
      // — Sens 1 —
      if (k.allegee || k.repli || k.alleger) {
        var attendu = k.allegee ? 'allege' : k.repli ? 'repli' : 'alleger';
        if (v.verbe !== attendu) erreurs.push('I162' + nom + 'une consigne ' + attendu + ' dit « ' + v.verbe + ' »');
      } else if (k.veilleLegere || k.plusLegere) {
        if (v.verbe !== 'neutre') erreurs.push('I162' + nom + 'une variante du jour dit « ' + v.verbe + ' »');
      } else if (!l || ch === null || P === null) {
        if (v.verbe !== 'neutre' && v.verbe !== 'garde_charge') erreurs.push('I162' + nom + 'sans ligne chiffrée, le verbe est « ' + v.verbe + ' »');
      } else {
        var elastique = P < 0 || ch < 0 || !!(fond.salle && (fond.salle.sens === 'aide' || fond.salle.sens === 'resistance')) || !!fond.elastique;
        var refCharge = k.etat === 'zero_rep' && fond.zeroRep && nombre(fond.zeroRep.charge) !== null ? nombre(fond.zeroRep.charge) : P;
        var meme = memeC(ch, refCharge);
        var simple = (k.etat === 'progression' && !(fond.effortVise && fond.effortVise.effet === 'garde')) ||
                     k.etat === 'tenue_apres_chute' || (k.etat === 'etirement_reps' && !fond.plafondReps) ||
                     k.etat === 'reprise_courte' || k.etat === 'reprise_longue';
        var dit = v.verbe;
        if (!meme) {
          if (!elastique && ch < refCharge && (simple || k.etat === 'zero_rep' || k.etat === 'bord_recul' || k.etat === 'bord_vague')) {
            if (dit !== 'recule' && dit !== 'reprend') erreurs.push('I162' + nom + 'la ligne baisse (' + ch + ' kg < ' + refCharge + ' kg), le verbe est « ' + dit + ' »');
          } else if (!elastique && ch > refCharge && simple) {
            if (dit !== 'monte_charge') erreurs.push('I162' + nom + 'la ligne monte en charge (' + ch + ' kg > ' + refCharge + ' kg), le verbe est « ' + dit + ' »');
          } else if (elastique && /^(?:recule|reprend|monte_charge)$/.test(dit)) {
            erreurs.push('I162' + nom + 'une aide ou un élastique dont la charge change n’a pas de verbe de charge (« ' + dit + ' »)');
          }
        } else if (simple) {
          if (niv !== null && vise !== null) {
            // §9.2 ter (25/11/2026) — la référence est la plus haute du niveau fait et de la cible d’avant (`fondement.cibleAvant`, absente : le niveau).
            var cibleAv = nombre(fond.cibleAvant);
            var nivAv = fond.chuteDeFin ? nombre(fond.chuteDeFin.niveauAvant) : null;
            var faitR = nivAv !== null && nivAv > niv ? nivAv : niv;
            var plus = vise - (cibleAv !== null && cibleAv > faitR && vise > faitR ? cibleAv : faitR);
            // D2 (26/11/2026) — le haut de la zone a borné le plancher (visée sous le niveau des séries d’avant) : la ligne montrée égale à la visée, la phrase garde (« tu restes à »).
            var bornee = nivAv !== null && vise < nivAv;
            var attenduR = cibleAv !== null && vise < cibleAv ? 'borne' : bornee && cibleAv === vise ? 'garde_cible' : plus > 0 ? 'monte_reps' : plus === 0 ? 'garde_cible' : 'borne';   // visée sous la cible d’avant : la baisse se dit (25/11/2026)
            if (dit !== attenduR) erreurs.push('I162' + nom + 'la ligne ' + ch + ' kg × ' + vise + ' contre un niveau de ' + niv + ' : le verbe devrait être « ' + attenduR + ' », il est « ' + dit + ' »');
            if (dit === 'monte_reps' && v.plus !== plus) erreurs.push('I162' + nom + 'le verbe dit ' + v.plus + ' rep(s) de plus, la ligne en demande ' + plus);
          }
        } else if (k.etat === 'bord_garde' || k.etat === 'tenue_apres_zero') {
          if (dit !== 'garde_charge') erreurs.push('I162' + nom + 'la charge est gardée (' + k.etat + '), le verbe est « ' + dit + ' »');
        }
        if ((k.etat === 'test_propose' || k.etat === 'retest' || k.etat === 'retest_un_cran') && k.haut) {
          var hc = nombre(k.haut.charge);
          var teste = hc !== null && hc > P && !memeC(hc, P);
          if (teste !== (dit === 'teste')) erreurs.push('I162' + nom + 'une ligne haute à ' + hc + ' kg contre le palier ' + P + ' kg : le verbe est « ' + dit + ' »');
        }
        if (dit === 'recule' && !(ch < refCharge)) erreurs.push('I162' + nom + '« recule » alors que la ligne (' + ch + ' kg) n’est pas sous ' + refCharge + ' kg');
        if (dit === 'monte_reps' && !meme) erreurs.push('I162' + nom + '« monte_reps » à une autre charge que le palier');
      }
      // — Sens 2 et 3 —
      var textes = [['le gris', x.entete && x.entete.gris], ['la tête courte', x.entete && x.entete.court], ['le « Pourquoi »', x.pourquoi && x.pourquoi.etat],
                    ['le constat', x.constat && (x.constat.verdict || '')]];
      // PR 5a — la SUITE du constat parle de la consigne suivante : I164 la lit, pas I162.
      var ligneDite = l && ch !== null && vise !== null ? norm(Voix().chargeFois(ch, vise)) : null;
      if (v.famille === 'variante') return;   // décharge, repli, alléger, « plus léger aujourd'hui » : leurs phrases sont celles d'I165, I166, I140
      textes.forEach(function (p) {
        var t = norm(p[1]);
        if (!t) return;
        var lieu = p[0];
        var dePlus = /(?:^|[^a-zéèêàùâîô])((?:sans|pas de|jamais|ne te demande|ne demande jamais|ne te propose)\s+)?((?:une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+)?reps?\s+de\s+plus/gi, q;
        while ((q = dePlus.exec(t))) {
          var neg = !!q[1] || /(?:sans|pas de|jamais)(?:\s+\w+){0,2}\s*$/i.test(t.slice(Math.max(0, q.index - 24), q.index + 1));
          if (neg) { if (v.verbe === 'monte_reps') erreurs.push('I162' + nom + lieu + ' nie « une rep de plus » devant une ligne qui monte : ' + t); }
          else if (q[2] && (v.famille === 'progression' || v.famille === 'reprise')) {
            if (v.verbe !== 'monte_reps') erreurs.push('I162' + nom + lieu + ' dit « ' + q[0].trim() + ' » alors que le verbe est « ' + v.verbe + ' » : ' + t);
          }
        }
        var reste = /[Tt]u restes à ([^.]*?)\./.exec(t);
        if (reste) {
          if (v.verbe !== 'garde_cible') erreurs.push('I162' + nom + lieu + ' dit « tu restes à » alors que le verbe est « ' + v.verbe + ' » : ' + t);
          else if (ligneDite !== null && reste[1].trim() !== ligneDite && reste[1].trim().indexOf(ligneDite) !== 0) {
            erreurs.push('I162' + nom + lieu + ' dit « tu restes à ' + reste[1].trim() + ' », la ligne est ' + ligneDite);
          }
        }
        var garde = /[Jj]e garde (\d+(?:,\d+)?) kg/.exec(t);
        var chGarde = garde ? Voix().lireNombre(garde[1]) : null;
        if (garde && ch !== null && chGarde !== ch && !(fond.bord && chGarde === nombre(fond.bord.charge)) &&
            !(fond.effortVise && chGarde === nombre(fond.effortVise.charge))) {
          erreurs.push('I162' + nom + lieu + ' dit « je garde ' + garde[1] + ' kg », la ligne est à ' + ch + ' kg : ' + t);
        }
        var baisse = /[Jj]e baisse à (\d+(?:,\d+)?) kg/.exec(t);
        if (baisse && v.verbe !== 'recule') erreurs.push('I162' + nom + lieu + ' dit « je baisse à » alors que le verbe est « ' + v.verbe + ' » : ' + t);
        var cause = CAUSE_SANS_MARGE.test(t);
        if (cause) {
          // Le verdict du constat raconte la séance FAITE : sa cause est celle du jugement du moteur (`constat.cible.sansMarge`, PR 4b), pas
          // celle du verbe de la consigne du jour (elle parle de la séance d'avant). Le gris et le Pourquoi lisent le verbe.
          var dansLeConstat = lieu === 'le constat';
          var smC = dansLeConstat ? (x.constat && x.constat.cible && x.constat.cible.sansMarge) || null : null;
          if (dansLeConstat) {
            if (!smC) erreurs.push('I162' + nom + lieu + ' imprime la cause « sans marge » alors que le jugement de la cible n’en porte aucune : ' + t);
          } else if (v.famille !== 'progression' && v.famille !== 'reprise') { /* un autre état dit son propre fait */ }
          else if (!v.cause) erreurs.push('I162' + nom + lieu + ' imprime la cause « sans marge » alors que le verbe ne la rend pas vraie (' + v.verbe + (v.sansMarge ? ', une série à fond' : ', aucune série à fond') + ') : ' + t);
          if (plan && plan.protegee === true) erreurs.push('I162' + nom + lieu + ' : « sans marge » dit à une population protégée : ' + t);
          var derniereRef = dansLeConstat ? !!(smC && smC.derniere) : !!(v.sansMarge && v.sansMarge.derniere);
          if (/la dernière sans marge|dernière série était sans marge/.test(t) && !derniereRef) erreurs.push('I162' + nom + lieu + ' dit « la dernière » alors que la série à fond n’est pas la dernière de la séance : ' + t);
        }
        if (/jusqu[’']à l[’']échec|à l[’']échec/.test(t) && lieu !== 'le constat' && v.cause) erreurs.push('I162' + nom + lieu + ' dit « échec » : le verbe ne le dit jamais (aucune marque d’échec posée) : ' + t);
      });
    });
  }
  // I272 (« Les chutes », 25/11/2026, MOTEUR §9.2 ter) — LE PLANCHER DE LA DERNIÈRE SÉRIE.
  //   Sens 1 (RECALCULÉ depuis les ENTRÉES : `entrees.precedents[slug]`, la séance d'où la consigne repart, recoupée par la date du fondement) : quand sa dernière série à la charge du
  //     palier a perdu 2 reps ou plus sur des séries stables (à une rep de la première, au moins trois séries, aucune à 0 rep), la visée d'une ligne à cette charge n'est JAMAIS sous
  //     le niveau des séries d'avant (arithmétique à part, jamais `Moteur.plancherDeFin`), hors population protégée et hors variante du jour (décharge, repli, « plus léger aujourd'hui »).
  //   Sens 2 (cohérence avec le fondement) : « une rep de plus » (`monte_reps`) ne se dit jamais sans que la ligne dépasse la cible d'avant (`fondement.cibleAvant`) ni le niveau ;
  //     « Dernière série à N » dit la dernière série des entrées ; « Je ne compte pas la dernière série » n'existe plus.
  function verifierChutes(plan, entrees, erreurs) {
    var precedents = entrees && entrees.precedents ? entrees.precedents : {};
    var T = racine.THModele, Pa = racine.THPalier;
    var norm = function (t) { return String(t || '').replace(/[\u00a0\u202f]/g, ' '); };
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      if (!k || !k.ligne) return;
      var nom = 'I272 — exercice ' + i + ' (' + x.slug + ') : ';
      var f = k.fondement || {};
      var v = x.verbe || null;
      var vise = nombre(k.ligne.vise), ch = nombre(k.ligne.charge), P = nombre(k.palier), niv = nombre(k.niveau);
      var variante = !!(k.allegee || k.repli || k.alleger || k.veilleLegere || k.plusLegere);
      [['le gris', x.entete && x.entete.gris], ['la tête courte', x.entete && x.entete.court], ['le « Pourquoi »', x.pourquoi && x.pourquoi.etat]].forEach(function (p) {
        if (/Je ne compte pas la dernière série/i.test(norm(p[1]))) erreurs.push(nom + p[0] + ' dit encore « Je ne compte pas la dernière série » : ' + norm(p[1]));
      });
      if (variante || vise === null || ch === null || P === null || P <= 0 || Math.abs(ch - P) > 1e-9) return;
      // Sens 2 — « une rep de plus » dépasse ce qui a été fait ET ce qui a été demandé.
      var cibleAv = nombre(f.cibleAvant);
      if (v && v.verbe === 'monte_reps') {
        if (niv !== null && !(vise > niv)) erreurs.push(nom + '« une rep de plus » alors que la ligne (' + vise + ') ne dépasse pas le niveau (' + niv + ')');
        if (cibleAv !== null && !(vise > cibleAv)) erreurs.push(nom + '« une rep de plus » alors que la ligne (' + vise + ') ne dépasse pas la cible d’avant (' + cibleAv + ')');
      }
      // Sens 3 (décision du 25/11/2026) — la visée sous la cible d’avant : la phrase dit la BAISSE (« ta cible passe à »), jamais « tu restes à ».
      if (cibleAv !== null && vise < cibleAv) {
        [['le gris', x.entete && x.entete.gris], ['la tête courte', x.entete && x.entete.court], ['le « Pourquoi »', x.pourquoi && x.pourquoi.etat]].forEach(function (p) {
          var t = norm(p[1]);
          if (/[Tt]u restes à /.test(t)) erreurs.push(nom + p[0] + ' dit « tu restes à » alors que la ligne (' + vise + ') est sous la cible d’avant (' + cibleAv + ') : ' + t);
        });
        var gt = norm(x.entete && x.entete.gris);
        if (gt && v && v.verbe !== 'borne') erreurs.push(nom + 'la ligne (' + vise + ') est sous la cible d’avant (' + cibleAv + ') et le verbe est « ' + v.verbe + ' », pas « borne »');
      }
      // D2 (26/11/2026) — le haut de la zone a borné le plancher (la visée est sous le niveau des séries d’avant) : la ligne montrée égale, la phrase GARDE (« Dernière série à N : tu restes à ») ;
      // sans ligne montrée, elle dit la baisse et nomme la dernière série (« Dernière série à N : ta cible passe à »).
      var nivAvantC = f.chuteDeFin ? nombre(f.chuteDeFin.niveauAvant) : null;
      if (nivAvantC !== null && vise < nivAvantC && (cibleAv === null || cibleAv === vise)) {
        var voulu = cibleAv === null ? /ta cible passe à /i : /tu restes à /i;
        var pt = norm(x.entete && x.entete.gris);
        if (pt && v && (v.verbe === 'garde_cible' || v.verbe === 'borne') && !voulu.test(pt)) erreurs.push(nom + 'la visée (' + vise + ') est bornée par le haut de la zone (niveau des séries d’avant ' + nivAvantC + ', cible d’avant ' + cibleAv + ') : la phrase devrait dire « ' + (cibleAv === null ? 'ta cible passe à' : 'tu restes à') + ' » : ' + pt);
      }
      // Sens 1 — le plancher, recalculé depuis la séance des entrées.
      if (plan.protegee === true || (k.etat !== 'progression' && k.etat !== 'tenue_apres_chute' && k.etat !== 'test_propose')) return;
      var pr = Object.prototype.hasOwnProperty.call(precedents, x.slug) ? precedents[x.slug] : null;
      if (!pr || !pr.seance || !f.date || Date.parse(pr.seance.debut) !== Date.parse(f.date)) return;
      var ss = (pr.series || []).filter(function (s) {
        return s && T.estTravail(s) && !T.estRecul(s) && s.hors_calcul !== true && nombre(s.charge_kg) !== null && Math.abs(nombre(s.charge_kg) - P) < 1e-6;
      });
      var c = ss.map(function (s) { return Pa.repsComptees(s); });
      if (ss.length < 3 || c.some(function (r) { return r === null || r === undefined; }) || ss.some(function (s) { return nombre(s.reps) === 0; })) return;
      var stable = true;
      for (var j = 1; j < c.length - 1; j++) { if (Math.abs(c[j] - c[0]) > 1) stable = false; }
      if (!stable || c[0] - c[c.length - 1] < 2) return;
      var avant = Math.min(c[0], c[1]);
      for (var q = 2; q < c.length - 1; q++) avant = Math.min(avant, c[q] + 1);
      // D2 (26/11/2026) — le plancher s'arrête au HAUT DE LA ZONE de la consigne : le niveau des séries d'avant ne s'exige que jusque-là, et la visée ne le dépasse jamais.
      var zoneP = Moteur().zoneParCle(k.zone);
      var hautP = zoneP ? nombre(zoneP.haut) : null;
      var avantBorne = hautP !== null ? Math.min(avant, hautP) : avant;
      if (vise < avantBorne) erreurs.push(nom + 'la dernière série (' + nombre(ss[ss.length - 1].reps) + ') a perdu ' + (c[0] - c[c.length - 1]) + ' reps sur des séries stables, la ligne vise ' + vise + ' sous le niveau des séries d’avant (' + avantBorne + (avantBorne < avant ? ', borné au haut de la zone, ' + avant + ' sinon' : '') + ')');
      if (hautP !== null && vise > hautP && f.chuteDeFin) erreurs.push(nom + 'la dernière série (' + nombre(ss[ss.length - 1].reps) + ') a perdu ' + (c[0] - c[c.length - 1]) + ' reps : la ligne vise ' + vise + ' au-dessus du haut de la zone (' + hautP + '), le plancher s’arrête au haut de la zone');
      if (f.chuteDeFin && nombre(f.chuteDeFin.derniere) !== nombre(ss[ss.length - 1].reps)) erreurs.push(nom + 'le fait « dernière série à ' + f.chuteDeFin.derniere + ' » n’est pas celui des entrées (' + nombre(ss[ss.length - 1].reps) + ')');
    });
  }
  // I269 à I271 (« Simplifier », pilote 3+1, ECRAN-SAISIE delta du 21/11/2026) — LA TÊTE D'UN EXERCICE EN SÉANCE : trois éléments au plus et une carte de décision, rien d'annoncé de caché.
  //   I269  la forme COURTE du gris (`entete.court`) est un EXTRAIT fidèle du gris : le gris moins le fait daté qui précède le verbe, ou son début (« On essaie 92,5 kg. »), ou sans la semaine
  //         (décharge) ; jamais un autre texte, jamais un chiffre que le gris ne dit pas, jamais sans gris.
  //   I270  la tête compte trois éléments au plus (la consigne, UNE ligne grise, UN troisième : le compteur, sinon le « Pendant ce temps ») ; les deux phrases qui partent à la feuille (le
  //         « ≈ » développé, la raison de la chauffe) y sont bien, mot pour mot, et restent dans la tête ou la carte quand il n'y a pas de feuille.
  //   I271  une seule carte de décision à la fois, dans l'ordre reprise → veille → test (à gestes) → forme du jour → « un cran dessous » → calage → autres questions → chauffes (25/11/2026 : le test entre, la veille passe devant) ; les autres attendent ; une décision appliquée (chauffes posées,
  //         silence, plafond) n'entre jamais dans la file.
  function verifierTete(plan, erreurs) {
    var norm = function (t) { return String(t || '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim(); };
    var nombres = function (t) { return (norm(t).match(/\d+(?:,\d+)?/g) || []); };
    var NOMS = ['reprise', 'veille', 'test', 'forme', 'paris', 'calage', 'autre', 'chauffes'];
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var en = x.entete || {};
      // I269
      if (typeof en.court === 'string' && en.court !== '') {
        var g = norm(en.gris), c = norm(en.court);
        var extrait = g !== '' && c !== g && c.length < g.length && (
          g.slice(-c.length) === c ||
          (g.indexOf(c.replace(/\.$/, '')) === 0 && /^\s/.test(g.slice(c.replace(/\.$/, '').length))) ||
          g.replace(/,\s+semaine\s+\d+\s+sur\s+\d+/, '') === c);
        if (!extrait) erreurs.push('I269' + nom + 'la tête courte « ' + c + ' » n’est pas un extrait du gris « ' + g + ' »');
        var gn = nombres(g);
        nombres(c).forEach(function (n) { if (gn.indexOf(n) < 0) erreurs.push('I269' + nom + 'la tête courte dit « ' + n + ' », que le gris ne dit pas'); });
      }
      // I270
      var t = x.tete;
      if (!t || typeof t !== 'object') { erreurs.push('I270' + nom + 'aucune tête calculée par le plan'); return; }
      var puissance = !!(plan.puissance && plan.puissance.slug === x.slug);
      var tiers = puissance ? null : (en.compteur ? 'compteur' : (en.frere ? 'frere' : null));
      if (t.tiers !== tiers) erreurs.push('I270' + nom + 'le troisième élément de la tête est « ' + t.tiers + ' », il devrait être « ' + tiers + ' »');
      // 25/11/2026 — la ligne de puissance (65 ans et plus, `plan.puissance`) est dans la tête de son exercice : elle se compte, relue sur le plan et non sur `t.puissance`.
      if (t.puissance !== puissance) erreurs.push('I270' + nom + 'la ligne de puissance est ' + (t.puissance ? 'comptée' : 'non comptée') + ' dans la tête alors qu’elle ' + (puissance ? 'y est' : 'n’y est pas'));
      var compte = ((en.jaune || []).length ? 1 : 0) + ((en.court || en.gris) ? 1 : 0) + (t.tiers ? 1 : 0) + (puissance ? 1 : 0);
      if (compte > 3) erreurs.push('I270' + nom + 'la tête compte ' + compte + ' éléments');
      if (puissance && en.compteur && !(x.pourquoi && x.pourquoi.compteur === en.compteur)) erreurs.push('I270' + nom + 'le compteur quitte la tête pour la ligne de puissance sans être au « Pourquoi ? » mot pour mot');
      if (puissance && en.frere && !(x.pourquoi && x.pourquoi.frere)) erreurs.push('I270' + nom + 'le « Pendant ce temps » quitte la tête pour la ligne de puissance sans être au « Pourquoi ? »');
      if (en.compteur && en.frere && !(x.pourquoi && x.pourquoi.frere)) erreurs.push('I270' + nom + 'le « Pendant ce temps » quitte la tête sans être au « Pourquoi »');
      var phr = x.approchee && x.approchee.phrase ? x.approchee.phrase : null;
      if (phr) {
        if (x.pourquoi && approcheeParLaPuce(x) ? t.approchee !== 'feuille' || x.pourquoi.approchee !== phr : t.approchee !== 'tete') erreurs.push('I270' + nom + 'la phrase du « ≈ » n’est ni à la feuille ni dans la tête');
      } else if (t.approchee) erreurs.push('I270' + nom + 'une place pour la phrase du « ≈ » alors qu’il n’y en a pas');
      var rai = x.proposition && x.proposition.pourquoi ? x.proposition.pourquoi : null;
      if (rai) {
        if (x.pourquoi ? t.chauffe !== 'feuille' || x.pourquoi.chauffe !== rai : t.chauffe !== 'carte') erreurs.push('I270' + nom + 'la raison de la chauffe n’est ni à la feuille ni sur la carte');
      } else if (t.chauffe) erreurs.push('I270' + nom + 'une place pour la raison de la chauffe alors qu’il n’y en a pas');
      // I271 — relue à part, famille par famille.
      var f = x.file;
      if (!f || !Array.isArray(f.enAttente)) { erreurs.push('I271' + nom + 'aucune file de décision'); return; }
      var present = {};
      present.reprise = !!x.carteReprise;
      // La carte du test : à gestes seulement (un état « en cours » ou « à faire » avec son bouton, une ligne vide posée, un ajout) ; recalculée depuis les champs du plan, pas depuis `x.file`.
      (function () {
        var st = x.semaineDeTest, cours = !!st && (st.etat === 'a_faire' || st.etat === 'en_cours'), ess = !!(st && st.essais && st.essais.length);
        present.test = !!st && st.testee === true && !st.pasDEssai && !st.pasDeTest && !st.accessoire && !!(st.ajout || st.videsPosees || (cours && (!ess || st.mode === 'max')));
      })();
      present.forme = !!x.carteForme;
      present.paris = !!(x.parisRates && x.parisRates.carte);
      present.calage = !!(x.calage && x.calage.demandeHabituelle);
      present.autre = !!x.carteLest || !!x.carteMarche || !!(x.escalier && x.escalier.carte);
      present.veille = !!(plan.veilleActivite && plan.veilleActivite.slug === x.slug);
      present.chauffes = !!x.proposition;
      var attendue = null, reste = [];
      NOMS.forEach(function (n) { if (!present[n]) return; if (attendue === null) attendue = n; else reste.push(n); });
      if (f.carte !== attendue) erreurs.push('I271' + nom + 'la carte retenue est « ' + f.carte + ' », la première de l’ordre est « ' + attendue + ' »');
      if (f.enAttente.join('|') !== reste.join('|')) erreurs.push('I271' + nom + 'les cartes en attente sont « ' + f.enAttente.join(', ') + ' », elles devraient être « ' + reste.join(', ') + ' »');
      if (f.ordre.join('|') !== NOMS.join('|')) erreurs.push('I271' + nom + 'l’ordre de la file n’est pas celui de la règle');
      if ((x.chauffesPosees || x.silenceChauffes) && (f.carte === 'chauffes' || f.enAttente.indexOf('chauffes') >= 0)) erreurs.push('I271' + nom + 'une décision appliquée (chauffes posées ou silence) est entrée dans la file');
      // 25/11/2026 — l'essai de la marche (« C'est fait … », « Annuler ») est une décision DÉJÀ PRISE (le geste « Essayer » l'a posée) : hors file, comme les chauffes posées. Une marche essayée ne laisse
      // jamais la carte de la marche en attente (famille `autre`) ; l'exemption est dite ici, pas laissée au hasard de la liste des familles.
      if (x.essaiMarche && x.carteMarche) erreurs.push('I271' + nom + 'une décision appliquée (marche essayée) est encore une carte de la file (la carte de la marche)');
    });
  }
  // I167 (chantier « Les mots disent vrai », PR 5a-bis, MOTEUR §9.48 bis) — LA SUITE LIT AUJOURD'HUI. Quand une charge est répétée aujourd'hui (au moins deux
  // séries de travail faites à la même charge, §7.6), la consigne dont l'annonce est écrite (`suite.consigne`) est celle d'APRÈS la séance du jour : sa date
  // (`fondement.date`) est le jour civil de la séance. Une annonce écrite sur une consigne plus ancienne redit la fois d'AVANT (« une rep de plus, 90 kg × 5 »
  // après 5, 5, 5, 5 à 90 kg, quand la suite vraie est 90 kg × 6) : I162 et I164 ne la voient pas, la ligne et le niveau dits sortent du même objet périmé.
  // Une date INCONNUE (une consigne sans fondement daté) n'est pas jugée : seule une date ANTÉRIEURE est une erreur.
  function verifierSuiteAujourdhui(plan, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var c = x && x.constat;
      if (!c || typeof c.suite !== 'string' || c.suite === '' || c.chargeRepetee !== true) return;
      if (typeof c.suiteDate !== 'string' || typeof c.jourDuConstat !== 'string') return;
      if (c.suiteDate < c.jourDuConstat) erreurs.push('I167 — exercice ' + i + ' (' + x.slug + ') : l\'annonce « ' + c.suite + ' » est écrite sur la consigne du ' + c.suiteDate + ', pas sur la séance du ' + c.jourDuConstat);
    });
  }
  // I168 (F2, MOTEUR §9.49) — LES ROUTINES PAS PRÊTES, LE COACH SE TAIT SUR CE QU'ELLES DÉCIDENT. `entrees.routinesPretes === false` (lecture pas faite ou en échec
  // sans routine en mémoire ; INDÉFINI = prêtes, et « lues puis échec tardif » reste prêtes : le témoin S5) ET une zone de plan posée sur l'exercice : la suite
  // (`entrees.suites[slug]`) est nulle, le plan ne porte aucun `constat` (verdict et suite sortent de la même suite), et et — côté app, hors du plan — aucune consigne
  // n'a été calculée puis figée sur `zonesDeRoutine = {}` (`consigneDe` rend `null` sans rien mettre en cache : banc f2, brouillon `consignes` effacé).
  function verifierRoutinesPretes(plan, entrees, erreurs) {
    if (!entrees || entrees.routinesPretes !== false) return;
    var suites = entrees.suites || {};
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = 'I168 — exercice ' + i + ' (' + x.slug + ') : ';
      if (!x.zonePlan) return;
      if (suites[x.slug]) erreurs.push(nom + 'une suite est donnée alors que les routines ne sont pas prêtes');
      if (x.constat && (x.constat.suite || x.constat.verdict)) erreurs.push(nom + 'un constat est dit alors que les routines ne sont pas prêtes');
    });
  }
  // I164 (chantier « Les mots disent vrai », PR 5a, MOTEUR §9.48) — UNE ANNONCE NE PROMET QUE CE QUE LE MOTEUR FERA. Relue sur `x.constat.suite` (le texte,
  // jamais un champ du verbe), par une arithmétique à part de `Moteur.verbeDeLaConsigne` et de `Moteur.annonceDe`.
  //   Sens 1 (source) : l'annonce naît de `Moteur.annonceDe` seul — gardé par `v2-annonce-litteraux-5a.test.js` ; ici le lexique fermé : jamais « Même cible »
  //     (ambigu), jamais « la séance d'après / suivante » dans la suite.
  //   Sens 2 (chiffre et verbe) : « La prochaine fois : … » dit la LIGNE de la consigne suivante (`suiteLignes.ligne`, jamais une ligne haute) et un verbe
  //     que l'écart `vise − niveau` recalculé ICI rend vrai (N reps de plus ⇔ N = vise − niveau > 0 ; « tu restes à » ⇔ 0 ; « ta cible » ⇔ < 0 ; « je garde »
  //     à la charge de la ligne) ; la cause « sans marge » jamais devant « de plus ». Aveu : la ligne et le niveau sortent du même objet que le texte ; le
  //     contrôle indépendant de la fois SUIVANTE RÉELLE est celui de la campagne (`v2-mots-campagne.test.js`) et de la section de banc de la clé du mémo.
  //   Sens 4 (condition simulée) : « Il te manque N reps pour tester X kg » ⇒ `constat.testConfirme` (le moteur l'a rejouée) ET N = haut de la zone − niveau
  //     du jour (Franc : la meilleure série) ET X = le cran suivant.
  // Hors périmètre (PR 5b) : la date (sens 3), les régimes à venir (décharge, bloc, zone suivante, pause).
  function verifierAnnonce(plan, erreurs) {
    var norm = function (t) { return String(t || '').replace(/[\u00a0\u202f]/g, ' '); };
    var memeC = function (a, b) { return Math.abs(a - b) < 1e-9; };
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var c = x && x.constat;
      if (!c || typeof c.suite !== 'string' || c.suite === '') return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var t = norm(c.suite);
      var sl = c.suiteLignes || null;
      if (/Même cible|la séance (?:d['’]après|suivante)|\bProchaine fois\b|\bProchaine séance\b/.test(t)) erreurs.push('I164' + nom + 'un mot hors du lexique des annonces : ' + t);
      var vers = /^La prochaine fois : (.*)\.$/.exec(t);
      if (vers) {
        var corps = vers[1];
        // 5b-2 — le repli : les lignes de la consigne suivante dites telles quelles (« La prochaine fois : 70 kg × 10, … »), aucun verbe à relire (comme « Prochaine séance » avant : jamais vérifié ici).
        if (!/^[a-zà-ÿ]/.test(corps)) return; // un verbe du lexique commence par une minuscule ; une ligne (« 70 kg × 10 », « ≈ 30 kg », « Poids du corps × 16 ») jamais
        var l = sl ? sl.ligne : null;
        var ch = l ? nombre(l.charge) : null, vi = l ? nombre(l.vise) : null;
        if (!sl || !l || sl.haut || ch === null) { erreurs.push('I164' + nom + 'une annonce de verbe sans ligne chiffrée seule : ' + t); return; }
        var ligne = vi === null ? null : norm(Voix().chargeFois(ch, vi));
        // §9.2 ter — la référence : le niveau fait, ou la cible d'avant quand la visée est au-dessus du niveau et que la personne est restée sous la cible.
        var faitA = typeof sl.niveau === 'number' ? (typeof sl.niveauAvant === 'number' && sl.niveauAvant > sl.niveau ? sl.niveauAvant : sl.niveau) : null;
        var refA = faitA === null ? null : (typeof sl.cibleAvant === 'number' && sl.cibleAvant > faitA && vi !== null && vi > faitA ? sl.cibleAvant : faitA);
        var plus = vi !== null && refA !== null ? vi - refA : null;
        // D2 (26/11/2026) — borne de zone : le plancher a été ramené au haut de la zone (visée sous le niveau des séries d’avant). La ligne montrée égale : « tu restes à » ; absente : la baisse se dit.
        var borneeA = typeof sl.niveauAvant === 'number' && vi !== null && vi < sl.niveauAvant;
        var egaleA = borneeA && typeof sl.cibleAvant === 'number' && vi === sl.cibleAvant;
        var baisseA = vi !== null && (typeof sl.cibleAvant === 'number' ? vi < sl.cibleAvant : borneeA);   // la cible d’avant baisse : « ta cible passe à », jamais « tu restes »
        var mDe = /^(une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+) reps? de plus, (.*)$/.exec(corps);
        var mReste = /^tu restes à (.*?)(?:, (?:la dernière|une série) sans marge)?$/.exec(corps);
        var mCible = /^ta cible, (.*?)(?:, (?:la dernière|une série) sans marge)?$/.exec(corps);
        var mBaisse = /^ta cible passe à (.*?)(?:, (?:la dernière|une série) sans marge)?$/.exec(corps);
        var mGarde = /^je garde (\d+(?:,\d+)?) kg$/.exec(corps);
        if (mDe) {
          var mots = ['', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
          var n = mots.indexOf(mDe[1]);
          n = n > 0 ? n : Number(mDe[1]);
          if (plus === null || plus <= 0) erreurs.push('I164' + nom + '« de plus » alors que la ligne ne monte pas (vise ' + vi + ', niveau ' + (sl.niveau === undefined ? '?' : sl.niveau) + ') : ' + t);
          else if (n !== plus) erreurs.push('I164' + nom + 'l’annonce dit ' + n + ' rep(s) de plus, la ligne en demande ' + plus + ' : ' + t);
          if (ligne !== null && mDe[2].trim() !== ligne) erreurs.push('I164' + nom + 'l’annonce dit « ' + mDe[2] + ' », la ligne suivante est ' + ligne + ' : ' + t);
          if (CAUSE_SANS_MARGE.test(corps)) erreurs.push('I164' + nom + 'la cause « sans marge » devant une rep de plus : ' + t);
        } else if (mReste) {
          if ((plus !== 0 && !egaleA) || baisseA) erreurs.push('I164' + nom + '« tu restes à » alors que la ligne vise ' + vi + ' pour un niveau de ' + (sl.niveau === undefined ? '?' : sl.niveau) + ' : ' + t);
          if (ligne !== null && mReste[1].trim() !== ligne) erreurs.push('I164' + nom + 'l’annonce dit « ' + mReste[1] + ' », la ligne suivante est ' + ligne + ' : ' + t);
        } else if (mCible) {
          if (plus === null || plus >= 0 || vi > faitA || baisseA || egaleA) erreurs.push('I164' + nom + '« ta cible » alors que la ligne ne borne pas (vise ' + vi + ') : ' + t);
          if (ligne !== null && mCible[1].trim() !== ligne) erreurs.push('I164' + nom + 'l’annonce dit « ' + mCible[1] + ' », la ligne suivante est ' + ligne + ' : ' + t);
        } else if (mBaisse) {
          if (plus === null || plus >= 0 || !baisseA) erreurs.push('I164' + nom + '« ta cible passe à » alors que la ligne ne baisse pas la cible d’avant (vise ' + vi + ', niveau ' + (sl.niveau === undefined ? '?' : sl.niveau) + ', cible d’avant ' + (sl.cibleAvant === undefined ? '?' : sl.cibleAvant) + ') : ' + t);
          if (ligne !== null && mBaisse[1].trim() !== ligne) erreurs.push('I164' + nom + 'l’annonce dit « ' + mBaisse[1] + ' », la ligne suivante est ' + ligne + ' : ' + t);
        } else if (mGarde) {
          if (corps !== 'je garde ' + norm(Voix().charge(ch))) erreurs.push('I164' + nom + '« je garde ' + mGarde[1] + ' kg », la ligne suivante est à ' + ch + ' kg : ' + t);
        } else {
          erreurs.push('I164' + nom + 'un verbe hors du lexique : ' + t);
        }
        return;
      }
      var manque = /^Il te manque (une rep|\S+ reps) pour tester (?:≈ )?(\d+(?:,\d+)?) kg\.$/.exec(t);
      if (manque) {
        // Sens 4 — le moteur a rejoué la condition ; le nombre et le cran sont recalculés ici.
        if (c.testConfirme !== true) erreurs.push('I164' + nom + '« il te manque » sans que le moteur ait confirmé le test : ' + t);
        var zh = sl ? sl.zoneHaut : null;
        var MOTS = ['', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
        var mot = manque[1] === 'une rep' ? 'une' : manque[1].replace(/ reps$/, '');
        var mN = MOTS.indexOf(mot) > 0 ? MOTS.indexOf(mot) : Number(mot);
        // Le niveau du jour : celui de la consigne suivante (Normal), ou la meilleure série (Franc, son déclencheur est UNE série).
        var niveaux = [];
        if (sl && typeof sl.niveau === 'number') niveaux.push(sl.niveau);
        if (sl && typeof sl.repsMax === 'number' && sl.repsMax > 0) niveaux.push(sl.repsMax);
        if (typeof zh !== 'number' || !niveaux.length) erreurs.push('I164' + nom + '« il te manque » sans zone ni niveau à compter : ' + t);
        else if (!niveaux.some(function (n) { return mN === zh - n; })) erreurs.push('I164' + nom + 'il manque ' + niveaux.map(function (n) { return zh - n; }).join(' ou ') + ' rep(s), l’annonce en dit ' + mN + ' : ' + t);
        if (sl && typeof sl.cran === 'number' && manque[2] + ' kg' !== norm(Voix().charge(sl.cran))) erreurs.push('I164' + nom + 'le cran annoncé (' + manque[2] + ' kg) n’est pas le cran suivant (' + sl.cran + ' kg) : ' + t);
      } else if (c.testConfirme !== true && /Il te manque/.test(t)) {
        erreurs.push('I164' + nom + '« il te manque » mal formée ou non confirmée : ' + t);
      }
    });
  }

  // I169 (chantier « Les mots disent vrai », PR 5b-1, MOTEUR §9.50) — UNE ANNONCE NE PROMET PAS CE QU'UN RÉGIME À VENIR DÉMENTIRA. Quand la fois suivante peut tomber dans une
  // décharge planifiée, une semaine de mesure acceptée ou un bloc qui pose une autre zone, l'annonce dit la DATE du régime (absolue) ou se tait.
  //   Sens 1 (rien de chiffré) : `constat.regime` posé ⇒ `suite` est exactement l'une des trois phrases, sans `kg`, `×`, `rep`, ni « la prochaine fois » ; l'effort sans « je garde » ni « on essaie/teste ».
  //   Sens 2 (la date est celle du moteur) : la date dite est RECALCULÉE depuis les entrées (blocs, cartes, semaine de mesure : `debutDecharge`, `dechargePlanifiee`), jamais lue du champ du plan, et tombe dans [jour + 1, jour + 14].
  //   Sens 3 (fenêtre) : la décharge ou le test dont la période recoupe la fenêtre recalculée de l'écart posé est DIT (si l'annonce existe) ; un régime dit sans période qui recoupe est une erreur.
  //   Sens 4 (pas de spam) : « commence le » ne se dit jamais sans régime.
  //   Sens 5 (lexique) : aucune date relative, « jusqu'au », « repos », « semaine allégée », « séances plus légères », sur la suite et la phrase d'effort, tous plans.
  //   Sens 6 (le silence ne crée rien) : tenu par construction (`annonceDeLaSuite` rend `null` avant de lire le régime) et par le test unitaire.
  // Aveu : le contrôle indépendant de la fois suivante RÉELLE est la campagne (`v2-mots-campagne.test.js`) ; le bloc (zone posée) n'est recontrôlé ici que par sa date.
  var LEXIQUE_DES_DATES = /demain|semaine prochaine|bientôt|plus tard|dans \d+ (?:jours?|séances?)|jusqu.au|séances? plus légères|semaine allégée|repos/i;
  var PHRASE_DE_REGIME = /^(?:Ta décharge commence le (\d{1,2} [^\s,.]+\.?), prévue par ton programme\.|Ta semaine de mesure commence le (\d{1,2} [^\s,.]+\.?)|Ton bloc commence le (\d{1,2} [^\s,.]+\.?))$/;
  function verifierRegimes(plan, entrees, erreurs) {
    var M = Moteur(), e = entrees || {};
    var norm = function (t) { return String(t || '').replace(/[\u00a0\u202f]/g, ' '); };
    var seance = e.seance || {};
    var jour = M.jourCivil(seance.debut);
    var jn = jour ? M.numeroDuJour(jour) : null;
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = 'I169 — exercice ' + i + ' (' + x.slug + ') : ';
      var c = x.constat || null;
      var phraseEffort = x.effortVise && typeof x.effortVise.phrase === 'string' ? norm(x.effortVise.phrase) : '';
      var t = c && typeof c.suite === 'string' ? norm(c.suite) : '';
      if (LEXIQUE_DES_DATES.test(t)) erreurs.push(nom + 'un mot hors du lexique des dates dans la suite : ' + t);
      if (LEXIQUE_DES_DATES.test(phraseEffort)) erreurs.push(nom + 'un mot hors du lexique des dates dans la phrase d’effort : ' + phraseEffort);
      var dit = /commence le/.test(t);
      if (!c || !c.regime) {
        if (dit) erreurs.push(nom + 'une date de régime sans régime : ' + t);
        // Sens 3 : un régime ENTIÈREMENT recalculé depuis les entrées (décharge, test) qui recoupe la fenêtre doit être dit.
        if (t !== '' && jn !== null && !seance.edition) {
          var attendu = regimesRecalcules(e, M, jn, c ? c.suiteEcart : null);
          if (attendu.length) erreurs.push(nom + 'un ' + attendu[0].genre + ' commence le ' + attendu[0].debut + ' dans la fenêtre de la fois suivante, l’annonce est restée chiffrée : ' + t);
        }
        return;
      }
      var m = PHRASE_DE_REGIME.exec(t);
      if (c.suite !== null && c.suite !== undefined) {
        if (!m) erreurs.push(nom + 'sous un régime, l’annonce n’est pas la phrase de la date : ' + t);
        if (/kg|×|\brep|la prochaine fois/i.test(t)) erreurs.push(nom + 'une charge, des reps ou « la prochaine fois » sous un régime : ' + t);
      }
      if (/la prochaine fois|je garde|on essaie|on teste/i.test(phraseEffort)) erreurs.push(nom + 'la phrase d’effort promet sous un régime : ' + phraseEffort);
      if (jn === null) return;
      var f = M.fenetreDeLaProchaineFois(c.suiteEcart);
      var debutN = M.numeroDuJour(c.regime.debut);
      if (debutN === null || debutN < jn + 1 || debutN > jn + 14) erreurs.push(nom + 'la date du régime (' + c.regime.debut + ') hors de [jour + 1, jour + 14]');
      var trouve = regimesRecalcules(e, M, jn, c.suiteEcart).some(function (r) { return r.genre === c.regime.genre && r.debut === c.regime.debut; });
      // Le bloc ne se recalcule pas ici (zone posée) : seule sa date, dans la fenêtre haute, est vérifiée.
      if (c.regime.genre === 'bloc') trouve = (e.programme && e.programme.blocs || []).some(function (b) { return b && b.statut === 'en_cours' && M.jourCivil(b.debut) === c.regime.debut; }) && debutN <= jn + f.hi;
      if (!trouve) erreurs.push(nom + 'le régime ' + c.regime.genre + ' du ' + c.regime.debut + ' n’est pas celui que les entrées donnent (fenêtre ' + f.lo + ' à ' + f.hi + ' jours)');
      if (m && t !== '') {
        var dateDite = m[1] || m[2] || m[3];
        if (dateDite !== norm(racine.THModele.jourCourt(String(c.regime.debut)))) erreurs.push(nom + 'la date dite (' + dateDite + ') n’est pas celle du régime (' + c.regime.debut + ')');
      }
    });
  }
  // Décharge planifiée et semaine de mesure dont la période recoupe la fenêtre de la fois suivante, d'après les ENTRÉES (jamais le champ du plan).
  function regimesRecalcules(e, M, jn, ecart) {
    var f = M.fenetreDeLaProchaineFois(ecart);
    var lo = jn + f.lo, hi = jn + f.hi, sortie = [];
    var fins = finsAllegees(((e.escalier || {}).cartes));
    blocsDuProgramme(e).forEach(function (b) {
      if (!b || b.statut !== 'en_cours' || !M.dechargePlanifiee(b, fins)) return;
      var d = M.debutDecharge(b), n = d === null ? null : M.numeroDuJour(d);
      if (n !== null && n > jn && n <= hi && n + 6 >= lo) sortie.push({ genre: 'decharge', debut: d });
    });
    var T = e.semaineDeTest;
    if (T && T.debut && T.fin) {
      var nt = M.numeroDuJour(T.debut), nf = M.numeroDuJour(T.fin);
      if (nt !== null && nf !== null && nt > jn && nt <= hi && nf >= lo) sortie.push({ genre: 'test', debut: T.debut });
    }
    return sortie;
  }

  // I162, sens 3 — les exercices du plan dont la cause « sans marge » existe devant une ligne qui monte (comptés, jamais imprimés).
  function causesTues(plan) {
    return ((plan && plan.exercices) || []).filter(function (x) { return x && x.verbe && x.verbe.causeTue === true; }).length;
  }

  // I153 et I154 (chantier « première séance sûre », PR 2, MOTEUR §9.42) — APRÈS UN ZÉRO REP.
  //   · I153 — jamais la charge échouée ni au-dessus : toute consigne qui porte `fondement.zeroRep` a une ligne STRICTEMENT plus légère que la charge
  //     échouée ; une `zero_rep` est la ligne dite (`vers`, `visees`), au plus le palier, sans ligne haute ni zone, et aucune ligne non validée
  //     n'est préremplie au-dessus de `vers` ;
  //   · I154 — rien d'ambitieux : sur `zero_rep` et `silence/zero_plancher`, aucune réserve visée sous « garde 2 », aucune ligne de test (sa clause
  //     « Au max » est retirée avec l'objet, 20/11/2026, I251).
  function verifierZeroRep(plan, e, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      if (!k) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var z = k.fondement ? k.fondement.zeroRep : null;
      if (z) {
        if (k.ligne && !(nombre(k.ligne.charge) < nombre(z.charge))) erreurs.push('I153' + nom + 'après un zéro rep à ' + z.charge + ' kg, une ligne à ' + k.ligne.charge + ' kg');
        if (k.etat === 'zero_rep') {
          var vers = nombre(z.vers), vi = nombre(z.visees);
          // PR 3 (N4) — en Décharge, la ligne est l'allègement de la ligne dite : au plus `vers` (le palier ne la remonte jamais), 2 reps de moins.
          var alleg = !!k.allegee;
          if (!k.ligne || (alleg ? !(nombre(k.ligne.charge) <= vers + 1e-9) : nombre(k.ligne.charge) !== vers)) erreurs.push('I153' + nom + 'une ligne qui n’est pas la charge dite (' + (k.ligne ? k.ligne.charge : 'aucune') + ' pour ' + z.vers + ')');
          else if (nombre(k.palier) !== null && vers > nombre(k.palier) + 1e-9) erreurs.push('I153' + nom + 'après un zéro rep, une ligne à ' + vers + ' kg au-dessus du palier ' + k.palier + ' kg');
          if (!k.ligne || (!alleg && nombre(k.ligne.vise) !== vi) || vi === null || vi < 1 || vi !== Math.round(vi)) erreurs.push('I153' + nom + 'une ligne dont les reps ne sont pas celles dites (' + z.visees + ')');
          if (k.haut) erreurs.push('I153' + nom + 'une ligne haute après un zéro rep');
          if (k.zone !== null && k.zone !== undefined) erreurs.push('I153' + nom + 'une zone (' + k.zone + ') déduite d’un zéro rep');
          if (!(nombre(z.series) >= 1)) erreurs.push('I153' + nom + 'un zéro rep sans série');
          (x.lignes || []).forEach(function (l) {
            var pc = l && !l.validee && l.prerempli ? nombre(l.prerempli.charge_kg) : null;
            if (pc !== null && pc > vers + 1e-9) erreurs.push('I153' + nom + 'une ligne préremplie à ' + pc + ' kg, au-dessus de ' + vers + ' kg après un zéro rep');
          });
        }
      }
      // La première séance toute à zéro (le calage recommence) : aucune ligne non validée n'est préremplie à la charge échouée ni au-dessus.
      if (z && k.etat === 'silence' && k.raison === 'premiere_fois') {
        (x.lignes || []).forEach(function (l) {
          var pc = l && !l.validee && l.type !== 'chauffe' && l.prerempli ? nombre(l.prerempli.charge_kg) : null;
          if (pc !== null && pc >= nombre(z.charge) - 1e-9) erreurs.push('I153' + nom + 'une ligne préremplie à ' + pc + ' kg, la charge qui vient d’échouer (calage)');
        });
      }
      // I156 (PR 4b, R-A) — aucun gris : aucune ligne de travail non validée n'est préremplie à la charge restée à 0 rep (plafond actif, silences compris, ou zéro validé
      // dans la séance en cours) ni au-dessus.
      var exoZero = e && e.seance && e.seance.exercices ? e.seance.exercices[x.iExo] : null;
      var ChG = chargeDuZeroDuGris(exoZero, k);
      if (ChG !== null) {
        (x.lignes || []).forEach(function (l) {
          var pg = l && !l.validee && l.type !== 'chauffe' && l.prerempli ? nombre(l.prerempli.charge_kg) : null;
          var src = l && l.fantome ? l.fantome.source : null;
          if (pg !== null && src !== 'chauffe' && pg >= ChG - 1e-9) erreurs.push('I156' + nom + 'une ligne préremplie à ' + pg + ' kg, la charge restée à 0 rep (' + ChG + ' kg) ou au-dessus');
        });
      }
      // I155 (PR 4b, R-A, MOTEUR §9.42 bis) — LE PLAFOND APRÈS UN ZÉRO : quand il mord, la consigne est `tenue_apres_zero`, la ligne EST le palier,
      // aucune ligne ni haut n'est à `Ch` ou au-dessus, il n'y a pas de haut, palier/niveau/n/zone sont ceux de la consigne d'avant plafond (`sans`),
      // la ligne n'est jamais au-dessus de la sienne, et le fondement ne porte plus rien de ce qu'une ligne remplacée justifiait (I57, I61, I62, I68).
      var pz = k.fondement ? k.fondement.plafondZero : null;
      if (pz && pz.mord === true) {
        var Ch = nombre(pz.charge), sans = pz.sans || {};
        if (k.etat !== 'tenue_apres_zero') erreurs.push('I155' + nom + 'un plafond qui mord sans l’état tenue_apres_zero (' + k.etat + ')');
        if (k.ligne && nombre(k.ligne.charge) !== null && nombre(k.ligne.charge) >= Ch - 1e-9) erreurs.push('I155' + nom + 'une ligne à ' + k.ligne.charge + ' kg, au-dessus de la charge restée à 0 rep (' + Ch + ' kg)');
        if (k.haut) erreurs.push('I155' + nom + 'une ligne haute pendant le plafond');
        if (!k.ligne || nombre(k.ligne.charge) !== nombre(k.palier)) erreurs.push('I155' + nom + 'une ligne qui n’est pas le palier tenu (' + (k.ligne ? k.ligne.charge : 'aucune') + ' pour ' + k.palier + ')');
        ['palier', 'niveau', 'n', 'zone'].forEach(function (cle) {
          if (cle === 'n' && k.allegee) return;   // PR 3 (N4) : la Décharge réduit `n` (60 % des séries), le plafond n'y est pour rien
          if (sans[cle] !== undefined && k[cle] !== sans[cle]) erreurs.push('I155' + nom + cle + ' modifié par le plafond (' + k[cle] + ' pour ' + sans[cle] + ')');
        });
        if (sans.ligne && nombre(sans.ligne.charge) !== null && k.ligne && nombre(k.ligne.charge) > nombre(sans.ligne.charge) + 1e-9) erreurs.push('I155' + nom + 'une ligne plafonnée plus lourde que celle d’avant plafond');
        ['effortVise', 'approchee', 'cranGros', 'preuve', 'test'].forEach(function (cle) {
          if (k.fondement[cle] !== undefined) erreurs.push('I155' + nom + 'le fondement d’une tenue après un zéro porte « ' + cle + ' »');
        });
        if (x.reserveVisee !== null && x.reserveVisee !== undefined) erreurs.push('I154' + nom + 'un effort visé à ' + x.reserveVisee + ' pendant la tenue après un zéro');
      } else if (k.etat === 'tenue_apres_zero') {
        erreurs.push('I155' + nom + 'une tenue après un zéro sans plafond qui mord');
      }
      if (M.estApresZero(k)) {
        if (nombre(x.reserveAffichee) !== null && nombre(x.reserveAffichee) < Moteur().RESERVE_PLANCHER) erreurs.push('I154' + nom + 'un effort visé à ' + x.reserveAffichee + ' en réserve après un zéro rep');
        var test = (x.planInitial || []).concat(x.lignes || []).some(function (l) { return l && l.role === 'test'; });
        if (test) erreurs.push('I154' + nom + 'une ligne de test après un zéro rep');
      }
    });
  }

  // I157 et I158 (PR 4b, R-A, MOTEUR §9.42 bis) — UNE VOIX APRÈS UN 0 REP.
  //   · I157 (a) — jamais deux phrases après la même série à 0 rep : quand la réaction au zéro parle, ni `x.message`, ni la porte du cran, ni la carte « un cran
  //     dessous », ni la carte de la forme du jour ne parlent pour cet exercice ; et quand le plafond mord, `parisRates` est muet ;
  //     (b) — la phrase du plafond n'existe que s'il mord, dit sa charge, et n'écrit aucun nombre de séances ;
  //   · I158 — toute série validée à 0 rep (la dernière de l'exercice, hors cas muets, au-dessus du palier tenu, plus lourde que tout succès) a une réaction `Z1` ou
  //     `Z2` ; Z1 : la charge est `D(charge)` et au moins une ligne non validée est plus lourde que `D` ; Z1 et Z2 : aucune fourchette, aucun `garde`, aucun
  //     `recalculeReculs` ; les cas muets : aucune réaction au zéro.
  // I255 (R2, 20/11/2026, MOTEUR §9.42 bis) — LE JOUR SANS. Une `zero_rep` qui porte `zeroRep.jourSans` : jamais une population protégée, une charge restée à 0 à ou sous la charge de
  // travail (`palier`, relu ici par une comparaison indépendante), ce qui était tenu dit au palier, et ses paris sont marqués `jourSans` (ils ne se comptent pas). Un `retour_jour_sans` :
  // la ligne EST la charge de travail ET son niveau (jamais au-dessus), aucune ligne haute ni zéro rep ; tout fait `jourSans` sans état de retour est une erreur. La séance légère ne
  // vote nulle part et un 2e zéro donne B, jamais un 2e jour sans : cela se lit sur l'HISTOIRE (le moteur), pas sur un plan — `v2-jour-sans.test.js`.
  // YO-YO-ZERO (25/11/2026) : « le retour imposé ne relève jamais le jeton, une règle B le consomme » est de même une lecture d'HISTOIRE (le jeton n'existe pas dans un plan, il se rejoue
  // depuis les séances) : pas de vérification ici, elle est jouée dans `v2-yoyo-zero.test.js`.
  function verifierJourSans(plan, e, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      if (!k) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var f = k.fondement || {};
      var z = f.zeroRep || null, js = z ? z.jourSans : null;
      if (js) {
        var P = nombre(k.palier), Ch = nombre(z.charge);
        if (k.etat !== 'zero_rep') erreurs.push('I255' + nom + 'un jour sans sur une consigne ' + k.etat);
        if (plan.protegee === true) erreurs.push('I255' + nom + 'un jour sans pour une population protégée');
        if (P === null || Ch === null || Ch > P + 1e-9) erreurs.push('I255' + nom + 'un jour sans à ' + z.charge + ' kg, au-dessus de la charge de travail (' + k.palier + ' kg)');
        if (!js.tenue || nombre(js.tenue.charge) !== P) erreurs.push('I255' + nom + 'un jour sans dont la charge tenue n’est pas le palier');
        (x.paris || []).forEach(function (q, j) {
          if (q && !(q.fondement && q.fondement.jourSans === true)) erreurs.push('I255' + nom + 'le pari de la série ' + j + ' d’une séance plus légère ne dit pas « jourSans » (il serait compté)');
        });
      }
      if (k.etat === 'retour_jour_sans') {
        var r = f.jourSans || null, Pr = nombre(k.palier), nv = nombre(k.niveau);
        if (!r || r.retour !== true) erreurs.push('I255' + nom + 'un retour sans le fait du jour sans');
        if (!k.ligne || Pr === null || nombre(k.ligne.charge) !== Pr) erreurs.push('I255' + nom + 'un retour dont la ligne (' + (k.ligne ? k.ligne.charge : 'aucune') + ' kg) n’est pas la charge de travail (' + k.palier + ' kg)');
        else if (nv === null || nombre(k.ligne.vise) > nv) erreurs.push('I255' + nom + 'un retour dont la ligne vise ' + k.ligne.vise + ' pour un niveau de ' + k.niveau + ' : jamais au-dessus du niveau d’avant');
        if (k.haut) erreurs.push('I255' + nom + 'une ligne haute au retour d’un jour sans');
        if (f.zeroRep) erreurs.push('I255' + nom + 'un retour qui porte un zéro rep');
      } else if (f.jourSans) {
        erreurs.push('I255' + nom + 'le fait du retour sur une consigne ' + k.etat);
      }
    });
  }
  function verifierVoixDuZero(plan, e, erreurs) {
    var M = Moteur(), S = Seance(), T = racine.THModele;
    var exos = e && e.seance && Array.isArray(e.seance.exercices) ? e.seance.exercices : [];
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var k = x.consigne, r = x.rate;
      var pz = k && k.fondement ? k.fondement.plafondZero : null;
      var rz = r && r.niveau === 'zero' ? r : null;
      if (rz) {
        if (x.message) erreurs.push('I157' + nom + 'deux phrases après le même 0 rep (la réaction au zéro et la réaction §9.14)');
        if (x.porteDuCran && x.porteDuCran.fermee && x.porteDuCran.iSerie === rz.iSerie) erreurs.push('I157' + nom + 'deux phrases après le même 0 rep (la porte du cran et la réaction au zéro)');
        if (x.parisRates && x.parisRates.carte) erreurs.push('I157' + nom + 'deux phrases après le même 0 rep (la carte « un cran dessous » et la réaction au zéro)');
        if (x.carteForme) erreurs.push('I157' + nom + 'deux phrases après le même 0 rep (la forme du jour et la réaction au zéro)');
        if (rz.fourchette || (rz.garde !== null && rz.garde !== undefined) || rz.recalculeReculs === true) erreurs.push('I158' + nom + 'une réaction au zéro avec fourchette, garde ou recalcul des reculs');
        if (rz.cas !== 'Z1' && rz.cas !== 'Z2') erreurs.push('I158' + nom + 'une réaction au zéro de cas ' + rz.cas);
      }
      // I159 — le bouton « Tenter » : sa charge est celle de `sans` (haut ≥ Ch, sinon la ligne ; « le cran au-dessus » si nulle), jamais `Ch` par défaut ; pris, la consigne
      // affichée est celle d'avant plafond (la ligne ou le haut restitués valent la charge du bouton).
      var tz = x.tenueZero || null;
      if (tz) {
        if (tz.tente === true) {
          if (!k || k.etat === 'tenue_apres_zero' || !(pz && pz.tente === true)) erreurs.push('I159' + nom + 'Tenter pris, la consigne affichée n’est pas celle d’avant plafond');
          else if (tz.charge !== null && tz.charge !== undefined) {
            var hT = k.haut ? nombre(k.haut.charge) : null, lT = k.ligne ? nombre(k.ligne.charge) : null;
            var rendu = hT !== null && hT >= nombre(pz.charge) - 1e-9 ? hT : lT;
            if (rendu === null || Math.abs(rendu - nombre(tz.charge)) > 1e-9) erreurs.push('I159' + nom + 'Tenter ' + tz.charge + ' kg restitue ' + rendu + ' kg');
          }
        } else {
          var bt = M.boutonsDeLaTenue(k);
          if (!bt) erreurs.push('I159' + nom + 'un bouton « Tenter » sans plafond qui mord');
          else {
            if (bt.bouton !== tz.bouton || bt.charge !== tz.charge) erreurs.push('I159' + nom + 'le bouton « ' + tz.bouton + ' » n’est pas la charge de la consigne d’avant plafond (« ' + bt.bouton + ' »)');
            if (pz && nombre(bt.charge) !== null && nombre(bt.charge) === nombre(pz.charge) && !(pz.sans && ((pz.sans.ligne && nombre(pz.sans.ligne.charge) === nombre(pz.charge)) || (pz.sans.haut && nombre(pz.sans.haut.charge) === nombre(pz.charge))))) erreurs.push('I159' + nom + 'le bouton « Tenter » reprend la charge du zéro par défaut');
          }
        }
      }
      if (pz && pz.mord === true && x.parisRates && x.parisRates.carte) erreurs.push('I157' + nom + 'la carte « un cran dessous » pendant la tenue après un zéro');
      // (b) la phrase du plafond
      var gris = ((x.phrases || []).filter(function (q) { return q.ou === 'entete.gris'; })[0] || {}).texte || '';
      var pourquoiP = ((x.phrases || []).filter(function (q) { return q.ou === 'pourquoi'; })[0] || {}).texte || '';
      // PR 3 (N4) — en Décharge, le gris est celui de la Décharge : la phrase du plafond ne s'y dit pas (la ligne est déjà le palier, allégée).
      var parle = /pas encore\. Je garde/.test(String(gris)) && k && k.etat === 'tenue_apres_zero';
      if (parle && !(pz && pz.mord === true)) erreurs.push('I157' + nom + 'la phrase du plafond sans plafond qui mord');
      if (k && k.etat === 'tenue_apres_zero' && !k.allegee) {
        var dit = String(gris) + ' ' + String(pourquoiP);
        if (pz && nombre(pz.charge) !== null && String(gris).replace(/\s/g, ' ').replace(/(\d),(\d)/g, '$1.$2').indexOf(String(pz.charge)) < 0) erreurs.push('I157' + nom + 'la phrase du plafond ne dit pas la charge restée à 0 rep (' + pz.charge + ')');
        if (/\b\d+\s+séances?\b/.test(dit) || /quand même|plafond|assidu/i.test(dit)) erreurs.push('I157' + nom + 'la phrase du plafond écrit un nombre de séances, « plafond » ou « quand même »');
      }
      // I158 (étendu le 19/11/2026), I236, I237 — la lecture indépendante du plan : CHAQUE série validée à 0 rep (charge > 0, de travail ou manquée ; ni lest ni aide : le cas E)
      // a sa réaction dans `x.zeros`, la même que `x.rate` sous la dernière, les étapes et le compte ; `D` ≤ min(C, le plus léger zéro de la séance), compatible avec la visée
      // (Epley inverse) sauf relevé à une série réussie du jour plus légère que C ; une série réussie à C ou au-dessus : Z2.
      var exo = exos[x.iExo];
      if (!exo || !k) return;
      var series = exo.series || [];
      var catZ = e && e.catalogue && x.slug && Object.prototype.hasOwnProperty.call(e.catalogue, x.slug) ? e.catalogue[x.slug] : {};
      var muet = plan.intention === 'entretien' || x.intention === 'entretien' || x.mode === 'entretien' || !!plan.allegee || !!k.allegee || !!plan.semaineDeTest || !!x.semaineDeTest ||
        !!x.calage || !!x.sansCoach || !!x.figure || !!x.veilleLegere || !!x.douleur || !(x.mesure === null || x.mesure === undefined || x.mesure === 'charge_reps') || plan.edition === true || !!(e && e.seance && e.seance.edition);
      var lestOuAide = !!catZ && (catZ.charge === 'ajoutee' || catZ.charge === 'assistance');
      var entrees = x.zeros || [];
      var gestesZ = e && e.seance && Array.isArray(e.seance.gestes) ? e.seance.gestes : [];
      series.forEach(function (sr, j) {
        if (!S.partEnBase(sr)) return;
        var ch = nombre(sr.charge_kg), reps = nombre(sr.reps);
        var estZero = T.estZeroDeTravail(sr);
        var entree = entrees.filter(function (q) { return q.iSerie === j; })[0] || null;
        if (!estZero || lestOuAide) {
          if (entree) erreurs.push('I237' + nom + 'une réaction au zéro sous la série ' + j + ', qui n’est pas un zéro de travail à charge');
          return;
        }
        if (!entree) { erreurs.push('I237' + nom + 'un 0 rep à ' + ch + ' kg (série ' + j + ') sans réaction au zéro'); return; }
        if (muet) {
          if (!entree.silence || (rz && rz.iSerie === j)) erreurs.push('I158' + nom + 'une réaction au zéro dans un contexte où le coach se tait');
          return;
        }
        if (entree.silence || (entree.cas !== 'Z1' && entree.cas !== 'Z2')) { erreurs.push('I237' + nom + 'un 0 rep à ' + ch + ' kg (série ' + j + ') sans réaction Z1 ou Z2'); return; }
        // C : le plus léger zéro de la séance jusqu'à cette série ; les séries réussies du jour jusque-là.
        var Cmin = ch, reussies = [];
        series.forEach(function (q, m) {
          if (m > j || !S.partEnBase(q) || T.typeDe(q) === 'echauffement' || T.estHorsCalcul(q)) return;
          var cq = nombre(q.charge_kg), rq = nombre(q.reps);
          if (T.estZeroDeTravail(q) && !T.estRecul(q) && cq < Cmin) Cmin = cq;   // R1 : la plus légère charge de TRAVAIL restée à 0 (un recul n'y entre pas, `zeroPartiel`)
          if (rq !== null && rq >= 1 && cq !== null && cq > 0) reussies.push(cq);
        });
        var incident = reussies.some(function (v) { return v >= Cmin - 1e-9; });
        if (incident && entree.cas !== 'Z2') erreurs.push('I158' + nom + 'une série réussie du jour à ' + Cmin + ' kg ou au-dessus : un incident, Z2 sans bouton (pas Z1)');
        // R1 (20/11/2026, I237 étendu) — un RECUL à 0 rep : Z2, une phrase seule ; jamais Z1, bouton, fourchette ni « garde ».
        if (T.estRecul(sr) && entree.cas !== 'Z2') erreurs.push('I237' + nom + 'un recul à 0 rep (série ' + j + ') dit ' + entree.cas + ' : une phrase seule (Z2), jamais un bouton');
        if (entree.cas === 'Z1') {
          var D = nombre(entree.descente);
          if (D === null) { erreurs.push('I158' + nom + 'Z1 sans descente'); return; }
          if (!(D < Cmin - 1e-9)) erreurs.push('I158' + nom + 'Z1 propose ' + D + ' kg : jamais à la charge déjà ratée (' + Cmin + ' kg) ni au-dessus');
          // Les lignes qui restent se lisent AVANT le « Prendre » (qui les passe à D) : une réaction prise n'est plus recomptée contre elles (le kg du geste, I116, fait foi).
          if (!entree.prise) {
            var restantesZ = (x.lignes || []).filter(function (l) { return (l.type === 'travail' || l.type === 'recul') && l.role !== 'hors' && l.iSerie !== j && (!l.validee || l.iSerie > j); });
            var lourdeZ = null;
            restantesZ.forEach(function (l) {
              var c2 = nombre(l.charge);
              if (lourdeZ === null || (c2 === null && nombre(lourdeZ.charge) !== null) || (c2 !== null && nombre(lourdeZ.charge) !== null && c2 > nombre(lourdeZ.charge))) lourdeZ = l;
            });
            var vZ = lourdeZ ? nombre(lourdeZ.vise) : null;
            var plusLourde = restantesZ.some(function (l) { return nombre(l.charge) === null || nombre(l.charge) > D + 1e-9; });
            if (!plusLourde) erreurs.push('I158' + nom + 'Z1 sans ligne non validée plus lourde que ' + D + ' kg');
            if (vZ !== null && vZ >= 1 && D > Cmin / M.unRMEpley(1, vZ) + 1e-6) {
              var moinsLourdes = reussies.filter(function (v) { return v < Cmin - 1e-9; });
              var meilleure = moinsLourdes.length ? Math.max.apply(null, moinsLourdes) : null;
              if (meilleure === null || Math.abs(D - meilleure) > 1e-9) erreurs.push('I158' + nom + 'Z1 propose ' + D + ' kg × ' + vZ + ' : plus que ' + (Math.round(Cmin / M.unRMEpley(1, vZ) * 100) / 100) + ' kg (Epley inverse de ' + Cmin + ' kg) sans être une charge réussie du jour');
            }
          }
          // la borne des 95 % : la descente de B sur la même grille (`descenteDe`), jamais dépassée sauf par une charge réussie du jour
          var D95 = x.contexte && typeof x.contexte.descenteDe === 'function' ? x.contexte.descenteDe(Cmin) : null;
          var succesLegers = reussies.filter(function (v) { return v < Cmin - 1e-9; });
          var releve = succesLegers.length ? Math.max.apply(null, succesLegers) : null;
          if (D95 !== null && D > D95 + 1e-9 && (releve === null || Math.abs(D - releve) > 1e-9)) erreurs.push('I158' + nom + 'Z1 propose ' + D + ' kg, au-dessus du cran des 95 % de ' + Cmin + ' kg (' + D95 + ' kg)');
          if (rz && rz.iSerie === j && (!rz.charge || nombre(rz.charge.kg) !== D)) erreurs.push('I158' + nom + 'la réaction affichée propose ' + (rz.charge ? rz.charge.kg : 'rien') + ' kg, la descente est ' + D);
        }
        // sous la dernière série de l'exercice, la réaction est affichée
        var dernierJ = null;
        series.forEach(function (q, m) { if (S.partEnBase(q) && T.typeDe(q) !== 'echauffement' && !T.estHorsCalcul(q) && !T.estTest(q)) dernierJ = m; });
        if (dernierJ === j && !rz) erreurs.push('I158' + nom + 'un 0 rep à ' + ch + ' kg sous la dernière série sans réaction au zéro affichée');
        // une seule réaction : l'affichage, les étapes et le geste ignoré disent le même cas
        if (rz && rz.iSerie === j && rz.cas !== entree.cas) erreurs.push('I237' + nom + 'la série ' + j + ' dit ' + rz.cas + ' à l’écran et ' + entree.cas + ' dans les étapes');
        if (entree.proposition !== (entree.cas === 'Z1')) erreurs.push('I237' + nom + 'la série ' + j + ' : ' + entree.cas + ' ' + (entree.proposition ? 'compte' : 'ne compte pas') + ' comme proposition ignorée');
        gestesZ.forEach(function (g) {
          if (g && g.geste === 'rate_ignoree' && g.slug === x.slug && g.rang === j && g.cas !== undefined && g.cas !== entree.cas) erreurs.push('I237' + nom + 'rate_ignoree dit ' + g.cas + ' sous la série ' + j + ', la réaction est ' + entree.cas);
          if (g && g.geste === 'rate_ignoree' && g.slug === x.slug && g.rang === j && Array.isArray(g.boutons) && (g.boutons.length > 0) !== (entree.cas === 'Z1')) erreurs.push('I237' + nom + 'rate_ignoree sous la série ' + j + ' : boutons ' + JSON.stringify(g.boutons) + ' pour ' + entree.cas);
        });
      });
      // I236 — aucune fourchette ni « garde » sur une série à 0 rep, à aucun niveau : la réaction affichée sous une série à 0 rep, jamais « entre 1 et 1 ».
      if (r && series[r.iSerie] && nombre(series[r.iSerie].reps) === 0 && (r.fourchette || (r.garde !== null && r.garde !== undefined) || r.niveau === 'exercice')) {
        erreurs.push('I236' + nom + 'une fourchette ou un « garde » sous une série à 0 rep (série ' + r.iSerie + ')');
      }
    });
  }

  // I68 (MOTEUR §9.7 / §10.2, 175) — LE GROS CRAN : un cran n'est gros que si (T − P) / P dépasse (haut − bas) × 2,5 % ; son test
  // se valide au plancher max(bas − 2, 8 sur une isolation, 4 sinon), jamais au-dessus du bas ni sous 8 sur une isolation ;
  // la cible d'étirement va de haut + 2 à haut + 6, jamais au-delà de 30 ; la carte des leviers ne vient qu'après deux essais
  // ratés ou au plafond de la cible, et ne porte jamais de réserve ni d'échec.
  function verifierGrosCran(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      var g = k && k.fondement && k.fondement.cranGros;
      if (!g) return;
      var nom = 'I68 — exercice ' + i + ' (' + x.slug + ') : ';
      var z = k.zone ? M.zoneParCle(k.zone) : null;
      if (!z) { erreurs.push(nom + 'un gros cran sans zone'); return; }
      var delta = g.de > 0 ? (g.vers - g.de) / g.de * 100 : 0;
      if (!(delta > (z.haut - z.bas) * M.GROS_CRAN_PAR_REP)) erreurs.push(nom + 'un cran de ' + Math.round(delta) + ' % dit gros, la zone ' + z.bas + '-' + z.haut + ' l’absorbe');
      if (g.pct !== Math.round(delta)) erreurs.push(nom + 'le pourcentage dit ' + g.pct + ' pour un écart de ' + Math.round(delta));
      var iso = g.isolation === true;   // ce que la règle a lu à son calcul (figé avec la consigne), pas le catalogue de l'instant
      var plancher = Math.min(z.bas, Math.max(z.bas - 2, iso ? M.GROS_PLANCHER_ISOLATION : M.GROS_PLANCHER));
      if (g.plancher !== plancher) erreurs.push(nom + 'le plancher est ' + g.plancher + ', attendu ' + plancher);
      if (g.plancher > z.bas) erreurs.push(nom + 'le plancher ' + g.plancher + ' au-dessus du bas ' + z.bas);
      if (iso && g.plancher < Math.min(z.bas, M.GROS_PLANCHER_ISOLATION)) erreurs.push(nom + 'le test d’une isolation validé sous ' + M.GROS_PLANCHER_ISOLATION + ' reps');
      if (k.etat === 'test_propose' && k.haut && k.haut.vise !== g.plancher) erreurs.push(nom + 'le test du gros cran vise ' + k.haut.vise + ', pas le plancher ' + g.plancher);
      if (g.ratees !== undefined) {
        var cible = k.fondement.cible;
        var max = M.cibleMaxDuGros(z);
        if (typeof cible === 'number' && (cible > max || cible > 30 || cible < z.haut + M.GROS_RECUL_REPS)) {
          erreurs.push(nom + 'la cible d’étirement ' + cible + ' hors de ' + (z.haut + M.GROS_RECUL_REPS) + '-' + max);
        }
        var carte = x.escalier && x.escalier.gros === true;
        if (carte && !(g.carte === true)) erreurs.push(nom + 'la carte des leviers du gros cran sans deux essais ratés ni cible au plafond');
      }
    });
  }


  // I110 à I112 (MOTEUR §9.36, 197) — LA PUISSANCE DES 65 ANS ET PLUS :
  //   · I110 — la puissance ne paraît que si l'âge est connu et de 65 ans ou plus (`entrees.plus65 === true`), jamais en Édition ni en « Juste un
  //     carnet » ; jamais deux exercices ; la phrase est celle du moteur ;
  //   · I111 — l'exercice est dans la séance, polyarticulaire, léger (jamais une barre), mesuré en reps, hors zone à ménager et douleur récente ;
  //   · I112 — aucune promesse médicale dans la phrase ni dans son « pourquoi » (guérir, soigner, prévenir une maladie, ostéoporose, diabète).
  function verifierForme(plan, entrees, erreurs) {
    var M = Moteur(), e = entrees || {}, pu = plan && plan.puissance;
    if (!pu) return;
    if (e.plus65 !== true) erreurs.push('I110 — la consigne de puissance sans âge de 65 ans ou plus connu');
    if (plan.edition) erreurs.push('I110 — la consigne de puissance en Édition');
    if (plan.intention === 'entretien') erreurs.push('I110 — la consigne de puissance en « Juste un carnet »');
    if (pu.texte !== M.FORME_PUISSANCE_PHRASE) erreurs.push('I110 — la phrase de puissance n\u2019est pas celle du moteur');
    var x = (plan.exercices || []).filter(function (y) { return y && y.slug === pu.slug; })[0];
    if (!x) { erreurs.push('I111 — l\u2019exercice de puissance n\u2019est pas dans la séance : ' + pu.slug); return; }
    var f = (e.catalogue || {})[pu.slug] || {};
    if (f.equipement === 'barre') erreurs.push('I111 — la puissance sur une barre : ' + pu.slug);
    if (f.mesure && f.mesure !== 'charge_reps' && f.mesure !== 'reps') erreurs.push('I111 — la puissance sur un exercice tenu : ' + pu.slug);
    if (!M.estPolyarticulaire({ prim: f.muscles_primaires || [], sec: f.muscles_secondaires || [], stab: f.muscles_stabilisateurs || [] })) {
      erreurs.push('I111 — la puissance sur une isolation : ' + pu.slug);
    }
    var G = racine.THGenerateur, jour = M.jourCivil(e.seance && e.seance.debut);
    var menager = Array.isArray(e.menagerProfil) ? e.menagerProfil : [];
    if (G && G.zonesQueChargeLExercice(pu.slug, ['genou', 'dos', 'epaule', 'coude', 'hanche']).some(function (z) { return menager.indexOf(z) >= 0; })) {
      erreurs.push('I111 — la puissance sur une zone à ménager : ' + pu.slug);
    }
    if (G && jour && e.douleurs && e.douleurs[pu.slug] && M.douleurRecente(e.douleurs[pu.slug], jour)) erreurs.push('I111 — la puissance sur un exercice douloureux : ' + pu.slug);
    if (/gu[ée]ri|soign|ost[ée]opor|diab[èe]t|thérap|therap|maladie|médic(?!in)/i.test(String(pu.texte) + ' ' + String(pu.pourquoi))) {
      erreurs.push('I112 — une promesse médicale dans la phrase de puissance');
    }
  }

  // I94 à I98 (MOTEUR §9.31, 194-1) — LA MOBILITÉ EN FIN DE SÉANCE :
  //   · I94 — avant la séance, jamais un étirement tenu : la préparation ne porte que de la mobilité EN MOUVEMENT, pour une zone raide
  //     qu'un exercice du jour sert, 2 minutes au plus ; et le bloc de fin ne porte que des étirements tenus du catalogue ;
  //   · I95 — le bloc de fin : deux zones au plus, des zones déclarées raides, aucune qui a déjà ses 10 minutes de la semaine ; des
  //     tenues de 30 à 60 s, 3 séries au plus par exercice ; le bloc ne dépasse pas ce qui manque à la zone (10 minutes) ;
  //   · I96 — une zone raide qui est aussi à ménager (profil, ou « J'ai mal » récent sur un exercice qui la charge) ne reçoit aucun
  //     exercice : le plan dit à la place « … à ménager : pour l'étirer, demande l'avis d'un kiné. » ; aucun exercice choisi ne charge une
  //     articulation à ménager ;
  //   · I97 — « J'ai peu de temps » retire le bloc d'abord : aucun bloc, avant ni fin, dans une séance raccourcie ;
  //   · I98 — la consigne du bloc est « Sans douleur : une tension nette, pas plus. » ; jamais « récupération », « courbatures » ni
  //     « prévention » ; le plan se tait sans zones raides, en Édition, en « Juste un carnet » et après trois « Non merci » de suite.
  // 20/11/2026 (MOTEUR §9.15 et §9.41 delta, décision d'Aurélien) — LA MONTÉE UNIQUE, vérifiée par une arithmétique à part (jamais par
  // `monteeDeChauffe`) :
  //   I244 « une seule montée » : toute montée affichée (la proposition, la demande, les lignes hors « + Chauffe » et hors chauffes faites)
  //        monte strictement, reste sous la référence, sa dernière ≤ 90 % ; une ligne « Trop léger » ne précède jamais une ligne chargée ; la
  //        marque `barre` (la barre vide) n'est que sur la 1re ligne, jamais au sol, jamais en « peu de temps » ; la demande = la proposition (I185).
  //   I245 « la dernière selon la zone » : la dernière chauffe d'une montée que le coach choisit est à moins de 7,5 kg (ou d'un cran et demi
  //        hors barre) de R × 88 % (5 reps ou moins), 80 % (6 à 8) ou 75 % (9 et plus) ; d'une routine fixée, de R × 88 %.
  //   I246 « le nombre du coach » : sans nombre fixé, sur une barre libre et un 1er exercice du muscle, hors « peu de temps », la proposition
  //        compte la barre vide plus ⌈(D − barre) / 40⌉ marches (au moins une) ; un nombre fixé n'est jamais retiré (I32).
  //   I247 « + Chauffe s'approche » : une ligne ajoutée chargée est strictement entre la chauffe d'avant et R, ≤ 95 % de R (90 % hors d'une
  //        visée de 3 à 5 reps, pour une population protégée ou en reprise longue) ; sa phrase « Chauffe ajoutée : … » ; sans place, TROP_PROCHE.
  //   I248 « une marche seule à froid » : une proposition d'une seule chauffe chargée, sans barre vide avant, est ≤ 70 % de R (I127 réécrit :
  //        en « peu de temps », deux chauffes dès 100 kg à la barre libre, une ailleurs).
  //   I249 « poids du corps et lest » : la série du mouvement a ⌈visée / 3⌉ reps entre 2 et 5, sous la visée, aucune si la visée est ≤ 2 ;
  //        au lesté, la 1re ligne à lest 0, la 2e seulement dès 20 kg de lest, à la moitié au cran de 2,5 kg vers le bas, × 2 ; aucune aux pompes.
  //   I250 « programme du coach » : un exercice dont le coach choisit les chauffes (`chauffesDuCoach`) n'a jamais de carte à accepter : sa
  //        proposition est un ajout automatique avec « Annuler » ; en silence (I128), rien.
  var I244_MARGE_BARRE = 7.5;
  function verifierLaMontee(plan, entrees, erreurs) {
    var e = entrees || {}, M = Moteur();
    var exos = (e.seance && e.seance.exercices) || [], cat = e.catalogue || {};
    var duCoach = e.chauffesDuCoach || {};
    (plan.exercices || []).forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ')';
      var fiche = cat[x.slug] || {};
      var barre = fiche.equipement === 'barre';
      var sol = (M.SOULEVES_AU_SOL || []).indexOf(x.slug) >= 0;
      var miens = fiche.muscles_primaires || [], deja = false;
      for (var k = 0; k < i && !deja; k++) {
        var autre = cat[exos[k] && exos[k].exercise_slug];
        deja = !!autre && (autre.muscles_primaires || []).some(function (m) { return miens.indexOf(m) >= 0; });
      }
      var seriesX = (exos[i] && exos[i].series) || [];
      var premiere = (x.lignes || []).filter(function (l) {
        var sl = seriesX[l.iSerie];
        return l.type !== 'echauffement' && sl && racine.THModele.estTravail(sl) && sl.test_pose !== true;
      })[0] || null;
      var visee = premiere ? nombre(premiere.vise) : null;
      var serie = premiere ? seriesX[premiere.iSerie] : null;
      if (visee === null && serie) visee = nombre(serie.reps) !== null ? nombre(serie.reps) : nombre(serie.reps_visees);
      // La part de la dernière marche selon la bande (la bande est LA notion, `Modele.bandeDeReps` ; la part est recopiée ici, à part du moteur).
      var PARTS = { lourdes: 0.88, moyennes: 0.80, hautes: 0.75, longues: 0.75 };
      var partDe = function (v) { var b = v === null ? null : racine.THModele.bandeDeReps(v); return b && PARTS[b] ? PARTS[b] : 0.88; };
      var lest = fiche.charge === 'ajoutee';
      var corps = fiche.mesure === 'reps' && fiche.equipement === 'aucun' && fiche.charge !== 'assistance' && !lest;
      // CONTRA-725 D3 — la barre vide pèse la barre de la salle (la source que l'app branche, `brancherBarreDeLaSalle`), jamais 20 en dur.
      var B = barre ? M.barreDesChauffes() : 0;
      var p = x.proposition;
      // I244 — la proposition et la demande.
      [['la proposition', p], ['la demande', x.surDemande]].forEach(function (q) {
        var m = q[1];
        if (!m || !Array.isArray(m.lignes)) return;
        var ref = nombre(m.reference), av = null;
        m.lignes.forEach(function (l) {
          var c = nombre(l[0]);
          if (c === null || ref === null || m.situation === 'lest' && c === 0) return;
          if (av !== null && !(c > av + 1e-9)) erreurs.push('I244' + nom + ' : ' + q[0] + ' ne monte pas (' + av + ' puis ' + c + ')');
          if (!(c < ref - 1e-9)) erreurs.push('I244' + nom + ' : ' + q[0] + ' atteint la charge de travail (' + c + ' kg)');
          av = c;
        });
        if (av !== null && ref !== null && m.situation === 'paliers' && av > 0.90 * ref + 1e-9) erreurs.push('I244' + nom + ' : ' + q[0] + ' finit au-dessus de 90 % (' + av + ' kg sur ' + ref + ')');
        // I245 / I246 — la montée que le coach choisit (une barre, hors « peu de temps »).
        if (m.situation === 'paliers' && av !== null && ref !== null && !m.peuDeTemps) {
          var marge = barre ? I244_MARGE_BARRE : 1.5 * Math.max(nombre(fiche.cran) || 2.5, 2.5);
          var visePart = partDe(visee) * ref;
          // CONTRA-725 D11 — loin dans les DEUX sens (une dernière trop haute pour la zone aussi) ; la salle déclarée seule garde la tolérance
          // de ses charges (une dernière plus basse que la part quand la salle n'a rien entre deux).
          var loin = Math.abs(av - visePart) > marge + 1e-9 && (!x.salle || av < 0.90 * ref - 10);
          if (loin) erreurs.push('I245' + nom + ' : ' + q[0] + ' finit à ' + av + ' kg, loin de ' + Math.round(partDe(visee) * 100) + ' % de ' + ref + ' kg');
          if (barre && !sol && !deja && ref >= B + 5) {
            var chargees = m.lignes.filter(function (l) { return nombre(l[0]) !== null; });
            var attendu = Math.min(6, 1 + Math.max(1, Math.ceil((av - B) / 40 - 1e-9)));
            var b0 = nombre(chargees[0] && chargees[0][0]);
            // La barre vide seule (une dernière marche qui ne dépasserait pas la barre) n'a pas de marche à compter.
            var avecBarre = b0 !== null && b0 <= B + 1e-9 && chargees.length >= 2;
            if (avecBarre && chargees.length !== attendu) erreurs.push('I246' + nom + ' : ' + q[0] + ' compte ' + chargees.length + ' chauffes, la règle en donne ' + attendu);
          }
        }
        // I248 — une marche seule à froid.
        var ch = m.lignes.filter(function (l) { return nombre(l[0]) !== null && nombre(l[0]) > 0; });
        if (m.situation === 'paliers' && ch.length === 1 && ref !== null && !(barre && !sol && nombre(ch[0][0]) <= B + 1e-9) && nombre(ch[0][0]) > 0.70 * ref + 1e-9) {
          erreurs.push('I248' + nom + ' : ' + q[0] + ' : une seule chauffe à froid à ' + ch[0][0] + ' kg, au-dessus de 70 % de ' + ref + ' kg');
        }
        // I249 — le poids du corps et le lest.
        if (m.situation === 'corps' || m.situation === 'lest') {
          var r0 = nombre(m.lignes[0] && m.lignes[0][1]);
          var attenduR = visee === null || visee <= 2 ? null : Math.max(2, Math.min(5, Math.ceil(visee / 3 - 1e-9)));
          if (attenduR === null) erreurs.push('I249' + nom + ' : ' + q[0] + ' au poids du corps sans visée de plus de 2 reps');
          else if (r0 !== attenduR || !(r0 < visee)) erreurs.push('I249' + nom + ' : ' + q[0] + ' au poids du corps à ' + r0 + ' reps (attendu ' + attenduR + ')');
          if (m.situation === 'corps' && m.lignes.length !== 1) erreurs.push('I249' + nom + ' : plus d’une série du mouvement');
          if (m.situation === 'lest') {
            if (nombre(m.lignes[0][0]) !== 0) erreurs.push('I249' + nom + ' : la 1re chauffe du lesté n’est pas au poids du corps');
            var lst = nombre(m.reference);
            var deux = lst !== null && lst >= 20 - 1e-9 && !m.peuDeTemps;
            if (deux !== (m.lignes.length === 2)) erreurs.push('I249' + nom + ' : ' + m.lignes.length + ' chauffe(s) pour ' + lst + ' kg de lest');
            if (m.lignes.length === 2 && (Math.abs(nombre(m.lignes[1][0]) - Math.floor(lst / 2 / 2.5 + 1e-9) * 2.5) > 1e-9 || m.lignes[1][1] !== 2)) {
              erreurs.push('I249' + nom + ' : la 2e chauffe du lesté n’est pas la moitié du lest × 2');
            }
          }
          if (/^pompes(_|$)/.test(x.slug)) erreurs.push('I249' + nom + ' : une chauffe à part sur des pompes');
        }
      });
      // I250 — le programme du coach.
      if (duCoach[x.slug] === true && p && (p.mode !== 'auto' || p.annulable !== true)) erreurs.push('I250' + nom + ' : chauffes d’un programme du coach en carte à accepter');
      if (p && p.programme && duCoach[x.slug] !== true) erreurs.push('I250' + nom + ' : raison « programme » hors d’un programme du coach');
      // I244 et I247 — les lignes de la séance.
      var ch2 = x.chauffes;
      if (!ch2) return;
      var lignes = (x.lignes || []).filter(function (l) { return l.chauffe; });
      var refL = nombre(ch2.reference), vuTL = false, av2 = null, avecPhrase = ch2.phrase || '';
      lignes.forEach(function (l, j) {
        var c = l.validee ? null : nombre(l.chauffe.charge);
        if (l.chauffe.barre && (j !== 0 || sol || deja)) erreurs.push('I244' + nom + ' : la barre vide hors de la 1re ligne d’une barre libre (série ' + l.iSerie + ')');
        if (l.chauffe.ajoutee) {
          if (l.validee) return;
          if (c === null) { if (avecPhrase && avecPhrase.indexOf('Trop proche') < 0) erreurs.push('I247' + nom + ' : une chauffe ajoutée sans place, sans sa phrase'); return; }
          var avant = null;
          for (var q = 0; q < j; q++) {
            var lq = lignes[q], sq = lq.validee && exos[i] ? exos[i].series[lq.iSerie] : null;
            var cq = sq ? nombre(sq.charge_kg) : nombre(lq.chauffe.charge);
            if (cq !== null && (avant === null || cq > avant)) avant = cq;
          }
          var plaf = (visee !== null && visee >= 3 && visee <= 5 && plan.protegee !== true && !M.enRepriseLongue(x.consigne)) ? 0.95 : 0.90;
          if (avant !== null && !(c > avant + 1e-9)) erreurs.push('I247' + nom + ' : la chauffe ajoutée (' + c + ' kg) n’est pas au-dessus de la précédente (' + avant + ' kg)');
          if (refL !== null && (!(c < refL - 1e-9) || c > plaf * refL + 1e-9)) erreurs.push('I247' + nom + ' : la chauffe ajoutée (' + c + ' kg) dépasse ' + Math.round(plaf * 100) + ' % de ' + refL + ' kg');
          if (avecPhrase && avecPhrase.indexOf('Chauffe ajoutée') < 0) erreurs.push('I247' + nom + ' : une chauffe ajoutée sans sa phrase');
          return;
        }
        if (l.validee || l.chauffe.corps) return;
        if (c === null) { if (l.chauffe.trop_leger) vuTL = true; return; }
        if (vuTL) erreurs.push('I244' + nom + ' : une ligne « Trop léger » avant une chauffe chargée (série ' + l.iSerie + ')');
        if (av2 !== null && !(c > av2 + 1e-9)) erreurs.push('I244' + nom + ' : la montée ne monte pas (' + av2 + ' puis ' + c + ')');
        av2 = c;
      });
      if (av2 !== null && refL !== null && av2 > 0.90 * refL + 1e-9 && !lignes.some(function (l) { return l.validee; })) erreurs.push('I244' + nom + ' : la dernière chauffe (' + av2 + ' kg) dépasse 90 % de ' + refL + ' kg');
      var chargeesL = lignes.filter(function (l) { return !l.validee && !l.chauffe.ajoutee && nombre(l.chauffe.charge) !== null; });
      var froidSeule = chargeesL.length === 1 && !chargeesL[0].chauffe.barre;
      // CONTRA-725 D7 — I245 « routine » ne lit qu'une montée chargée : ni le lest (sa 2e ligne est la moitié du lest, pas 88 %), ni le poids du corps.
      var monteeChargee = ch2.situation !== 'lest' && ch2.situation !== 'corps' && !lest && !corps;
      if (monteeChargee && ch2.origine === 'routine' && av2 !== null && refL !== null && !froidSeule && !deja && !(chargeesL.length === 1 && chargeesL[0].chauffe.barre) &&
          !lignes.some(function (l) { return l.validee || l.chauffe.ajoutee || l.chauffe.peu_de_temps; }) &&
          Math.abs(av2 - 0.88 * refL) > (barre ? 10 : 1.5 * Math.max(nombre(fiche.cran) || 2.5, 2.5)) + 1e-9 && av2 < 0.90 * refL - 10) {
        erreurs.push('I245' + nom + ' : la dernière chauffe de la routine (' + av2 + ' kg) loin de 88 % de ' + refL + ' kg');
      }
    });
  }

  // I125 à I128 (237, MOTEUR §9.41) — les chauffes proposées par le coach.
  //   I125 : aucune proposition hors des trois conditions (le premier exercice du muscle au-dessus de 60 % du max estimé connu, une zone
  //          à ménager, l'objectif Forme) ;
  //   I126 : les charges montent, aucune n'atteint la charge de travail, la dernière ne dépasse pas 90 % de la charge de travail ;
  //   I127 : « J'ai peu de temps » sur un exercice qui n'est ni une isolation ni au poids du corps (barre ou non) : exactement une chauffe ;
  //   I128 : en silence (deux « Non merci » depuis moins de 4 semaines) aucune proposition ; un ajout automatique expose toujours « Annuler ».
  //   I141 (253-X1) : aucune proposition sur une isolation dont un muscle primaire a déjà été travaillé par un exercice précédent (sauf zone à ménager).
  function verifierChauffesProposees(plan, entrees, erreurs) {
    var e = entrees || {}, M = Moteur();
    var exos = (e.seance && e.seance.exercices) || [], cat = e.catalogue || {};
    (plan.exercices || []).forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ')';
      var p = x.proposition, fiche = cat[x.slug] || null;
      if (p) {
        var ref = nombre(p.reference);
        // I125
        if (['muscle', 'zone', 'forme', 'programme'].indexOf(p.raison) < 0) erreurs.push('I125' + nom + ' : une proposition de chauffes sans raison');
        if (p.raison === 'zone') {
          var zm = e.zonesMenagees && Object.prototype.hasOwnProperty.call(e.zonesMenagees, x.slug) ? e.zonesMenagees[x.slug] : null;
          if (!(zm && !zm.choisie)) erreurs.push('I125' + nom + ' : chauffes « zone à ménager » sans zone à ménager');
        }
        if (p.raison === 'forme' && objectifDuPlan(e.objectif) !== 'forme') erreurs.push('I125' + nom + ' : chauffes « Forme » hors de l\u2019objectif Forme');
        if (p.raison === 'muscle') {
          var miens = (fiche && fiche.muscles_primaires) || [];
          for (var k = 0; k < i; k++) {
            var autre = cat[exos[k] && exos[k].exercise_slug];
            if (autre && (autre.muscles_primaires || []).some(function (m) { return miens.indexOf(m) >= 0; })) {
              erreurs.push('I125' + nom + ' : chauffes « premier exercice du muscle » alors que l\u2019exercice ' + k + ' le sollicite déjà');
              break;
            }
          }
          var e1 = e.e1rms && Object.prototype.hasOwnProperty.call(e.e1rms, x.slug) ? nombre(e.e1rms[x.slug]) : null;
          if (ref !== null && e1 !== null && e1 > 0 && !(ref > M.CHAUFFE_SEUIL_MAX * e1 - 1e-9)) {
            erreurs.push('I125' + nom + ' : chauffes proposées à ' + ref + ' kg, sous ' + M.CHAUFFE_SEUIL_MAX * 100 + ' % du max estimé (' + e1 + ' kg)');
          }
        }
        // I126
        var av = null;
        (p.lignes || []).forEach(function (q) {
          if (q[0] === null || ref === null) return;
          if (av !== null && !(q[0] > av)) erreurs.push('I126' + nom + ' : des chauffes qui ne montent pas (' + av + ' puis ' + q[0] + ')');
          if (!(q[0] < ref)) erreurs.push('I126' + nom + ' : une chauffe (' + q[0] + ' kg) pas sous la charge de travail (' + ref + ' kg)');
          av = q[0];
        });
        if (av !== null && ref !== null && av > M.CHAUFFE_PLAFOND * ref + 1e-9) erreurs.push('I126' + nom + ' : la dernière chauffe (' + av + ' kg) dépasse 90 % de la charge de travail (' + ref + ' kg)');
        // I127
        // 20/11/2026 (I127 réécrit, règle « peu de temps » de TT5) — deux chauffes dès 100 kg à la barre libre, une ailleurs.
        var deuxPeu = fiche && fiche.equipement === 'barre' && (M.SOULEVES_AU_SOL || []).indexOf(x.slug) < 0 && ref !== null && ref >= 100 - 1e-9;
        if (e.raccourci && fiche && p.situation === 'paliers' && !M.estIsolation({ prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [], stab: fiche.muscles_stabilisateurs || [] }) && (p.lignes || []).length !== (deuxPeu ? 2 : 1)) {
          erreurs.push('I127' + nom + ' : « J\u2019ai peu de temps » sur un polyarticulaire chargé avec ' + (p.lignes || []).length + ' chauffe(s)');
        }
        // I141 (253-X1)
        if (fiche && !(e.zonesMenagees && Object.prototype.hasOwnProperty.call(e.zonesMenagees, x.slug) && e.zonesMenagees[x.slug] && !e.zonesMenagees[x.slug].choisie) && M.estIsolation({ prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [], stab: fiche.muscles_stabilisateurs || [] })) {
          var propres = fiche.muscles_primaires || [];
          for (var j = 0; j < i; j++) {
            var prec = cat[exos[j] && exos[j].exercise_slug];
            if (prec && Semaine() && Semaine().musclesPonderes(prec).some(function (q) { return propres.indexOf(q.muscle) >= 0; })) {
              erreurs.push('I141' + nom + ' : chauffes proposées sur une isolation dont les muscles sont déjà travaillés par l\u2019exercice ' + j);
              break;
            }
          }
        }
        // I128
        if (p.mode === 'auto' && p.annulable !== true) erreurs.push('I128' + nom + ' : un ajout automatique sans « Annuler »');
      }
      if (e.refusChauffes && e.refusChauffes[x.slug] === true && p) erreurs.push('I128' + nom + ' : une proposition de chauffes alors que la personne a dit « Non merci » (silence)');
      var gs = (e.seance && Array.isArray(e.seance.gestes)) ? e.seance.gestes : [];
      // I190 (15/11/2026, étend I128) — des chauffes posées par le coach (ajout automatique, « Ajouter », « + Chauffe »), pas annulées depuis, dont une
      // ligne reste à faire : le plan expose « Annuler » (`x.chauffesPosees`) ; et rien d'exposé sans pose (le dernier geste fait foi).
      var poseeDe = null;
      gs.forEach(function (g) {
        if (!g || g.slug !== x.slug) return;
        if (g.geste === 'chauffes_auto') poseeDe = 'auto';
        else if (g.geste === 'chauffes_ajoutees') poseeDe = 'posee';
        else if (g.geste === 'chauffes_annulees') poseeDe = null;
      });
      var enAttente = (x.lignes || []).some(function (l) { return l.type === 'echauffement' && !l.validee; });
      if (poseeDe && enAttente && !x.chauffesPosees) erreurs.push('I190' + nom + ' : des chauffes posées par le coach sans geste « Annuler »');
      if (x.chauffesPosees && (!poseeDe || !enAttente)) erreurs.push('I190' + nom + ' : « Annuler » exposé sans chauffes posées à faire');
      if (x.chauffesPosees && x.chauffesPosees.annuler !== 'Annuler') erreurs.push('I190' + nom + ' : le geste des chauffes posées n\u2019est pas « Annuler »');
      // I184 (15/11/2026) — une seule référence : la proposition, la demande et les chauffes posées disent celle du plan.
      var refUnique = x.chauffesReference ? x.chauffesReference.charge : null;
      [['la proposition', x.proposition], ['la demande', x.surDemande], ['les chauffes', x.chauffes]].forEach(function (q) {
        if (q[1] && q[1].reference !== null && q[1].reference !== undefined && refUnique !== q[1].reference) {
          erreurs.push('I184' + nom + ' : ' + q[0] + ' est calée sur ' + q[1].reference + ' kg, la référence des chauffes est ' + refUnique + ' kg');
        }
      });
      // I185 — la montée demandée est celle de la proposition (la même table), jamais écrite dans une série.
      if (x.surDemande && x.proposition && JSON.stringify(x.surDemande.lignes) !== JSON.stringify(x.proposition.lignes)) {
        erreurs.push('I185' + nom + ' : la montée demandée n\u2019est pas celle de la proposition');
      }
      // I188 — sans référence, aucune montée.
      if (x.surDemande && (refUnique === null && x.surDemande.situation !== 'corps')) erreurs.push('I188' + nom + ' : une montée demandée sans charge de référence');
      // I189 — une occurrence que le coach ne suit pas n'a jamais de carte non sollicitée.
      if (x.proposition && !x.consigne) erreurs.push('I189' + nom + ' : une carte de chauffes sur une occurrence que le coach ne suit pas');
      // I193 — Entretenir : rien (I13, I31).
      if (x.intention === 'entretien' && (x.surDemande || x.chauffesReference)) erreurs.push('I193' + nom + ' : une montée demandée en Entretenir');
      // I130 (237-bis) — une mise en silence (geste `chauffes_silence`, non annulée, exercice pas commencé) sans sa phrase annoncée, ou avec une autre.
      var etatSilence = null;
      gs.forEach(function (g) {
        if (g && g.slug === x.slug && g.geste === 'chauffes_silence') etatSilence = true;
        else if (g && g.slug === x.slug && g.geste === 'chauffes_silence_annule') etatSilence = false;
      });
      // I130 complété (15/11/2026) : une ligne de chauffe posée retire la phrase du silence.
      var commence = (x.lignes || []).some(function (l) { return l.validee || l.type === 'echauffement'; });
      if (etatSilence === true && !commence) {
        var attendue = M.phraseDuSilenceDesChauffes(fiche && fiche.nom ? fiche.nom : null);
        if (!x.silenceChauffes || x.silenceChauffes.texte !== attendue) erreurs.push('I130' + nom + ' : une mise en silence des chauffes sans sa phrase annoncée');
        else if (x.silenceChauffes.annuler !== 'Annuler') erreurs.push('I130' + nom + ' : la mise en silence des chauffes sans « Annuler »');
      }
      if (x.silenceChauffes && etatSilence !== true) erreurs.push('I130' + nom + ' : la phrase du silence des chauffes sans geste de mise en silence');
      // I144 (259) — l'annonce de la dégressive, sur la série d'avant : elle dit la charge DU PLAN (jamais une autre), ou « la charge » quand le
      // plan n'en a pas ; et elle se pose sur la série qui précède la dégressive.
      if (x.degressive && x.degressive.annonce !== undefined) {
        var an = String(x.degressive.annonce);
        var dgc = x.degressive.charge;
        var attendue144 = dgc !== null && dgc !== undefined ? 'baisse à ' + racine.THModele.charge(dgc) + ' et continue.' : 'baisse la charge et continue.';
        if (!/^Dernière série/.test(an) || an.indexOf(attendue144) < 0) erreurs.push('I144' + nom + ' : l’annonce de la dégressive (« ' + an + ' ») ne dit pas la charge du plan (' + attendue144 + ')');
        if (x.degressive.apres === undefined || x.degressive.apres === null || x.degressive.apres >= x.degressive.iSerie) erreurs.push('I144' + nom + ' : l’annonce de la dégressive hors de la série qui la précède');
      }
      // I132 (245, MOTEUR §9.15.3) — une dégressive proposée hors barre est la charge disponible la plus proche de sa cible dans la fenêtre :
      // aucune autre charge disponible de la fenêtre n'en est plus proche (à égalité, la plus basse), et elle est dans la fenêtre.
      [x.degressive].concat(x.degressivesPlus || []).forEach(function (dg) {
        if (!dg || !dg.choix || dg.charge === null || dg.charge === undefined) return;
        var ch = dg.choix, dist = Math.abs(dg.charge - ch.cible);
        if (ch.dans.indexOf(dg.charge) < 0) erreurs.push('I132' + nom + ' : une dégressive (' + dg.charge + ') hors de la fenêtre de la baisse');
        ch.dans.forEach(function (c) {
          var dc = Math.abs(c - ch.cible);
          if (dc < dist - 1e-9 || (Math.abs(dc - dist) <= 1e-9 && c < dg.charge - 1e-9)) {
            erreurs.push('I132' + nom + ' : une dégressive à ' + dg.charge + ' alors que ' + c + ' est plus près de la cible ' + ch.cible);
          }
        });
      });
    });
  }

  // I123 et I124 (225, MOTEUR §9.40) — la veille d'une activité dure.
  //   I123 : la proposition ne naît que d'une activité NOTÉE de la veille, intense, d'un sport qui charge les jambes (la table du moteur),
  //          jamais en Édition ni en « Juste un carnet » ni en semaine de mesure ou allégée, pour UNE barre de jambes (squat, soulevé) en zone Lourd
  //          dans la séance qui admet la variante, avec les deux gestes du moteur (« <barre> plus léger aujourd'hui » / « Comme prévu ») et
  //          la convention dite comme telle.
  //   I124 : une réponse donnée (plus léger ou Comme prévu) fait taire la proposition — « Comme prévu » est respecté, UNE seule fois — et
  //          sans activité notée (une simple habitude déclarée, ou rien), le plan ne propose rien.
  function verifierVeilleActivite(plan, entrees, erreurs) {
    var M = Moteur(), e = entrees || {}, v = plan && plan.veilleActivite;
    if (!v) return;
    var a = e.activiteVeille;
    if (!a || !a.slug) { erreurs.push('I124 — une proposition de veille sans activité notée la veille'); return; }
    if (e.veilleChoix === 'leger' || e.veilleChoix === 'garder') erreurs.push('I124 — la proposition revient après la réponse (' + e.veilleChoix + ')');
    if (!M.activiteChargeLesJambes(a.slug)) erreurs.push('I123 — un sport qui ne charge pas les jambes : ' + a.slug);
    if (plan.edition) erreurs.push('I123 — une proposition de veille en Édition');
    if (plan.intention === 'entretien') erreurs.push('I123 — une proposition de veille en « Juste un carnet »');
    if (plan.semaineDeTest || plan.allegee) erreurs.push('I123 — une proposition de veille en semaine de mesure ou allégée');
    var attendue = jambesLourdesDuPlan(e, (e.seance && e.seance.exercices) || [], e.consignes || {}).filter(function (j) { return j.legere; });
    if (!attendue.length || attendue[0].slug !== v.slug) erreurs.push('I123 — l\u2019exercice proposé n\u2019est pas la première barre de jambes en Lourd de la séance : ' + v.slug);
    if (!v.boutons || !/ plus léger aujourd\u2019hui$/.test(v.boutons.leger || '') || v.boutons.garder !== 'Comme prévu') erreurs.push('I123 — les deux gestes ne sont pas ceux du moteur');
    if (!/convention de coachs/.test(v.pourquoi || '')) erreurs.push('I123 — la convention n\u2019est pas dite comme telle');
  }

  // I140 (253, X3, MOTEUR §9.40) — LA RÉPONSE DE LA VEILLE VAUT POUR LA JOURNÉE. Une réponse reprise (`entrees.veilleReprise`) : la question ne revient
  //   pas (pas de `veilleActivite`) ; la ligne dit la réponse (« Comme ce matin : … ») et offre « Changer » ; elle ne naît que d'une réponse donnée
  //   (plus léger ou Garder) ET d'une activité notée hier, jamais en Édition ni en « Juste un carnet ». 253 (X2) : la même ligne, sans « Comme ce
  //   matin », dit la réponse donnée DANS la séance (« Squat plus léger aujourd'hui. · Changer ») ; elle ne vit que sur une barre qui admet la variante.
  function verifierVeilleReprise(plan, entrees, erreurs) {
    var e = entrees || {}, r = plan && plan.veilleReprise;
    if ((e.veilleChoix === 'leger' || e.veilleChoix === 'garder') && plan && plan.veilleActivite) {
      erreurs.push('I140 \u2014 la question de la veille revient alors que sa r\u00e9ponse est donn\u00e9e');
    }
    if (!r) return;
    if (e.veilleChoix !== r.choix || (r.choix !== 'leger' && r.choix !== 'garder')) erreurs.push('I140 \u2014 la ligne ne dit pas la r\u00e9ponse de la s\u00e9ance');
    if (!e.activiteVeille || !e.activiteVeille.slug) erreurs.push('I140 \u2014 une r\u00e9ponse sans activit\u00e9 not\u00e9e la veille');
    if (plan.edition) erreurs.push('I140 \u2014 une r\u00e9ponse de la veille en \u00c9dition');
    if (plan.intention === 'entretien') erreurs.push('I140 \u2014 une r\u00e9ponse de la veille en \u00ab\u00a0Juste un carnet\u00a0\u00bb');
    if (r.lien !== 'Changer') erreurs.push('I140 \u2014 la r\u00e9ponse de la veille sans \u00ab\u00a0Changer\u00a0\u00bb');
    var repris = !!e.veilleReprise && !!e.veilleReprise.slug;
    var voix = r.choix === 'leger'
      ? (repris ? /^Comme (ce matin|tout \u00e0 l\u2019heure)\u00a0: .+ plus l\u00e9ger\.$/ : /^.+ plus l\u00e9ger aujourd\u2019hui\.$/)
      : (repris ? /^Comme (ce matin|tout \u00e0 l\u2019heure)\u00a0: plan gard\u00e9\.$/ : /^Plan gard\u00e9\.$/);
    if (!voix.test(r.phrase || '')) erreurs.push('I140 \u2014 la ligne n\u2019est pas dans la voix du coach : ' + r.phrase);
    var attendue = jambesLourdesDuPlan(e, (e.seance && e.seance.exercices) || [], e.consignes || {}).filter(function (j) { return j.legere; })[0];
    if (!attendue || attendue.slug !== r.slug) erreurs.push('I140 \u2014 la ligne nomme une barre qui n\u2019admet pas la variante : ' + r.slug);
    // « plus léger » dit : la barre porte bien la variante (I142 la vérifie) ; « plan gardé » dit : elle n'en porte pas.
    var x = ((plan && plan.exercices) || []).filter(function (q) { return q && q.slug === r.slug; })[0];
    if (x) {
      if (r.choix === 'leger' && !x.veilleLegere) {
        erreurs.push('I140 \u2014 \u00ab plus l\u00e9ger \u00bb dit, mais la barre ' + r.slug + ' porte la charge du plan');
      }
      if (r.choix === 'garder' && x.veilleLegere) erreurs.push('I140 \u2014 \u00ab plan gard\u00e9 \u00bb dit, mais la barre ' + r.slug + ' est all\u00e9g\u00e9e');
    }
  }

  // I142 (253, X2, MOTEUR §9.40) — LA VARIANTE « PLUS LÉGER » : sur la barre qui la porte, la charge des lignes à faire est au plus le plan moins UN cran
  //   et au moins le plan × 0,90, aux MÊMES reps ; la zone de la consigne est celle du plan (jamais une zone changée) ; aucun pari,
  //   aucune réserve visée de table ; la réserve affichée = min(réserve du plan + 2, 3) ; et elle n'existe que si la réponse est « plus léger ».
  function verifierVeilleLegere(plan, entrees, erreurs) {
    var e = entrees || {}, M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var v = x && x.veilleLegere;
      if (!v) return;
      var nom = 'I142 \u2014 exercice ' + i + ' (' + x.slug + ') : ';
      if (e.veilleChoix !== 'leger') erreurs.push(nom + 'la variante \u00ab plus l\u00e9ger \u00bb sans que la personne l\u2019ait choisie');
      if (plan.edition || plan.intention === 'entretien' || plan.semaineDeTest || plan.allegee) erreurs.push(nom + 'la variante hors de son champ (\u00c9dition, Juste un carnet, test, all\u00e9g\u00e9e)');
      var base = e.consignes && e.consignes[x.slug] && e.consignes[x.slug].consigne ? e.consignes[x.slug].consigne : null;
      var k = x.consigne;
      if (!base || !k) { erreurs.push(nom + 'la variante sans consigne du plan'); return; }
      var zoneBase = base.zone && base.zone.cle ? base.zone.cle : base.zone, zoneK = k.zone && k.zone.cle ? k.zone.cle : k.zone;
      if (zoneBase !== 'lourd' || zoneK !== zoneBase) erreurs.push(nom + 'la zone a chang\u00e9 (' + zoneBase + ' \u2192 ' + zoneK + ')');
      var cp = base.ligne ? nombre(base.ligne.charge) : null, rp = base.ligne ? nombre(base.ligne.vise) : null;
      var pas = e.consignes[x.slug].pas;
      if (cp === null || rp === null) { erreurs.push(nom + 'la variante sur un plan sans charge'); return; }
      if (nombre(v.plan.charge) !== cp || nombre(v.plan.reps) !== rp) erreurs.push(nom + 'le plan cit\u00e9 (' + v.plan.charge + ' \u00d7 ' + v.plan.reps + ') n\u2019est pas celui de la consigne (' + cp + ' \u00d7 ' + rp + ')');
      if (!(v.charge < cp - 1e-9)) erreurs.push(nom + 'la charge du jour (' + v.charge + ') n\u2019est pas sous celle du plan (' + cp + ')');
      if (nombre(pas) !== null && pas > 0 && v.charge > cp - pas + 1e-6) erreurs.push(nom + 'la charge du jour (' + v.charge + ') est \u00e0 moins d\u2019un cran (' + pas + ') du plan (' + cp + ')');
      if (v.charge < cp * 0.9 - 1e-6) erreurs.push(nom + 'la charge du jour (' + v.charge + ') est \u00e0 plus de 10 % sous le plan (' + cp + ')');
      if (v.reps !== rp) erreurs.push(nom + 'les reps ont chang\u00e9 (' + rp + ' \u2192 ' + v.reps + ')');
      var attendueReserve = Math.min(nombre(v.plan.reserve) + M.VEILLE_LEGERE_SURPLUS_RESERVE, M.VEILLE_LEGERE_RESERVE_PLAFOND);
      if (v.reserve !== attendueReserve) erreurs.push(nom + 'la r\u00e9serve affich\u00e9e est ' + v.reserve + ', la r\u00e8gle donne ' + attendueReserve);
      (x.lignes || []).forEach(function (l) {
        if (l.validee || l.type !== 'travail') return;
        if (l.charge !== null && l.charge !== undefined && nombre(l.charge) !== v.charge) erreurs.push(nom + 'la ligne ' + l.iSerie + ' est \u00e0 ' + l.charge + ', la variante \u00e0 ' + v.charge);
        if (nombre(l.vise) !== null && nombre(l.vise) !== rp) erreurs.push(nom + 'la ligne ' + l.iSerie + ' vise ' + l.vise + ', le plan ' + rp);
      });
      if ((x.paris || []).some(function (q) { return q; })) erreurs.push(nom + 'un pari \u00e9crit sur une s\u00e9ance volontairement plus l\u00e9g\u00e8re (il serait lu comme perdu)');
      if (x.rate || x.parisRates || x.carteForme) erreurs.push(nom + 'une r\u00e9action au rat\u00e9 ou une carte de forme sur une s\u00e9ance volontairement plus l\u00e9g\u00e8re');
    });
  }

  function verifierMobilite(plan, entrees, erreurs) {
    var M = Moteur(), e = entrees || {}, mob = plan && plan.mobilite;
    if (!mob) return;
    var zonesRaides = M.zonesRaidesConnues(e.zonesRaides) || [];
    if (!zonesRaides.length) erreurs.push('I98 — un bloc de mobilité sans zone raide déclarée');
    if (plan.edition) erreurs.push('I98 — un bloc de mobilité en Édition');
    if (plan.intention === 'entretien') erreurs.push('I98 — un bloc de mobilité en « Juste un carnet »');
    if ((e.refusChauffes || {})[M.MOBILITE_REFUS_CLE]) erreurs.push('I98 — un bloc de mobilité après trois « Non merci » de suite');
    if (mob.retiree) {
      if (!e.raccourci) erreurs.push('I97 — un bloc retiré sans « J\u2019ai peu de temps »');
      if (mob.avant || mob.fin) erreurs.push('I97 — un bloc de mobilité dans une séance raccourcie');
      return;
    }
    if (e.raccourci) erreurs.push('I97 — un bloc de mobilité dans une séance raccourcie');
    var interdit = /récupération|recuperation|courbature|prévention|prevention/i;
    var menager = (Array.isArray(e.menagerProfil) ? e.menagerProfil : []).slice();
    var G = racine.THGenerateur, jour = M.jourCivil(plan && e.seance && e.seance.debut);
    Object.keys(e.douleurs || {}).forEach(function (s) {
      if (!G || !jour || !M.douleurRecente(e.douleurs[s], jour)) return;
      G.zonesQueChargeLExercice(s, ['genou', 'dos', 'epaule', 'coude', 'hanche']).forEach(function (z) { if (menager.indexOf(z) < 0) menager.push(z); });
    });
    var exercicesDe = function (b) { var l = []; (b.zones || []).forEach(function (z) { (z.exercices || []).forEach(function (x) { l.push(x); }); }); return l; };
    var dit = function (t) { if (t && interdit.test(String(t))) erreurs.push('I98 — un mot que le coach ne dit pas : « ' + t + ' »'); };
    if (mob.avant) {
      var a = mob.avant, t = M.MOBILITE_ZONES[a.zone];
      if (!t || zonesRaides.indexOf(a.zone) < 0) erreurs.push('I94 — la préparation pour une zone non déclarée raide (' + a.zone + ')');
      if (t && a.sert === undefined) erreurs.push('I94 — la préparation sans l\u2019exercice du jour qu\u2019elle sert');
      if (a.minutes > 2.05) erreurs.push('I94 — la préparation dure ' + a.minutes + ' min (2 au plus)');
      exercicesDe({ zones: [a] }).forEach(function (x) {
        if (!t || t.enMouvement.indexOf(x.slug) < 0) erreurs.push('I94 — « ' + x.slug + ' » avant la séance n\u2019est pas de la mobilité en mouvement');
        if (t && t.tenus.indexOf(x.slug) >= 0 && t.enMouvement.indexOf(x.slug) < 0) erreurs.push('I94 — un étirement tenu avant la charge : ' + x.slug);
      });
      if (a.consigne !== M.MOBILITE_CONSIGNE) erreurs.push('I98 — la consigne de la préparation n\u2019est pas la consigne du bloc');
      dit(a.pourquoi); dit(a.sousTitre);
    }
    if (mob.fin) {
      var f = mob.fin;
      if ((f.zones || []).length > 2) erreurs.push('I95 — ' + f.zones.length + ' zones dans le bloc de fin (2 au plus)');
      (f.zones || []).forEach(function (z) {
        var tz = M.MOBILITE_ZONES[z.zone];
        if (!tz || zonesRaides.indexOf(z.zone) < 0) erreurs.push('I95 — une zone non déclarée raide dans le bloc : ' + z.zone);
        var deja = Number((e.mobiliteFaite || {})[z.zone]) || 0;
        if (deja >= M.MOBILITE_CIBLE_MIN) erreurs.push('I95 — la zone ' + z.zone + ' a déjà ses ' + M.MOBILITE_CIBLE_MIN + ' minutes de la semaine');
        if (deja + z.minutes > M.MOBILITE_CIBLE_MIN + 0.05) erreurs.push('I95 — la zone ' + z.zone + ' dépasse ses ' + M.MOBILITE_CIBLE_MIN + ' minutes (' + (deja + z.minutes) + ')');
        if (Math.abs(z.fait - deja) > 0.05) erreurs.push('I95 — les minutes déjà faites de ' + z.zone + ' ne sont pas celles des faits');
        (z.exercices || []).forEach(function (x) {
          if (!tz || tz.tenus.indexOf(x.slug) < 0) erreurs.push('I95 — « ' + x.slug + ' » n\u2019est pas un étirement de la zone ' + z.zone);
          if (!(x.duree_s >= M.MOBILITE_TENUE_MIN_S && x.duree_s <= M.MOBILITE_TENUE_MAX_S)) erreurs.push('I95 — une tenue de ' + x.duree_s + ' s (30 à 60 s)');
          if (!(x.series >= 1 && x.series <= 3)) erreurs.push('I95 — ' + x.series + ' séries pour ' + x.slug + ' (1 à 3)');
          var charge = M.MOBILITE_CHARGE[x.slug] || [];
          if (charge.some(function (c) { return menager.indexOf(c) >= 0; })) erreurs.push('I96 — « ' + x.slug + ' » charge une articulation à ménager (' + charge.join(', ') + ')');
          if (tz && tz.menagee && menager.indexOf(tz.menagee) >= 0) erreurs.push('I96 — un étirement pour une zone à ménager : ' + z.zone);
        });
      });
      // I96 — la phrase du kiné pour chaque zone raide aussi à ménager, et seulement pour elles.
      zonesRaides.forEach(function (zr) {
        var tz = M.MOBILITE_ZONES[zr], aMenager = !!(tz && tz.menagee && menager.indexOf(tz.menagee) >= 0);
        var phrase = (f.kine || []).some(function (k) { return k.indexOf(tz.accord) === 0 && /avis d\u2019un kiné/.test(k); });
        if (aMenager && !phrase) erreurs.push('I96 — la zone ' + zr + ' est à ménager : la phrase du kiné manque');
        if (!aMenager && phrase) erreurs.push('I96 — la phrase du kiné pour une zone qui n\u2019est pas à ménager : ' + zr);
      });
      if (f.consigne !== M.MOBILITE_CONSIGNE) erreurs.push('I98 — la consigne du bloc n\u2019est pas « ' + M.MOBILITE_CONSIGNE + ' »');
      dit(f.pourquoi); dit(f.sousTitre); dit(f.titre); (f.kine || []).forEach(dit);
    }
  }

  // I251 (« Au max » disparaît, 20/11/2026, MOTEUR §9.30 ; remplace I83 à I87, I99, I150, I151, I207, I233 et la partie « Au max » de I238/I239) —
  // AUCUN « AU MAX » DANS UN PLAN NI DANS UN TEXTE. Aucun exercice ne porte de ligne marquée, de carte, de mots ni d'état de « Au max », aucun pari ne
  // porte `fondement.au_max`, et aucun texte du coach (phrases capturées, message, constat, « Pourquoi », réaction) ne dit « Au max » (« jusqu'à
  // l'échec » reste dit ailleurs : le rest-pause, 196, et ce que la porte du cran constate, 251). Le coach ne demande l'échec que par la visée affichée. Exemptée et nommée : la semaine de test (`x.semaineDeTest`), dont la « Série au
  // max » reste jusqu'à la PR 3 (une identité persistée de la série de test). La lecture de `au_max` et `au_max_reserve` dans `v2/js/` est gardée
  // par `tests/unit/v2-architecture.test.js` (I251, hors la seule fonction de la semaine de test).
  var MOTS_DE_L_AU_MAX = /au\s*max\b/i;
  function textesDuCoachDe(x) {
    var t = [];
    var pousse = function (v) { if (typeof v === 'string' && v) t.push(v); };
    (x.phrases || []).forEach(function (p) { if (p) pousse(p.texte); });
    if (x.message) pousse(x.message.phrase);
    if (x.rate) pousse(x.rate.phrase);
    [x.constat, x.pourquoi].forEach(function (o) {
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { pousse(o[k]); });
    });
    return t;
  }
  function verifierSansAuMax(plan, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = 'I251 — exercice ' + i + ' (' + x.slug + ') : ';
      ['auMax', 'propositionAuMax', 'auMaxMots', 'auMaxEtat'].forEach(function (cle) {
        if (x[cle] !== undefined && x[cle] !== null) erreurs.push(nom + 'le plan porte « ' + cle + ' »');
      });
      (x.lignes || []).forEach(function (l) { if (l && l.auMax) erreurs.push(nom + 'la ligne ' + l.iSerie + ' est marquée « Au max »'); });
      (x.paris || []).forEach(function (p) { if (p && p.fondement && p.fondement.au_max) erreurs.push(nom + 'un pari fondé sur « Au max »'); });
      if (x.semaineDeTest) return;
      textesDuCoachDe(x).forEach(function (t) { if (MOTS_DE_L_AU_MAX.test(t)) erreurs.push(nom + 'le coach dit « ' + t + ' »'); });
    });
  }

  // I88 à I93 (MOTEUR §9.32, 193-4) — LA SEMAINE DE TEST :
  //   · I88 — jamais plus de trois essais, jamais de 4ᵉ ; le 3ᵉ est plus lourd que le 2ᵉ ;
  //   · I89 — une seule barre testée par séance ; le squat et le soulevé jamais le même jour (le second reste normal) ;
  //   · I90 — la montée (50/60/70/80/87 %) et les charges des essais (≈ 92 %, ≈ 97 %) ou de la série (≈ 85 %, ≈ 80 % au débutant) sont
  //     celles du max estimé, à un cran près ; la série au soulevé : en gardant 1, 6 reps au plus ;
  //   · I91 — au plus deux accessoires gardés (sa clause « Au max » est retirée avec l'objet, 20/11/2026, I251) ;
  //   · I92 — un arrêt (« J'ai mal », un 1ᵉʳ essai sans marge, 0 rep) ne propose plus rien : ni essai, ni série ;
  //   · I93 — le max mesuré n'est jamais sous le plus lourd essai réussi à RPE 10, et le pari est le max estimé au cran, module `test` ;
  //   · I253 (21/11/2026) — en mode « série », la série de mesure est la première série marquée `serie_de_mesure` (jamais une position).
  function verifierSemaineDeTest(plan, erreurs, entrees) {
    var jt = plan && plan.semaineDeTest;
    if (!jt) {
      ((plan && plan.exercices) || []).forEach(function (x, i) {
        if (x && x.semaineDeTest) erreurs.push('I89 — exercice ' + i + ' : une semaine de mesure hors de sa semaine');
      });
      return;
    }
    var M = Moteur();
    var testees = [];
    // 19/11/2026 (I224 à I227, MOTEUR §9.32) — une barre testable : un max estimé d'avant la semaine ET pas de reprise longue, relus dans les ENTRÉES
    // (jamais dans ce que le plan porte) par une arithmétique à part. Sans entrées, rien n'est jugé.
    var ent = entrees && entrees.semaineDeTest ? entrees.semaineDeTest : null;
    var maxDesEntrees = function (slug) { var v = ent ? nombre((ent.maxEstimes || {})[slug]) : null; return v !== null && v > 0 ? v : null; };
    var testable = function (slug) {
      return ent === null ? true : maxDesEntrees(slug) !== null && (ent.reprises || {})[slug] !== M.REPRISE_LONGUE;
    };
    if (ent !== null && jt.testee) {
      if (!testable(jt.testee)) erreurs.push('I225 — la barre du jour (' + jt.testee + ') est en reprise longue ou sans max : elle ne prend pas le créneau (I89)');
      // la barre du jour est la PREMIÈRE barre testable non faite, non refusée aujourd'hui (jamais une barre récente passée derrière une vieille)
      var attendue = (jt.barres || []).filter(function (q) {
        return testable(q) && (jt.faites || []).indexOf(q) < 0 && (ent.refus || {})[q] !== jt.jour;
      })[0];
      if (attendue !== undefined && attendue !== jt.testee) erreurs.push('I225 — la barre du jour est ' + jt.testee + ', la première barre testable est ' + attendue + ' (I89)');
    } else if (ent !== null && !jt.testee) {
      var oubliee = (jt.barres || []).filter(function (q) {
        return testable(q) && (jt.faites || []).indexOf(q) < 0 && (ent.refus || {})[q] !== jt.jour;
      })[0];
      if (oubliee !== undefined) erreurs.push('I225 — la barre ' + oubliee + ' est testable et aucune barre n’est testée aujourd’hui (I89)');
    }
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var t = x.semaineDeTest;
      if (!t) return;
      // I224 — aucun essai, aucune montée, aucune série au max, aucun ajout proposés d'office pour une barre en reprise longue ou sans max.
      if (ent !== null && t.barre && x.slug && !testable(x.slug)) {
        if (t.testee || t.prochain || t.serie || (t.montee && t.montee.length) || t.ajout || (t.charge !== null && t.charge !== undefined) || t.pari) {
          erreurs.push('I224' + nom + 'un essai, une montée, une série de mesure ou un pari proposé pour une barre en reprise longue ou sans max');
        }
        if (!t.pasDEssai) erreurs.push('I224' + nom + 'la barre non testable ne dit pas « pas d’essai cette semaine »');
      }
      if (ent !== null && t.barre && x.slug && testable(x.slug) && t.pasDEssai) erreurs.push('I224' + nom + '« pas d’essai » dit d’une barre testable');
      if (t.accessoire) {
        if (t.garde !== (t.rang <= M.TEST_ACCESSOIRES_MAX)) erreurs.push('I91' + nom + 'le rang ' + t.rang + ' d’accessoire ' + (t.garde ? 'gardé' : 'écarté') + ' contre la limite de ' + M.TEST_ACCESSOIRES_MAX);
        return;
      }
      if (!t.testee) return;
      // I90 (202) — la façon proposée est la façon choisie, sinon le défaut prudent (débutant, 65 ans et plus, max tiré de plus de 5 reps).
      if (entrees && entrees.semaineDeTest && x.slug) {
        var choisie = M.testModeValide((entrees.semaineDeTest.modes || {})[x.slug]);
        var voulue = choisie || M.testModeParDefaut(defautDeTest(entrees, x.slug));
        if (t.mode !== voulue) erreurs.push('I90' + nom + 'la façon proposée (' + t.mode + ') n’est pas celle ' + (choisie ? 'choisie' : 'du défaut') + ' (' + voulue + ')');
      }
      testees.push({ slug: x.slug, classe: t.classe });
      var max = nombre(t.max);
      var cran = nombre(t.arrondi) !== null && nombre(t.arrondi) > 0 ? nombre(t.arrondi) : 2.5;
      // I226 (I90) — sans max, aucune charge proposée ; I227 (I93) — sans max, aucun pari. Le max des entrées fait foi (le plan peut le porter nul à tort).
      var sansMax = max === null || (ent !== null && maxDesEntrees(x.slug) === null);
      if (sansMax && (t.prochain || t.serie || (t.montee && t.montee.length) || t.ajout || (t.charge !== null && t.charge !== undefined))) {
        erreurs.push('I226' + nom + 'une charge proposée sans max estimé (I90)');
      }
      if (sansMax && t.pari) erreurs.push('I227' + nom + 'un pari sans max estimé (I93)');
      var pres = function (charge, pct, large) {
        if (max === null) return false;
        if (nombre(charge) === null) return true;
        return Math.abs(charge - max * pct / 100) <= cran + max * (large || 0) / 100 + 1e-9;
      };
      if (t.essais && t.essais.length > M.TEST_ESSAIS_MAX) erreurs.push('I88' + nom + t.essais.length + ' essais (jamais plus de ' + M.TEST_ESSAIS_MAX + ')');
      if (t.ajout) {
        var essaisAjoutes = t.ajout.lignes.filter(function (q) { return q.type === 'test'; }).length;
        if (essaisAjoutes > 1 || t.essais.length + essaisAjoutes > M.TEST_ESSAIS_MAX) erreurs.push('I88' + nom + 'l’ajout porterait à ' + (t.essais.length + essaisAjoutes) + ' essais');
        if (t.ajout.lignes.some(function (q) { return q.type === 'test' && t.prochain && q.charge !== t.prochain.charge; })) erreurs.push('I90' + nom + 'l’essai ajouté n’est pas à la charge du plan');
      }
      if (t.prochain) {
        if (t.prochain.rang > M.TEST_ESSAIS_MAX || t.essais.length >= M.TEST_ESSAIS_MAX) erreurs.push('I88' + nom + 'un ' + t.prochain.rang + 'ᵉ essai proposé');
        if (t.prochain.rang === 3 && t.essais[1] && !(t.prochain.charge > t.essais[1].charge)) erreurs.push('I88' + nom + 'le 3ᵉ essai (' + t.prochain.charge + ') n’est pas plus lourd que le 2ᵉ (' + t.essais[1].charge + ')');
        if (t.prochain.rang === 1 && !pres(t.prochain.charge, M.TEST_ESSAI_1)) erreurs.push('I90' + nom + 'le 1ᵉʳ essai (' + t.prochain.charge + ') n’est pas à ' + M.TEST_ESSAI_1 + ' % du max estimé (' + max + ')');
        if (t.prochain.rang === 2 && !pres(t.prochain.charge, M.TEST_ESSAI_2)) erreurs.push('I90' + nom + 'le 2ᵉ essai (' + t.prochain.charge + ') n’est pas à ' + M.TEST_ESSAI_2 + ' % du max estimé (' + max + ')');
        if (t.mode !== M.TEST_MODE_MAX) erreurs.push('I90' + nom + 'un essai proposé en mode « série de mesure »');
      }
      if (t.serie) {
        var pc = plan.debutant ? M.TEST_SERIE_PCT_DEBUTANT : M.TEST_SERIE_PCT;
        if (!pres(t.serie.charge, pc)) erreurs.push('I90' + nom + 'la série de mesure (' + t.serie.charge + ') n’est pas à ' + pc + ' % du max estimé (' + max + ')');
        if (t.classe === 'souleve' && !(t.serie.reserve === 1 && t.serie.plafond <= M.TEST_SERIE_PLAFOND_SOULEVE)) erreurs.push('I90' + nom + 'la série au soulevé doit garder 1 rep, ' + M.TEST_SERIE_PLAFOND_SOULEVE + ' reps au plus');
        if (t.mode !== M.TEST_MODE_SERIE) erreurs.push('I90' + nom + 'une série de mesure proposée en mode « viser mon max »');
      }
      (t.montee || []).forEach(function (m, k) {
        if (!pres(m.charge, M.TEST_MONTEE[k][0])) erreurs.push('I90' + nom + 'la montée ' + (k + 1) + ' (' + m.charge + ') n’est pas à ' + M.TEST_MONTEE[k][0] + ' % du max estimé (' + max + ')');
        if (k > 0 && !(m.charge >= t.montee[k - 1].charge)) erreurs.push('I90' + nom + 'la montée ne croît pas');
      });
      if (t.etat === 'arret' && (t.prochain || t.serie)) erreurs.push('I92' + nom + 'un arrêt (' + t.arret + ') qui propose encore une charge');
      if ((t.essais || []).some(function (q) { return q.douleur === true; }) && t.prochain) erreurs.push('I92' + nom + '« J’ai mal » noté et un essai de plus proposé');
      if (t.essais && t.essais[0] && t.essais[0].reserve === 0 && t.prochain) erreurs.push('I92' + nom + 'un 1ᵉʳ essai sans marge et un 2ᵉ proposé');
      if (t.essais && t.essais.length && !(nombre(t.essais[t.essais.length - 1].reps) >= 1) && t.prochain) erreurs.push('I92' + nom + 'un essai raté et un essai de plus proposé');
      // I253 (21/11/2026, MOTEUR §9.32) — en mode « série », la série lue est la PREMIÈRE série validée de l'exercice qui porte la marque
      // `serie_de_mesure`, de type travail, qui compte (par `validee_a`, puis sa place) ; aucune série sans la marque n'entre dans la mesure,
      // quelle que soit sa place. Recalculée depuis les ENTRÉES (les séries de la séance), par une lecture à part (jamais `faitsDeTest`) ; la
      // marque d'une série se lit par son seul prédicat (`Modele.estSerieDeMesure`, une notion), le choix de la première se refait ici.
      if (t.mode === M.TEST_MODE_SERIE && entrees && entrees.seance && entrees.seance.exercices) {
        var exoI = typeof x.iExo === 'number' ? entrees.seance.exercices[x.iExo] : null;
        var seriesI = (exoI && exoI.series) || [];
        var marquees = [];
        seriesI.forEach(function (q, k) {
          if (!q || !Seance().partEnBase(q) || !racine.THModele.estSerieDeMesure(q)) return;
          if (nombre(q.charge_kg) === null) return;
          marquees.push({ q: q, validee_a: q.validee_a || null, rang: k });
        });
        marquees.sort(avantEnValidation);
        var lue = marquees.length ? marquees[0].q : null;
        var idLu = lue ? (lue.id === undefined ? null : lue.id) : null;
        if ((t.mesureSerieId || null) !== idLu) erreurs.push('I253' + nom + 'la série de mesure lue (' + t.mesureSerieId + ') n’est pas la première série marquée (' + idLu + ')');
        if (!lue && t.mesure) erreurs.push('I253' + nom + 'une mesure sans série marquée');
        if (lue && t.mesure && (t.mesure.charge !== nombre(lue.charge_kg) || t.mesure.reps !== nombre(lue.reps))) {
          erreurs.push('I253' + nom + 'la mesure (' + t.mesure.charge + ' × ' + t.mesure.reps + ') ne vient pas de la série marquée (' + lue.charge_kg + ' × ' + lue.reps + ')');
        }
      }
      if (t.mesure && t.mode === M.TEST_MODE_MAX) {
        var reussis = t.essais.filter(function (q) { return nombre(q.reps) >= 1 && (q.reserve === null || q.reserve === 0); });
        reussis.forEach(function (q) { if (t.mesure.valeur + 1e-9 < q.charge) erreurs.push('I93' + nom + 'le max mesuré (' + t.mesure.valeur + ') est sous un essai réussi à RPE 10 (' + q.charge + ')'); });
      }
      if (t.pari) {
        if (t.pari.module !== M.MODULE_TEST) erreurs.push('I93' + nom + 'le pari n’est pas du module « test »');
        if (max !== null && Math.abs(t.pari.valeur_predite - max) > cran + 0.5 + 1e-9) erreurs.push('I93' + nom + 'le pari (' + t.pari.valeur_predite + ') n’est pas le max estimé (' + max + ') au cran');
      }
    });
    if (testees.length > 1) erreurs.push('I89 — ' + testees.length + ' barres testées dans la même séance');
    var sol = testees.filter(function (q) { return q.classe === 'squat' || q.classe === 'souleve'; });
    if (sol.length > 1) erreurs.push('I89 — le squat et le soulevé testés le même jour');
    if (jt.testee && (jt.conflits || []).indexOf(jt.testee) >= 0) erreurs.push('I89 — la barre testée est aussi une barre en conflit');
  }

  // I220 à I222 (16/11/2026, MOTEUR §9.17 bis delta) — LA MARCHE ESSAYÉE, relue par une arithmétique indépendante :
  //   · I220 — « C'est fait … en en gardant 2 » tant qu'aucune série de la marche n'est faite (et « Annuler » avec), jamais
  //     après ; jamais « échec » sur la marche : c'est une première fois (I160) ;
  //   · I221 — la carte de fin seulement si la marche est TENUE (au moins 2 séries de travail faites, chacune à au moins
  //     max(3, min(5, bas)) reps), sur une routine manuelle, hors d'un bloc du programme ; ses reps sont celles des séries ;
  //   · I222 — le repli seulement si la 1re série de travail faite est entre 1 rep et sous le seuil, une seule fois ; jamais
  //     à 0 rep (la règle existante parle seule : jamais deux voix).
  function verifierEssaiDeMarche(x, exo, entrees, err) {
    var S = Seance(), Mo = racine.THModele;
    var em = exo.essai_marche;
    var ex = x.essaiMarche;
    if (!ex) { err('I220', 'une marche essayée sans son essai au plan'); return; }
    var faites = (exo.series || []).filter(function (q) { return !!q && S.partEnBase(q); });
    var travail = faites.filter(function (q) { return Mo.estTravail(q) && !Mo.estHorsCalcul(q); });
    var reps = travail.map(function (q) { return nombre(q.reps); });
    if (faites.length && (ex.texte || ex.annuler)) err('I220', '« C’est fait » ou « Annuler » avec une série de la marche faite');
    if (!faites.length && (!ex.texte || !ex.annuler)) err('I220', 'la marche essayée sans « C’est fait » ni « Annuler »');
    if (ex.texte && !/avec 2 en réserve\./.test(ex.texte)) err('I220', 'l’essai ne dit pas « avec 2 en réserve » (' + ex.texte + ')');
    var tous = [ex.texte, ex.repli && ex.repli.texte, ex.fin && ex.fin.texte].filter(Boolean).join(' ');
    if (/échec/i.test(tous)) err('I220', 'l’échec sur la marche (' + tous + ')');
    var b = nombre(em.bas);
    var seuil = Math.max(3, Math.min(5, b === null ? 5 : b));
    var tenue = reps.length >= 2 && reps.every(function (r) { return r !== null && r >= seuil; });
    var fm = (entrees && entrees.essaisDeMarche) || {};
    if (ex.fin) {
      if (!tenue) err('I221', 'la carte de fin sans marche tenue (' + JSON.stringify(reps) + ', seuil ' + seuil + ')');
      if (fm.manuelle !== true) err('I221', 'la carte de fin sur une routine du programme du coach');
      if (ex.enBloc) err('I221', 'la carte de fin pour un exercice d’un bloc du programme');
      if (JSON.stringify(ex.fin.reps) !== JSON.stringify(reps)) err('I221', 'la carte de fin ne dit pas les reps faites (' + JSON.stringify([ex.fin.reps, reps]) + ')');
    } else if (tenue && fm.manuelle === true && !ex.enBloc && em.repli !== 'remis') {
      err('I221', 'la marche tenue sur une routine manuelle, sans carte de fin');
    }
    var r0 = reps.length ? reps[0] : null;
    if (ex.repli) {
      if (em.repli) err('I222', 'le repli proposé une seconde fois');
      if (r0 === null || r0 < 1 || r0 >= seuil) err('I222', 'le repli hors de 1 rep à sous ' + seuil + ' (' + r0 + ')');
      if (r0 === 0) err('I222', 'deux voix après un 0 rep');
    } else if (!em.repli && r0 !== null && r0 >= 1 && r0 < seuil) {
      err('I222', 'la 1re série sous le seuil sans repli (' + r0 + ' < ' + seuil + ')');
    }
  }

  // I100 et I104 (195-3) — LA CALISTHÉNIE :
  //   · I100 — une marche d'habileté (pistol, équilibre, archer : `cibleHabilete`) ne se propose qu'en objectif calisthénie ;
  //   · I104 — (sa clause « Au max » sur une figure est retirée avec l'objet, 20/11/2026 : I251 la couvre ; le numéro reste réservé).
  // (I101 à I103, les figures de bras tendus par semaine, la zone coude/épaule et la barre de traction, sont ceux du programme :
  //  `Generateur.verifierCalisthenie`.)
  function verifierCalisthenie(plan, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      if (!x) return;
      var nom = ' — exercice ' + i + ' (' + x.slug + ') : ';
      var c = x.carteMarche;
      if (c && c.cibleHabilete === true && c.proposable === true && plan.objectif !== 'calisthenie') {
        erreurs.push('I100' + nom + 'une marche d’habileté proposée hors objectif calisthénie (' + c.cible + ')');
      }
    });
  }

  // I77 (MOTEUR §14.11, 189) — LA FATIGUE SUR PLUSIEURS SEMAINES :
  //   · une seule carte de fatigue par séance, et aucune dans les 4 semaines d'une autre carte (acceptée ou refusée, quel que
  //     soit son déclencheur), ni pendant une semaine allégée, ni pendant une « série de moins » ; jamais en « Juste un carnet » ;
  //   · une carte de baisse cite au moins 4 exercices, porte son « Pourquoi » et la valeur d'avant de chacun ;
  //   · la 3ᵉ réponse (« une série de moins ») n'existe qu'en sèche ;
  //   · la série de moins ne descend jamais sous 2 séries (un exercice à 2 séries ou moins ne bouge pas), ne touche jamais une
  //     priorité, ne se combine pas avec la semaine allégée, et aucune « série de plus » de l'escalier n'existe tant qu'elle dure.
  function verifierFatigue(plan, entrees, erreurs) {
    if (!plan) return;
    var M = Moteur();
    var E = (entrees && entrees.escalier) || {};
    var k = plan.carte;
    var moins = plan.serieDeMoins;
    var pose = function (t) { erreurs.push('I77 — ' + t); };
    if (k) {
      if (plan.allegee) pose('une carte de fatigue pendant une semaine allégée');
      if (moins) pose('une carte de fatigue pendant une « série de moins »');
      if (plan.intention === 'entretien') pose('une carte de fatigue en « Juste un carnet »');
      var seance = entrees && entrees.seance;
      var jour = seance ? M.jourCivil(seance.debut) : null;
      if (jour && !M.fatigueAutorisee(E.cartes || [], jour)) pose('une carte de fatigue dans les ' + M.FATIGUE_REFRACTAIRE_JOURS + ' jours d\u2019une autre');
      if (k.source === M.SOURCE_BAISSE) {
        if (!Array.isArray(k.cites) || k.cites.length < 4) pose('une carte de baisse qui cite moins de 4 exercices');
        if (!k.pourquoi || !k.avant) pose('une carte de baisse sans son « Pourquoi » ni la valeur d\u2019avant');
        if (k.serieDeMoins && plan.phase !== 'seche') pose('la réponse « une série de moins » hors sèche');
      } else if (k.serieDeMoins) {
        pose('la réponse « une série de moins » sur une carte qui n\u2019est pas une baisse');
      }
    }
    var prioritaires = Array.isArray(E.prioritaires) ? E.prioritaires : [];
    ((plan.exercices) || []).forEach(function (x, i) {
      var nom = 'exercice ' + i + ' (' + (x && x.slug) + ') : ';
      var m = x && x.consigne && x.consigne.serieDeMoins;
      if (!m) return;
      if (!moins) pose(nom + 'une série de moins sans la décision en cours');
      if (m.series < Math.min(M.FATIGUE_SERIES_MIN, m.routine)) pose(nom + 'une série de moins sous ' + M.FATIGUE_SERIES_MIN + ' séries (' + m.series + ' sur ' + m.routine + ')');
      if (m.series < m.routine - 1) pose(nom + 'plus d\u2019une série de moins (' + m.series + ' sur ' + m.routine + ')');
      if (prioritaires.indexOf(x.slug) >= 0) pose(nom + 'une série de moins sur une priorité');
      if (x.consigne.allegee) pose(nom + 'une série de moins pendant une semaine allégée');
    });
    if (moins) {
      ((plan.exercices) || []).forEach(function (x, i) {
        var nom = 'exercice ' + i + ' (' + (x && x.slug) + ') : ';
        if (x && x.consigne && x.consigne.serieDePlus) pose(nom + 'une série de plus pendant la série de moins');
        if (x && x.escalier && x.escalier.marche === M.MARCHE_SERIE_DE_PLUS) pose(nom + 'une carte de série de plus pendant la série de moins');
      });
    }
  }

  // ══ I256 à I266 (20/11/2026, MOTEUR §9.52) — LE REPOS CONSEILLÉ DE BASE, relu par une arithmétique à part ══════════════════════════════════
  //   I256 une valeur par exercice (le porteur du tour pour un superset), `null` sans reps visées, sans famille, en Entretenir, en Édition, sans coach ;
  //   I257 monotonie : la table ne raccourcit jamais quand P baisse, grand ≥ poly ≥ isolation, « près de l'échec » ne raccourcit jamais, une décharge ≤ le jour normal ;
  //   I258 bornes : planchers 2:00 (grand) et 1:30, plafond 4:00, au cran de la molette (hors raccourci) ;
  //   I259 rien n'est écrit : le conseil ne porte aucun champ d'écriture (minuteur, `repos_cible_s`) ;
  //   I260 les chauffes automatiques restent 60 s puis 120 s ; aucune ligne de chauffe ne porte de conseil ;
  //   I261 la garde est celle des LIGNES (`gardeDeLigne`) et n'est dite que si elle égale la visée affichée ; « sans marge » seulement à garde 0 ;
  //   I262 `Routines.reposParDefaut` donne, à P égal (reps visées + 2), la base du conseil ;
  //   I263 sous « J'ai peu de temps », jamais au-dessus de la valeur posée ;
  //   I264 aucun chiffre de repos hors de la molette (la ligne I76 n'en dit plus) ;
  //   I265 un superset : le plus grand des repos de base moins 60 s par autre membre, jamais sous 1:30, sur le dernier membre ;
  //   I266 la durée de la phrase est `formatDuree(s)` (« 3 min 30 »), jamais `dureeEnMinutes` (« 4 min »).
  // Le tableau, le plancher et le plafond sont RÉÉCRITS ici (une relecture qui lirait la table du moteur ne prouverait rien).
  var I256_TABLE = { grand: [180, 150, 150], poly: [150, 120, 120], isolation: [120, 90, 90] };
  var I256_RANG = { grand: 2, poly: 1, isolation: 0 };
  function i256Base(f, p) { return I256_TABLE[f][p <= 6 ? 0 : (p <= 12 ? 1 : 2)]; }
  function i256Borne(v, f) { return Math.min(240, Math.max(f === 'grand' ? 120 : 90, v)); }
  function i256Secondes(texte) {
    var m = /(\d+) min(?: (\d+))?/.exec(texte || '');
    if (m) return nombre(m[1]) * 60 + (m[2] ? nombre(m[2]) : 0);
    m = /(\d+) s\b/.exec(texte || '');
    return m ? nombre(m[1]) : null;
  }
  function verifierReposConseille(plan, entrees, erreurs) {
    var M = Moteur();
    var xs = (plan && plan.exercices) || [];
    var e = entrees || null;
    var seance = e && e.seance ? e.seance : null;
    // I257 — la table : jamais plus courte quand P baisse, grand ≥ poly ≥ isolation.
    Object.keys(I256_TABLE).forEach(function (f) {
      for (var p = 1; p < 40; p++) if (i256Base(f, p) < i256Base(f, p + 1)) erreurs.push('I257 — la table de ' + f + ' raccourcit quand P baisse (' + p + ' → ' + (p + 1) + ')');
    });
    for (var pp = 1; pp < 40; pp++) {
      if (!(i256Base('grand', pp) >= i256Base('poly', pp) && i256Base('poly', pp) >= i256Base('isolation', pp))) erreurs.push('I257 — grand ≥ poly ≥ isolation rompu à P = ' + pp);
    }
    // I260 — les chauffes automatiques ne bougent pas.
    if (M.REPOS_ENTRE_CHAUFFES !== 60 || M.REPOS_APRES_CHAUFFES !== 120) erreurs.push('I260 — les repos des chauffes ne sont plus 60 s puis 120 s');
    var contexte = function (x) {
      var exo = seance && seance.exercices ? seance.exercices[x.iExo] || {} : {};
      var cat = e && e.catalogue && x.slug && Object.prototype.hasOwnProperty.call(e.catalogue, x.slug) ? e.catalogue[x.slug] : null;
      var f = cat ? M.familleDeRepos({ prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [], stab: cat.muscles_stabilisateurs || [], equipement: cat.equipement }) : null;
      var garde = e ? gardeDeLigneDesEntrees(x, e) : nombre(x.gardeDeLigne);
      // Sans entrées (un plan vérifié seul), on ne relit que ce que le plan porte : la famille et les reps du conseil, les lignes pour les séries.
      var rr = x.reposConseille || {};
      var liste = exo.series || [];
      return { exo: exo, famille: f !== null ? f : (e && e.catalogue ? null : (rr.famille || null)),
               reps: seance ? repsDeLaPremiereLigne(x.lignes || [], liste) : (rr.reps === undefined ? null : rr.reps), garde: garde,
               series: seance ? nombreDeSeriesDeTravail(x, liste) : (rr.series === undefined ? null : rr.series) };
    };
    xs.forEach(function (x, i) {
      if (!x) return;
      var nom = 'I256 — exercice ' + i + ' (' + x.slug + ') : ';
      (x.lignes || []).forEach(function (l) {
        if (l && l.type === 'echauffement' && (l.reposConseille !== undefined || l.repos_conseille !== undefined)) erreurs.push('I260 — exercice ' + i + ' : une chauffe porte un repos conseillé');
      });
      if (x.pourquoi && typeof x.pourquoi.repos === 'string' && /\d+\s*(?:min|s\b)|\d+:\d\d/.test(x.pourquoi.repos)) {
        erreurs.push('I264 — exercice ' + i + ' : la ligne du repos long dit un chiffre de repos : ' + x.pourquoi.repos);
      }
      var r = x.reposConseille;
      var coachTait = plan.intention === 'entretien' || !!plan.edition || x.intention === 'entretien' || !!x.sansCoach || !!x.douleur || !!x.figure ||
        x.mesure === 'temps' || x.mesure === 'distance_temps' || x.mesure === 'charge_distance' || x.mesure === 'charge_temps';
      if (!r) {
        // Un superset : seul le porteur du tour a une valeur ; les autres n'en ont pas, c'est normal.
        return;
      }
      if (coachTait) erreurs.push(nom + 'un repos conseillé là où le coach se tait (Entretenir, Édition, « J’ai mal », « Sans coach cette fois »)');
      if (typeof r.s !== 'number' || !isFinite(r.s) || !(r.s > 0)) { erreurs.push(nom + 'une durée qui n’en est pas une : ' + r.s); return; }
      // I259 — rien n'est écrit, rien n'est armé.
      Object.keys(r).forEach(function (k) { if (/repos_cible|arme|minuteur|chrono|routine/i.test(k)) erreurs.push('I259' + nom.slice(4) + 'le conseil porte un champ d’écriture : ' + k); });
      var c = contexte(x);
      var exo = c.exo;
      var g = exo.groupe_superset === undefined ? null : exo.groupe_superset;
      var rangs = [];
      if (g !== null && g !== '' && seance && seance.exercices) seance.exercices.forEach(function (q, k) { if (q && q.groupe_superset === g && xs[k]) rangs.push(k); });
      var enTour = rangs.length > 1;
      var pose = nombre(exo.repos_cible_s);
      var raccourci = !!(e && e.raccourci);
      // I256 — une valeur par exercice : le porteur d'un tour est le dernier membre, et seulement lui.
      if (enTour && rangs[rangs.length - 1] !== x.iExo) erreurs.push(nom + 'un repos conseillé sur un membre du tour qui n’en est pas le dernier');
      if (!enTour && r.entreLesTours) erreurs.push(nom + '« entre les tours » sur un exercice seul');
      // I263 — « J'ai peu de temps » : jamais au-dessus de la valeur posée par le raccourci.
      if (raccourci && pose !== null && pose > 0 && r.s > pose) erreurs.push('I263' + nom.slice(4) + 'le conseil (' + r.s + ' s) est au-dessus de la valeur du raccourci (' + pose + ' s)');
      if (r.cas === 'raccourci' && !raccourci) erreurs.push('I263' + nom.slice(4) + 'un conseil « raccourci » sans « J’ai peu de temps »');
      if (r.cas === 'raccourci') return;
      // I258 — bornes, planchers, crans.
      var plancher = r.cas === 'superset' || r.famille !== 'grand' ? 90 : 120;
      if (r.cas === 'test') plancher = 240;
      if (r.s < plancher || r.s > 240) erreurs.push('I258' + nom.slice(4) + r.s + ' s hors des bornes (' + plancher + ' à 240)');
      if (r.s % 15 !== 0 || M.REPOS_PLAFOND_S !== 240 || racine.THModele.VALEURS_DE_REPOS.indexOf(r.s) < 0) erreurs.push('I258' + nom.slice(4) + r.s + ' s n’est pas un cran de la molette');
      // I266 — la durée de la phrase est celle de `formatDuree`.
      var dit = i256Secondes(r.pourquoi);
      if (dit !== r.s) erreurs.push('I266' + nom.slice(4) + 'la phrase dit ' + dit + ' s, le conseil vaut ' + r.s + ' s : « ' + r.pourquoi + ' »');
      if (/\b4 min\b/.test(r.pourquoi || '') && r.s !== 240) erreurs.push('I266' + nom.slice(4) + '« 4 min » pour ' + r.s + ' s (dureeEnMinutes arrondit)');
      // I261 — la garde.
      var cG = nombre(c.garde), visee = nombre(x.reserveAffichee);
      var diteAttendue = cG !== null && visee !== null && cG === visee;
      if (e && r.cas !== 'test' && r.cas !== 'superset') {
        if (nombre(r.garde) !== cG) erreurs.push('I261' + nom.slice(4) + 'la garde du conseil (' + r.garde + ') n’est pas celle des lignes (' + cG + ')');
        if (!!r.gardeDite !== diteAttendue) erreurs.push('I261' + nom.slice(4) + 'la garde est dite ' + (r.gardeDite ? 'alors qu’elle n’est pas celle de la visée affichée' : 'ou tue à tort'));
        if (!r.gardeDite && /avec \d+ en réserve|jusqu’au bout/.test(r.pourquoi || '')) erreurs.push('I261' + nom.slice(4) + 'la phrase dit une garde qui n’est pas celle de la ligne : ' + r.pourquoi);
        if (/jusqu’au bout/.test(r.pourquoi || '') && cG !== 0) erreurs.push('I261' + nom.slice(4) + '« jusqu’au bout » hors garde 0');
        if (/sans marge|en gardant/.test(r.pourquoi || '')) erreurs.push('I261' + nom.slice(4) + 'le conseil de repos dit « sans marge » ou « en gardant » (VOIX : « jusqu’au bout », « N en réserve ») : ' + r.pourquoi);
      }
      // I256, I257, I265 — la valeur attendue, recalculée.
      var test = !!x.semaineDeTest;
      if (enTour) test = rangs.some(function (k) { return !!(xs[k] && xs[k].semaineDeTest); });
      var attendu = null;
      if (test) attendu = 240;
      else if (enTour) {
        var bases = rangs.map(function (k) {
          var ck = contexte(xs[k]);
          return ck.famille && ck.reps !== null && ck.reps > 0 ? i256Base(ck.famille, ck.reps + (nombre(ck.garde) === null ? 0 : nombre(ck.garde))) : null;
        }).filter(function (b) { return b !== null; });
        if (bases.length) attendu = Math.min(240, Math.max(90, Math.max.apply(null, bases) - 60 * (rangs.length - 1)));
        if (r.membres !== rangs.length) erreurs.push('I265' + nom.slice(4) + 'le tour compte ' + rangs.length + ' exercices, le conseil en dit ' + r.membres);
      } else {
        if (c.famille === null || c.reps === null || !(c.reps > 0)) { erreurs.push(nom + 'un conseil sans famille ni reps visées'); return; }
        var P = c.reps + (cG === null ? 0 : cG), base = i256Base(c.famille, P);
        var al = x.consigne && x.consigne.allegee ? nombre(x.consigne.allegee.avant && x.consigne.allegee.avant.vise) : undefined;
        var v;
        if (x.consigne && x.consigne.allegee) {
          v = al === null || al === undefined ? base : Math.min(base, i256Base(c.famille, al + (cG === null ? 0 : cG)));
          // I257 — une décharge n'est jamais plus longue que le jour normal.
          if (al !== null && al !== undefined && r.s > i256Borne(i256Base(c.famille, al + (cG === null ? 0 : cG)) + 30, c.famille)) erreurs.push('I257' + nom.slice(4) + 'une décharge plus longue que le jour normal');
        } else v = (cG === 0 || (cG === 1 && c.series >= 5)) ? base + 30 : base;
        attendu = i256Borne(v, c.famille);
        if (r.s < i256Borne(base, c.famille) && !(x.consigne && x.consigne.allegee)) erreurs.push('I257' + nom.slice(4) + 'le conseil (' + r.s + ' s) est sous la base (' + base + ' s)');
        // I262 — les repos par défaut d'une routine sont la base, à P égal (reps visées + garde Normal).
        var R = racine.THRoutines;
        if (R && R.reposParDefaut && e && e.catalogue && Object.prototype.hasOwnProperty.call(e.catalogue, x.slug)) {
          var ct = e.catalogue[x.slug];
          var def = R.reposParDefaut({ prim: ct.muscles_primaires || [], sec: ct.muscles_secondaires || [], stab: ct.muscles_stabilisateurs || [], equipement: ct.equipement },
            [{ type_serie: 'travail', reps_visees: c.reps }]);
          if (def !== i256Base(c.famille, c.reps + 2)) erreurs.push('I262' + nom.slice(4) + 'le repos par défaut d’une routine (' + def + ' s) n’est pas la base du conseil à P égal (' + i256Base(c.famille, c.reps + 2) + ' s)');
        }
      }
      if (seance && e.catalogue && attendu !== null && attendu !== r.s && !(raccourci && pose !== null && pose > 0 && pose < attendu && r.s === pose)) {
        erreurs.push((enTour ? 'I265' : 'I257') + nom.slice(4) + 'le conseil vaut ' + r.s + ' s, la règle donne ' + attendu + ' s');
      }
    });
  }

  // I76 (MOTEUR §9.27 bis, 188-2) — LE REPOS D'UN GROS MOUVEMENT QUI STAGNE EST UNE LIGNE DU « POURQUOI », JAMAIS UNE CARTE :
  //   elle n'existe que si les reps ont chuté d'au moins 30 % de la série 1 à la série 3 sur 3 séances, que le repos RÉGLÉ de
  //   l'exercice est de 90 s ou moins, que c'est un gros mouvement dont le compteur de stagnation parle, que le coach est actif
  //   (ni « Juste un carnet », ni Édition, ni semaine allégée) ; et, quand elle existe, elle est au « Pourquoi », une seule fois.
  function verifierReposLong(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var nom = 'I76 — exercice ' + i + ' (' + (x && x.slug) + ') : ';
      var r = x && x.reposLong;
      if (!r) {
        if (x && x.pourquoi && x.pourquoi.repos) erreurs.push(nom + 'la ligne du repos sans son fait');
        return;
      }
      if (!(r.reposS > 0 && r.reposS <= M.REPOS_COURT_S)) erreurs.push(nom + 'un repos réglé de ' + r.reposS + ' s : absent ou au-delà de ' + M.REPOS_COURT_S + ' s');
      if (!Array.isArray(r.chutes) || r.chutes.length < M.SEANCES_DE_CHUTE || r.chutes.some(function (v) { return !(v >= M.CHUTE_DE_REPS); })) {
        erreurs.push(nom + 'des reps qui ne chutent pas d’au moins ' + Math.round(M.CHUTE_DE_REPS * 100) + ' % sur ' + M.SEANCES_DE_CHUTE + ' séances');
      }
      if (r.grand !== true) erreurs.push(nom + 'un exercice qui n’est pas un gros mouvement');
      if (!(x.compteur && x.compteur.compteur >= M.SEUIL_COMPTEUR)) erreurs.push(nom + 'un exercice dont le compteur de stagnation ne parle pas');
      if (plan.intention === 'entretien') erreurs.push(nom + 'en « Juste un carnet »');
      if (plan.edition) erreurs.push(nom + 'en Édition');
      if (plan.allegee) erreurs.push(nom + 'pendant une semaine allégée');
      if (!x.pourquoi || x.pourquoi.repos !== r.phrase) erreurs.push(nom + 'la ligne n’est pas au « Pourquoi »');
    });
  }

  // I70 (MOTEUR §9.2, 185) — UNE SÉRIE « NON, NE COMPTE PAS » (`sets.hors_calcul`) N'APPARAÎT DANS AUCUNE ENTRÉE DU PLAN : sa ligne est
  // `hors` (comme une chauffe : visible, jamais comptée), elle ne porte ni `faite` ni pari, elle n'est pas dans les `indices`
  // d'où le coach lit le palier, le niveau et les crans voisins, et sa charge ne se retrouve ni dans les séries retenues
  // (`faites`) ni dans le fantôme de la ligne suivante. Elle reste au journal et au détail : seul le plan l'ignore.
  function verifierHorsCalcul(plan, entrees, erreurs) {
    var exos = entrees && entrees.seance && entrees.seance.exercices ? entrees.seance.exercices : null;
    if (!exos) return;
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var series = exos[i] && exos[i].series ? exos[i].series : [];
      series.forEach(function (s, j) {
        if (!racine.THModele.estHorsCalcul(s)) return;
        var nom = 'I70 — exercice ' + i + ' (' + (x && x.slug) + '), série ' + j + ' hors calcul : ';
        var l = x && x.lignes ? x.lignes[j] : null;
        if (l && l.role !== 'hors') erreurs.push(nom + 'sa ligne n’est pas « hors » (rôle ' + l.role + ')');
        if (l && (l.faite !== undefined && l.faite !== null)) erreurs.push(nom + 'sa ligne porte une série faite');
        if (x && Array.isArray(x.indices) && x.indices.indexOf(j) >= 0) erreurs.push(nom + 'elle est parmi les séries lues par le coach');
        if (x && Array.isArray(x.paris) && x.paris[j]) erreurs.push(nom + 'elle porte un pari');
        var kg = nombre(s.charge_kg), rp = nombre(s.reps);
        if (x && Array.isArray(x.faites) && kg !== null && x.faites.some(function (f) {
          return f && nombre(f.charge_kg) === kg && nombre(f.reps) === rp && (series.every(function (t, k) {
            return k === j || !t || racine.THModele.estHorsCalcul(t) || !(nombre(t.charge_kg) === kg && nombre(t.reps) === rp);
          }));
        })) erreurs.push(nom + 'sa charge est comptée parmi les séries faites');
      });
    });
  }

  // I71 (MOTEUR §9.1.2 / §9.7 / §10.2, 186) — LE CRAN, LE DÉPASSEMENT, LA ZONE :
  //   · aucune consigne n'a pour cran (ligne ou haut) la charge d'une série hors palier de la dernière séance (un single n'est jamais
  //     un pas du matériel) ;
  //   · un saut de plusieurs crans (`fondement.crans` > 1) ne dépasse jamais +15 % de la charge de travail (+10 % pour un débutant
  //     ou 65 ans et plus, `fondement.plafond`, 191), ni trois crans ; aucun saut de plusieurs crans pour un débutant de 50 ans et
  //     plus (« un cran à la fois », `plan.prudence`) ;
  //   · la zone ne change que par un choix : la carte « Passer en <zone suivante> » ne vient qu'après trois séances au-dessus du
  //     haut, vers la zone d'à côté, jamais d'une zone de force, jamais seule (elle se pose à l'acceptation, `poserZone`).
  function verifierDepassement(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      var nom = 'I71 — exercice ' + i + ' (' + (x && x.slug) + ') : ';
      if (k && k.fondement) {
        var f = k.fondement;
        var hp = f.horsPalier ? nombre(f.horsPalier.charge) : null;
        var cL = k.ligne ? nombre(k.ligne.charge) : null;
        var cH = k.haut ? nombre(k.haut.charge) : null;
        if (hp !== null && ((cL !== null && cL === hp) || (cH !== null && cH === hp))) {
          erreurs.push(nom + 'la charge hors palier ' + hp + ' kg sert de cran à la consigne');
        }
        if (f.crans > 1 && cL !== null && cH !== null && cL > 0) {
          var plafond = nombre(f.plafond) !== null ? nombre(f.plafond) : 0.15;
          // 191 — jamais au-dessus du plafond de la prudence de montée, jamais plusieurs crans quand elle dit « un cran à la fois ».
          if (plan && plan.prudence && plafond > plan.prudence.plafond + 1e-9) {
            erreurs.push(nom + 'un plafond de saut de ' + plafond + ', la prudence de montée dit ' + plan.prudence.plafond);
          }
          if (plan && plan.prudence && plan.prudence.unCran) erreurs.push(nom + 'un saut de ' + f.crans + ' crans, un cran à la fois');
          if (f.crans > 3) erreurs.push(nom + 'un saut de ' + f.crans + ' crans, trois au plus');
          if (plafond > 0.15 + 1e-9) erreurs.push(nom + 'un plafond de saut de ' + plafond + ', quinze pour cent au plus');
          if ((cH - cL) / cL > plafond + 1e-6) {
            erreurs.push(nom + 'un saut de ' + f.crans + ' crans de ' + cL + ' à ' + cH + ' kg dépasse ' + Math.round(plafond * 100) + ' %');
          }
        }
      }
      var m = x && x.escalier;
      if (m && m.depassement) {
        var d = m.depassement;
        var ordre = M.ZONES.map(function (z) { return z.cle; });
        if (!(d.n >= 3)) erreurs.push(nom + 'la zone suivante proposée après ' + d.n + ' séance(s) au-dessus du haut, sous 3');
        if (ordre.indexOf(d.zone) < 0 || ordre.indexOf(d.vers) !== ordre.indexOf(d.zone) + 1) {
          erreurs.push(nom + 'la zone proposée (' + d.vers + ') n\'est pas la zone suivante de ' + d.zone);
        }
        if (M.estZoneForce(d.zone)) erreurs.push(nom + 'la zone suivante proposée à un exercice en zone de force (' + d.zone + ')');
        if (m.marche !== M.MARCHE_SCHEMA) erreurs.push(nom + 'la marche est « ' + m.marche + ' », pas le schéma');
        if (m.carte && m.carte.nouvelle_zone !== d.vers) erreurs.push(nom + 'la carte propose « ' + m.carte.nouvelle_zone + ' », le compte dit « ' + d.vers + ' »');
        if (plan.allegee) erreurs.push(nom + 'la zone suivante proposée pendant une semaine allégée');
        if (k && k.zone !== d.zone) erreurs.push(nom + 'la carte part de la zone ' + d.zone + ', la consigne est en ' + k.zone);
      }
    });
  }

  // I69 (MOTEUR §10 bis, 175) — LA CARTE DES LEVIERS, à la plus lourde de la salle : les leviers dans l'ordre (un frère plus
  // chargeable, le tempo lent, plus de reps, une charge dans Ma salle), chacun une fois, « Ma salle » toujours le dernier ;
  // le remplacement vers un frère qui se charge plus (I47) ; le tempo absent quand il est déjà en cours ; « Viser N reps » à
  // N = plafond + 3, au plus 30, au plus 8 quand le plafond est de 5 reps ou moins ; jamais un mot de réserve ou d'échec —
  // aller à l'échec n'est pas un motif.
  var ORDRE_LEVIERS = ['remplacement', 'tempo', 'reps', 'salle'];
  function verifierLeviers(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var m = x && x.escalier;
      var nom = 'I69 — exercice ' + i + ' (' + (x && x.slug) + ') : ';
      if (x && x.leviersGardes && !(x.leviersGardes.leviers || []).length) erreurs.push(nom + 'des leviers gardés sans levier');
      if (!m || m.marche !== M.MARCHE_LEVIERS) return;
      var carte = m.carte || {};
      // 183 — une carte répondue n'a plus de `carte` : ses leviers sont ceux de la marche (`m.leviers`).
      var liste = carte.leviers || m.leviers || [];
      var cles = liste.map(function (lv) { return lv && lv.cle; });
      // 175 — la carte du GROS CRAN : « Ma salle » en tête, jamais « Viser N reps » (monter en reps ne rapproche pas du cran).
      if (m.gros === true) {
        var ordreG = ['salle', 'remplacement', 'tempo'];
        var rg = cles.map(function (c) { return ordreG.indexOf(c); });
        if (!cles.length || cles[0] !== 'salle') erreurs.push(nom + 'la carte du gros cran ne s’ouvre pas sur les poids d’appoint de Ma salle');
        if (cles.indexOf('reps') >= 0) erreurs.push(nom + 'la carte du gros cran propose « Viser plus de reps »');
        if (rg.some(function (r) { return r < 0; }) || rg.some(function (r, j) { return j && r <= rg[j - 1]; })) {
          erreurs.push(nom + 'les leviers du gros cran hors de l’ordre ou répétés (' + cles.join(', ') + ')');
        }
        if (/réserve|échec/i.test(String(carte.phrase) + ' ' + liste.map(function (lv) { return lv && lv.texte; }).join(' '))) {
          erreurs.push(nom + 'la carte parle de réserve ou d’échec : jamais un motif');
        }
        return;
      }
      var rangs = cles.map(function (c) { return ORDRE_LEVIERS.indexOf(c); });
      if (!cles.length) erreurs.push(nom + 'la carte des leviers sans levier');
      if (rangs.some(function (r) { return r < 0; })) erreurs.push(nom + 'un levier inconnu (' + cles.join(', ') + ')');
      if (rangs.some(function (r, j) { return j && r <= rangs[j - 1]; })) erreurs.push(nom + 'les leviers hors de l’ordre ou répétés (' + cles.join(', ') + ')');
      if (cles.length && cles[cles.length - 1] !== 'salle') erreurs.push(nom + '« Ma salle » n’est pas le dernier levier');
      if (x.tempo && cles.indexOf('tempo') >= 0) erreurs.push(nom + 'le tempo lent proposé alors qu’il est déjà en cours');
      var pl = m.plafond || null;
      liste.forEach(function (lv) {
        if (!lv || lv.cle !== 'reps') return;
        var v = nombre(lv.visee);
        var attendu = pl ? M.viseeDuLevier(pl.reps) : null;
        if (v === null || attendu === null || v !== attendu) {
          erreurs.push(nom + 'viser ' + lv.visee + ' reps, la visée du plafond est ' + attendu);
        }
        if (v !== null && v > 30) erreurs.push(nom + 'viser ' + v + ' reps, au-delà de 30');
        if (v !== null && pl && nombre(pl.reps) <= 5 && v > 8) erreurs.push(nom + 'viser ' + v + ' reps en zone de force, au-delà de 8');
      });
      if (/réserve|échec/i.test(String(carte.phrase) + ' ' + liste.map(function (lv) { return lv && lv.texte; }).join(' '))) {
        erreurs.push(nom + 'la carte parle de réserve ou d’échec : jamais un motif');
      }
    });
  }

  // I231 (MOTEUR §14.10, 180, D4 ; renuméroté le 19/11/2026, revue lot D : I70 est « une série hors calcul », 185) — LA MARCHE D'EN DESSOUS : proposée seulement à un exercice au poids du corps (palier 0, états
  // `etirement_reps`), à un compteur multiple du pas (4, 8, …) ou déjà répondue ; jamais une marche de plus à l'exercice (I21 la
  // tient) ; sa carte nomme l'exercice du dessous et le cible ; la phrase ne parle ni de réserve ni d'échec.
  function verifierDessous(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var m = x && x.escalier;
      if (!m || m.marche !== M.MARCHE_DESSOUS) return;
      var nom = 'I231 — exercice ' + i + ' (' + x.slug + ') : ';
      var k = x.consigne || {};
      if (m.premierEssai !== true && (k.etat !== 'etirement_reps' || Number(k.palier) !== 0)) erreurs.push(nom + 'la marche d’en dessous hors d’un exercice au poids du corps');
      // 245 (F3) — le premier essai sans aide raté à 0 est l'autre porte : compteur à 0, déclenchée d'emblée (la carte le dit).
      if (m.premierEssai === true) {
        if (m.compteur !== 0 || m.declenchement !== true) erreurs.push(nom + 'le premier essai raté déclenche à compteur 0');
      } else {
        if (typeof m.compteur !== 'number' || m.compteur < M.PAS_ESCALIER) erreurs.push(nom + 'la marche d’en dessous avant ' + M.PAS_ESCALIER + ' séances sans progrès');
        if (m.declenchement === true && !M.estDeclenchement(m.compteur)) erreurs.push(nom + 'déclenchée à ' + m.compteur + ', pas un multiple de ' + M.PAS_ESCALIER);
      }
      if (!m.dessous || !m.dessous.slug) erreurs.push(nom + 'la marche d’en dessous sans exercice du dessous');
      else if (m.carte && m.carte.cible !== m.dessous.slug) erreurs.push(nom + 'la carte cible ' + m.carte.cible + ', pas ' + m.dessous.slug);
      if (m.carte && /réserve|échec/i.test(String(m.carte.phrase))) erreurs.push(nom + 'la carte parle de réserve ou d’échec : jamais un motif');
    });
  }

  // I67 (MOTEUR §9.1.2, 174 3/3) — LA ZONE 3-5 PROPOSÉE SOUS 3 REPS : jamais avant six séances sans monter, jamais à un exercice
  // qui a une zone (ni à un poids du corps), jamais en semaine allégée ni dans un bloc de programme en cours (I21, I39), et elle
  // ne change que la zone vers 3-5 ; elle ne cite que le compte et le record, jamais une réserve ni un effort.
  function verifierBordSchema(plan, erreurs) {
    var M = Moteur();
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var m = x && x.escalier;
      if (!m || !m.bord) return;
      var e67 = function (t) { erreurs.push('I67 — exercice ' + i + ' (' + x.slug + ') : ' + t); };
      var k = x.consigne || {};
      if (m.marche !== M.MARCHE_SCHEMA) e67('un compte de bord qui porte la marche « ' + m.marche + ' », pas le schéma');
      if (!(nombre(m.bord.total) >= M.BORD_PROPOSE_DES)) e67('la zone 3-5 proposée à ' + m.bord.total + ' séance(s) sans monter, sous ' + M.BORD_PROPOSE_DES);
      if (k.zone) e67('la zone 3-5 proposée à un exercice qui a une zone (' + k.zone + ')');
      if (!(nombre(k.palier) > 0)) e67('la zone 3-5 proposée sans charge');
      if (plan.allegee) e67('la zone 3-5 proposée pendant une semaine allégée');
      if (m.carte && m.carte.nouvelle_zone !== 'lourd') e67('la zone proposée est « ' + m.carte.nouvelle_zone + ' », pas 3-5');
      if (m.carte && /réserve|effort|échec/i.test(String(m.carte.phrase) + ' ' + String(m.carte.detail))) {
        e67('la carte parle de réserve ou d’échec : seul le compte la déclenche');
      }
    });
  }
  var ETATS_TEST_PLAN = { test_propose: true, retest: true, retest_un_cran: true, tout_passe: true };

  // I61 (MOTEUR §10.2 bis, 163) — UNE CHARGE JAMAIS FAITE SE DIT APPROCHÉE, et se dit complètement :
  //   · la ligne ou le test marqués `approchee` portent une vraie charge en kg (positive), jamais le palier (une charge
  //     tenue a été faite), jamais avec une salle en vigueur (les élastiques) ;
  //   · le fondement, les lignes marquées et la clé `approchee` du plan vont ensemble : l'un sans les autres est une
  //     charge affirmée ou un « ≈ » sans cause ;
  //   · le plan porte la phrase « vise la charge la plus proche… » et l'en-tête dit « ≈ » devant chaque charge marquée.
  function verifierApprochee(plan, erreurs) {
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var k = x && x.consigne;
      var nom = 'I61 — exercice ' + i + ' (' + (x && x.slug) + ') : ';
      var marquees = [];
      if (k && k.ligne && k.ligne.approchee === true) marquees.push(['la ligne', k.ligne]);
      if (k && k.haut && k.haut.approchee === true) marquees.push(['le test', k.haut]);
      var fond = !!(k && k.fondement && k.fondement.approchee === true);
      marquees.forEach(function (m) {
        var c = nombre(m[1].charge);
        if (c === null || c <= 0) erreurs.push(nom + m[0] + ' approchée sans charge en kg');
        else if (nombre(k.palier) !== null && memeChargeOuVides(c, k.palier)) erreurs.push(nom + m[0] + ' approchée à ' + c + ' kg, la charge tenue du palier');
        if (x.salle) erreurs.push(nom + m[0] + ' approchée alors qu’une salle est en vigueur');
      });
      if (fond !== (marquees.length > 0)) erreurs.push(nom + 'le fondement ' + (fond ? 'dit' : 'ne dit pas') + ' « approchée » pour ' + marquees.length + ' charge(s) marquée(s)');
      // 185 — seule exception : la ligne qui portait la charge approchée est « hors calcul » (`approcheeSansLigne`), et aucun segment
      // de l'en-tête ne la porte plus : le plan se tait, il ne cite pas une cible qu'aucune ligne n'affiche.
      var segsI61 = x.entete && Array.isArray(x.entete.segments) ? x.entete.segments : [];
      var sansLigne = x.approcheeSansLigne === true && !x.approchee && marquees.length > 0 &&
        !segsI61.some(function (sg) { return sg && sg.approchee === true; });
      if (!sansLigne && (marquees.length > 0) !== !!x.approchee) erreurs.push(nom + 'la charge approchée et la clé « approchee » du plan ne vont pas ensemble');
      if (x.approchee && (!x.approchee.phrase || !/vise/.test(String(x.approchee.phrase)))) erreurs.push(nom + 'une charge approchée sans sa phrase');
      // L'en-tête dit « ≈ » devant chaque charge approchée qu'il décrit (ses segments), et seulement elles.
      var segs = x.entete && Array.isArray(x.entete.segments) ? x.entete.segments : [];
      if (!k || !k.allegee) {
        var dit = x.entete && Array.isArray(x.entete.jaune) && x.entete.jaune.join(' ').indexOf('\u2248') >= 0;
        var voulu = segs.some(function (sg) { return sg.approchee === true; });
        if (voulu && !dit) erreurs.push(nom + 'une charge approchée que l’en-tête ne dit pas « ≈ »');
        if (dit && !voulu) erreurs.push(nom + 'un « ≈ » dans l’en-tête sans charge approchée');
      }
    });
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
          : src === 'degressive' ? refDeLaDegressive(x, l.iSerie) : (k && k.palier);
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
        memeChargeOuVides(k.ligne.charge, r.repli.ligne[0]));
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
      // 175 — le remplacement est le premier levier de la carte des leviers : vers un exercice plus chargeable que le plafond.
      if (m.marche === M.MARCHE_LEVIERS) {
        (m.carte.leviers || []).forEach(function (lv) {
          if (lv && lv.cle === M.LEVIER_REMPLACEMENT &&
              !(m.remplacant && lv.vers === m.remplacant.slug && M.plusChargeableALaSalle(m.remplacant, m.plafond.charge))) {
            erreurs.push(nom + 'un remplacement vers un exercice qui ne se charge pas plus que le plafond (' +
              (lv.vers || 'aucun') + ')');
          }
        });
      }
    });
  }

  // I51 (MOTEUR §10 ter, 132) — SUR UN EXERCICE NOTÉ PAR NOM : « aucune charge proposée hors de la liste (ligne, ligne
  // haute, test, proposition de la réaction, fantôme), aucune chauffe, aucune dégressive, aucune ligne de record ; une
  // série neutre ne compte ni pour le niveau, ni pour le compteur, ni pour le meilleur. » Condition par condition :
  //   a) la consigne : sa ligne, sa ligne haute (jamais un test sans chiffre) dans la liste ;
  //   b) les lignes : chaque fantôme d'une ligne à faire, chaque proposition de la réaction (ligne du coach, attente)
  //      dans la liste ; chaque pré-remplissage dit un NOM de la liste, jamais une charge ;
  //   c) aucune chauffe, ni proposition de chauffes ;
  //   d) aucune dégressive (ligne remplie, dégressive en cours, marche de l'escalier) ;
  //   e) aucun record : une série validée notée par nom ne bat rien, même après une série plus faible
  //      (`THModele.recordsBattus` rejoué sur elle) ;
  //   f) une série neutre (un nom absent de la liste) ne compte pas : elle n'entre pas dans les séries faites que la
  //      réaction lit, et aucun pari ne s'écrit sur l'exercice (le compteur ne lit que les séances sous consigne).
  function verifierElastiques(plan, entrees, erreurs) {
    var Mo = racine.THModele;
    var exos = entrees && entrees.seance && entrees.seance.exercices ? entrees.seance.exercices : [];
    ((plan && plan.exercices) || []).forEach(function (x, i) {
      var el = x && x.elastique;
      if (!el || !el.noms) return;
      var nom = 'I51 — exercice ' + i + ' (' + x.slug + ') : ';
      var dans = function (c) { return c !== null && Object.prototype.hasOwnProperty.call(el.noms, String(c)); };
      var hors = function (v, ou) {
        var c = nombre(v);
        if (c === null) erreurs.push(nom + ou + ' sans élastique');
        else if (!dans(c)) erreurs.push(nom + ou + ' à une charge hors de la liste (' + c + ')');
      };
      // a) la consigne.
      var k = x.consigne;
      if (k && k.etat !== 'silence') {
        if (k.ligne) hors(k.ligne.charge, 'la ligne de la consigne');
        if (k.haut) hors(k.haut.charge, 'la ligne haute de la consigne');
      }
      // b) les lignes, la réaction, le pré-remplissage.
      (x.lignes || []).forEach(function (l) {
        if (!l || l.validee) return;
        if (l.role !== 'hors' && l.fantome && nombre(l.fantome.charge) !== null) hors(l.fantome.charge, 'le fantôme de la série ' + l.iSerie);
        var p = l.prerempli;
        if (p && p.charge_kg !== null && p.charge_kg !== undefined) {
          erreurs.push(nom + 'la série ' + l.iSerie + ' pré-remplie d’une charge (' + p.charge_kg + '), pas d’un nom');
        }
        if (p && p.elastique !== null && p.elastique !== undefined && (el.liste || []).indexOf(p.elastique) < 0) {
          erreurs.push(nom + 'la série ' + l.iSerie + ' pré-remplie d’un élastique hors de la liste (' + p.elastique + ')');
        }
      });
      ((x.reaction && x.reaction.plan) || []).forEach(function (q, j) {
        if (q && q.source === 'coach') hors(q.charge, 'la proposition du coach (ligne ' + j + ')');
      });
      var attente = x.reaction && x.reaction.attente;
      if (attente && Array.isArray(attente.charges)) attente.charges.forEach(function (c) { hors(c, 'la proposition de la réaction'); });
      // c) les chauffes.
      if (x.chauffes || x.proposition) erreurs.push(nom + 'des chauffes sur un élastique');
      // d) la dégressive.
      if (x.degressive || x.degressiveEnCours || (x.escalier && x.escalier.marche === Moteur().MARCHE_DEGRESSIVE)) {
        erreurs.push(nom + 'une dégressive sur un élastique');
      }
      // e) aucun record, et f) aucune série neutre comptée.
      var exo = exos[i];
      var faites = (x.faites || []).length;
      ((exo && exo.series) || []).forEach(function (s, k2) {
        if (!s || !Seance().partEnBase(s)) return;
        if (s.elastique !== null && s.elastique !== undefined) {
          // La veille, la MÊME série notée en kg, une rep de moins : sans la règle, celle du jour la battrait.
          var faible = Object.assign({}, s, { elastique: null, reps: Math.max(1, (Number(s.reps) || 1) - 1) });
          var veille = { debut: new Date(Date.parse((entrees.seance && entrees.seance.debut) || 0) - 864e5).toISOString(),
                         series: [faible] };
          var r = Mo.recordsBattus([veille], { debut: entrees.seance.debut, series: [s] }, 0, {});
          if (r.length) erreurs.push(nom + 'la série ' + k2 + ' (' + s.elastique + ') ferait un record (' + r[0].type + ')');
          if ((el.liste || []).indexOf(s.elastique) < 0 && faites &&
              (x.lignes || []).some(function (l) { return l && l.iSerie === k2 && l.role !== 'hors' && l.faite && nombre(l.faite.charge) !== null; })) {
            erreurs.push(nom + 'la série neutre ' + k2 + ' (' + s.elastique + ') compte dans les séries faites');
          }
        }
      });
      if ((x.paris || []).some(Boolean)) erreurs.push(nom + 'un pari (il écrirait une charge virtuelle)');
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
      // 266 (I145, I146) — un accessoire qui change au début d'un bloc : ce que la vue montre, vérifié sur l'entrée qui l'a produit.
      var G = racine.THGenerateur;
      if (G && vue && vue.variations && vue.variations.length && vue.variationsEntree) {
        graves = graves.concat(G.verifierVariations(vue.variationsEntree, vue.variations));
      }
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
    tetesDuPlan: tetesDuPlan,
    carteDeTestAGestes: carteDeTestAGestes,
    ORDRE_DE_LA_FILE: ORDRE_DE_LA_FILE,
    lignesARetirer: lignesARetirer,
    // 236 (MOTEUR §9.39) — « Ajuster la fin à ma forme du jour » : les lignes à retirer, lues sur le plan
    lignesAAjuster: lignesAAjuster,
    lignesAEnlever: lignesAEnlever,
    lignesAAjouter: lignesAAjouter,
    degressivesAAjouter: degressivesAAjouter,
    planDesLignes: planDesLignes, gardeDeLigne: gardeDeLigne,
    rejouer: rejouer,
    verifierPlan: verifierPlan,
    verifierCapacite: verifierCapacite,
    verifierCalisthenie: verifierCalisthenie,
    verifierOndulation: verifierOndulation,
    verifierRestPause: verifierRestPause,
    verifierSansRestPause: verifierSansRestPause,
    verifierBaisseAttendue: verifierBaisseAttendue,
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
    veilleDuJour: veilleDuJour, noterVeilleDuJour: noterVeilleDuJour, veilleLegereDesGestes: veilleLegereDesGestes, causesTues: causesTues,
    refusChauffesDe: refusChauffesDe, miseEnSilence: miseEnSilence, annulerRefusChauffes: annulerRefusChauffes,
    SERIES_DEPART_PROGRESSER: SERIES_DEPART_PROGRESSER,
    SERIES_DEPART_ENTRETIEN: SERIES_DEPART_ENTRETIEN,
    // Le dernier plan calculé par l'app, et ses entrées : le banc le lit pour
    // vérifier les invariants après chaque geste. Rien ne le relit en prod.
    dernier: null
  };

  racine.THPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
