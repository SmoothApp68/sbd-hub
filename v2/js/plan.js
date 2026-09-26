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
// du coach. Le fantôme, les paris, le constat et le reste du « Pourquoi »
// suivent en C2 à C5 : ils lisent déjà la couverture et la réaction d'ICI, par
// `app.js`, mais leurs règles propres n'y sont pas encore.

(function (racine) {
  'use strict';

  function Moteur() { return racine.THMoteur; }
  function Seance() { return racine.THSeance; }

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

  // ── LE PLAN D'UN EXERCICE ───────────────────────────────────────────────
  function planDExercice(exo, iExo, consigneDuSlug, paris, seanceId) {
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
    var consigne = c.consigne;
    var siens = (paris || []).filter(function (l) {
      return l && l.exercise_slug === base.slug && l.fondement && l.fondement.seance === seanceId;
    });
    var figees = S.figeesDe(siens, series, consigne);
    var couverture = S.couvertureSeance(series, consigne, figees);
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
      var s = series[indices[k]];
      if (!S.partEnBase(s)) break;
      faites.push({ charge_kg: s.charge_kg, reps: s.reps, rpe: s.rpe, ressenti: s.ressenti });
    }
    var planInitial = M.planDeCouverture(consigne, couvertes);
    var reaction = M.reactionPour(consigne, faites, c.contexte || null, planInitial);

    var lignes = series.map(function (sr, i) {
      var cov = couverture[i];
      var ligne = { iSerie: i, type: S.typeDe(sr), validee: S.partEnBase(sr) };
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
      return ligne;
    });

    // La phrase du coach : sur la ligne `message.rang` (une POSITION).
    var m = reaction.message;
    var message = m ? {
      position: m.rang, iSerie: indices[m.rang] === undefined ? null : indices[m.rang],
      type: m.type, phrase: M.phraseReaction(m, consigne.zone)
    } : null;

    // L'en-tête décrit la disposition de la consigne sur les lignes de la
    // séance (ECRAN §3.12, 26/09/2026) — plus le `n` de la consigne brute.
    var disposition = planInitial.map(function (p) { return p && p.role === 'haut' ? 'haut' : 'ligne'; });
    var entete = M.enteteDeDisposition(consigne, disposition);
    var gris = c.libelles ? c.libelles.gris : '';

    return {
      iExo: iExo, slug: base.slug,
      consigne: consigne, contexte: c.contexte || null,
      indices: indices, rangs: rangs, roles: roles, figees: figees,
      planInitial: planInitial, faites: faites, reaction: reaction,
      lignes: lignes, message: message,
      entete: { jaune: entete.jaune, gris: gris, segments: entete.segments },
      donc: entete.jaune.length ? 'Donc ' + entete.jaune.join(', ') + '.' : null
    };
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
  //     relisent dans les paris (§9.13, #322).
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
        return planDExercice(exo, i, c, e.paris || [], seance.id);
      })
    };
  }

  // ══ LES INVARIANTS — UN COACH QUI NE PEUT PAS SE CONTREDIRE ══════════════
  //
  // Vérifiés sur chaque plan : en test (plans générés), au banc (après chaque
  // geste). C1 porte I1, I2, I3, I6, I9 et I12 ; les autres arrivent avec les
  // étapes qu'ils gardent (C2 à C6). Rend `{ ok, erreurs }`.
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

  function verifierExercice(x, erreurs) {
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
      if (ch !== null && P !== null && !(ch > P && !memeCharge(ch, P))) {
        err('I3', 'proposition ' + ch + ' pas au-dessus de la charge de travail ' + P + ' (ligne ' + i + ')');
      }
    });

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
    // Le message affiché est celui de la réaction, sur la bonne série.
    if ((x.message ? 1 : 0) !== (msg ? 1 : 0) ||
        (x.message && msg && x.message.iSerie !== (couvertes[msg.rang] || {}).iSerie)) {
      err('I9', 'la phrase affichée ne correspond pas au message de la réaction');
    }
  }

  // `entrees` (facultatif) : I12 — mêmes entrées, même plan, et les entrées
  // ne sont pas modifiées par le calcul.
  function verifierPlan(plan, entrees) {
    var erreurs = [];
    ((plan && plan.exercices) || []).forEach(function (x) { verifierExercice(x, erreurs); });
    if (entrees !== undefined) {
      var avant = JSON.stringify(entrees);
      var refait = planDeSeance(entrees);
      if (JSON.stringify(refait) !== JSON.stringify(plan)) erreurs.push('I12 — même entrée, plan différent');
      if (JSON.stringify(entrees) !== avant) erreurs.push('I12 — le calcul a modifié ses entrées');
    }
    return { ok: erreurs.length === 0, erreurs: erreurs };
  }

  var api = {
    planDeSeance: planDeSeance,
    verifierPlan: verifierPlan,
    seriesDites: seriesDites,
    // Le dernier plan calculé par l'app, et ses entrées : le banc le lit pour
    // vérifier les invariants après chaque geste. Rien ne le relit en prod.
    dernier: null
  };

  racine.THPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
