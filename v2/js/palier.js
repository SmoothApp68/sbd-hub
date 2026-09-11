// v2/js/palier.js — de la séance-exercice brute au palier.
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache, au catalogue.
// Il applique, DANS CET ORDRE, MOTEUR-PROGRESSION-V2 §4 (types) · §4.1 (chauffe
// probable) · §5 (montée / rampe) · §6 (descente de fin) · §7 (palier).
//
// PORTAGE, PAS RÉÉCRITURE. La référence exécutable est `banc_etage1.py`, qui a
// servi à valider l'enchaînement sur les cinq profils. Chaque écart de lecture
// entre ce fichier et le Python est un défaut de portage, pas une amélioration.
//
// ⚠️ LA CIRCULARITÉ DU §7.3 EST LE PIÈGE PRINCIPAL. Le §4.1 situe la chauffe
// probable « avant la première série au palier » ; le palier se calcule après
// exclusion de la chauffe. Chacun a besoin de l'autre. Résolution en DEUX
// PASSES : un palier PROVISOIRE sur les séries brutes situe la frontière, puis
// le palier DÉFINITIF se calcule après exclusions. Le palier provisoire ne sort
// jamais de ce calcul — il n'est ni rendu, ni affiché, ni stocké.
//
// Ce module ne prescrit RIEN. Il ne calcule aucune cible, n'émet aucune
// suggestion et ne compare aucune séance à une autre. Il décrit une séance
// passée : quelle charge a été tenue, et par quelles séries.

(function (racine) {
  'use strict';

  // §4.1 — choix produit, pas un résultat mesuré. Placé nettement en dessous de
  // l'écart d'une montée en charge (2 à 5 %) pour ne jamais confondre les deux.
  var SEUIL_CHAUFFE_PROBABLE = 0.75;

  // §5.2 — 8 séances avant de conclure, puis 60 % / 35 %. Choix produit : la
  // distribution est continue, pas bimodale.
  var SEUIL_SEANCES_ETAT = 8;
  var SEUIL_MONTE = 0.60;
  var SEUIL_NE_MONTE_PAS = 0.35;

  // §4 — les TROIS tags que le moteur écarte du palier, et le rôle que chacun
  // porte. UNE SEULE TABLE : `analyser` et `serieDeTravail` la lisent tous les
  // deux. Écrire la règle à deux endroits, c'est se donner deux voix pour le
  // même verdict — la famille de défauts que l'audit v1 a cataloguée, et le
  // banc de mutation l'a attrapée ici avant qu'elle ne serve.
  var CHAUFFE = 'echauffement';
  var DEGRESSIVE = 'degressive';
  var ECHEC = 'echec';

  var ROLE_DU_TAG = {};
  ROLE_DU_TAG[CHAUFFE] = 'chauffe';
  ROLE_DU_TAG[DEGRESSIVE] = 'degressive';   // §6.3 — descente choisie, déclarée
  ROLE_DU_TAG[ECHEC] = 'echec';             // §6.3 — descente subie, déclarée

  function roleDuTag(s) {
    return Object.prototype.hasOwnProperty.call(ROLE_DU_TAG, s && s.type_serie)
      ? ROLE_DU_TAG[s.type_serie] : null;
  }

  var ETAT_MONTE = 'monte';
  var ETAT_NE_MONTE_PAS = 'ne_monte_pas';
  var ETAT_INDETERMINE = 'indetermine';

  // ── Lecture des séries ───────────────────────────────────────────────────

  function nombre(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // `charger()` du Python écarte les lignes sans charge NI reps. Ce n'est pas
  // un détail de lecture de CSV : une série sans charge ne peut pas voter pour
  // une charge. Les exercices mesurés en durée ou en distance (gainage,
  // randonnée, natation) n'ont donc aucun palier — et c'est correct, ils n'en
  // ont pas. ZÉRO est une valeur, pas une absence : une tentative à 0 rep
  // existe en base, elle est lue.
  function utilisable(s) {
    return !!s && nombre(s.charge_kg) !== null && nombre(s.reps) !== null;
  }

  // §1.2 — AUCUNE lecture de séries sans tri explicite sur le rang. L'ordre
  // d'arrivée d'une requête n'est pas l'ordre de la séance, et tout ce qui
  // suit — première série, dernière série, avant-dernière — n'a de sens que
  // trié.
  function trier(series) {
    return (series || []).filter(utilisable).slice().sort(function (a, b) {
      var ra = nombre(a.rang), rb = nombre(b.rang);
      if (ra === null) ra = 0;
      if (rb === null) rb = 0;
      if (ra !== rb) return ra - rb;
      return String(a.id).localeCompare(String(b.id));   // ordre stable
    });
  }

  // §4 — le tag prime TOUJOURS.
  //
  // `echec` NE VOTE PAS, comme le dit le tableau du §4. `banc_etage1.py`
  // n'écartait que `warmup` et `dropset` : c'était un oubli du banc, arbitré le
  // 11/09/2026, et `v2/banc/banc_etage1.py` porte la correction.
  //
  // La mesure tranche : sur les 97 séance-exercices contenant un `echec`,
  // **93 ont cet échec au-dessus de la plus lourde série de travail** — c'est
  // la définition même d'un échec, on charge plus que ce qu'on tient (le §6.4
  // le mesure à 105 %). Le laisser voter remonte donc le palier au-dessus de la
  // réalité de façon systématique. Cas réel, séance du 28/08/2026 :
  // `92×1, [echec] 100×0, 92×1` donnait « palier 100 × 0 » — l'app affirmait
  // qu'on avait tenu 100 kg le jour où l'on avait échoué à 100 kg. Elle dit
  // maintenant 92 × 1, ce qui est vrai. Coût mesuré : 0,1 point de taux de
  // reconnaissance au plus, sur les cinq profils.
  function serieDeTravail(s) { return roleDuTag(s) === null; }

  // ── §7.2 — le palier ─────────────────────────────────────────────────────
  //
  // La charge la plus lourde tenue sur la MAJORITÉ des séries, avec un plancher
  // de 3. `k >= min(3, arrondi_sup(n / 2))`.
  //
  //   n = 2 -> 1 requise · n = 3 -> 2 · n = 4 -> 2 · n >= 5 -> 3
  //
  // Sans le plancher, la charge la plus lourde d'une séance à deux séries
  // ferait palier ; sans la majorité, une exploration à une rep le ferait.
  function calculerPalier(series) {
    var liste = series || [];
    if (!liste.length) return null;
    var n = liste.length;
    var requis = Math.min(3, Math.ceil(n / 2));

    var compte = new Map();
    liste.forEach(function (s) {
      var kg = nombre(s.charge_kg);
      compte.set(kg, (compte.get(kg) || 0) + 1);
    });

    var meilleur = null;
    compte.forEach(function (k, kg) {
      if (k >= requis && (meilleur === null || kg > meilleur)) meilleur = kg;
    });
    return meilleur;
  }

  // ── Découpage en séance-exercices ────────────────────────────────────────
  //
  // Une séance-exercice = (une séance, un exercice). C'est l'unité de tout ce
  // qui suit : le palier est la charge de travail D'UN EXERCICE DANS UNE
  // SÉANCE, jamais d'une séance entière.
  function decouperParExercice(series) {
    var paquets = new Map();
    trier(series).forEach(function (s) {
      if (!s.exercise_slug) return;
      var l = paquets.get(s.exercise_slug);
      if (l) l.push(s); else paquets.set(s.exercise_slug, [s]);
    });
    var sortie = [];
    paquets.forEach(function (liste, slug) { sortie.push({ slug: slug, series: liste }); });
    return sortie;
  }

  // Le corpus entier, séance par séance. `series` porte `session_id`.
  function seanceExercices(series) {
    var parSeance = new Map();
    (series || []).forEach(function (s) {
      if (!s || !s.session_id) return;
      var l = parSeance.get(s.session_id);
      if (l) l.push(s); else parSeance.set(s.session_id, [s]);
    });
    var sortie = [];
    parSeance.forEach(function (liste, sessionId) {
      decouperParExercice(liste).forEach(function (se) {
        sortie.push({ sessionId: sessionId, slug: se.slug, series: se.series });
      });
    });
    return sortie;
  }

  // ── §5.1 / §5.2 — l'état d'un exercice ───────────────────────────────────
  //
  // « Monte en charge » est une propriété MESURÉE PAR EXERCICE, pas une règle
  // globale : la fréquence va de 0 % (rowing debout barre) à 91 % (hip thrust
  // machine). Une règle globale casserait sur la moitié du catalogue.
  //
  // Le Python compte sur les séries NON-`warmup` — les dégressives comprises,
  // contrairement à `analyser` qui les écarte. Incohérence du Python, portée
  // telle quelle : c'est la référence qui a produit les chiffres du §5.1.
  function etatsExercices(listeSeanceExercices) {
    var stats = new Map();
    (listeSeanceExercices || []).forEach(function (se) {
      var trav = se.series.filter(function (s) { return s.type_serie !== CHAUFFE; });
      if (trav.length < 3) return;
      var st = stats.get(se.slug) || { monte: 0, total: 0 };
      st.total += 1;
      var suivantes = trav.slice(1).map(function (s) { return nombre(s.charge_kg); });
      if (nombre(trav[0].charge_kg) < Math.max.apply(null, suivantes)) st.monte += 1;
      stats.set(se.slug, st);
    });

    var etats = {};
    stats.forEach(function (st, slug) {
      var part = st.monte / st.total;
      var etat;
      // Moins de 8 séances : AUCUNE hypothèse. Un exercice mal classé fausse
      // tous ses paliers, et 48 exercices du catalogue sont des essais uniques.
      if (st.total < SEUIL_SEANCES_ETAT) etat = ETAT_INDETERMINE;
      else if (part >= SEUIL_MONTE) etat = ETAT_MONTE;
      else if (part <= SEUIL_NE_MONTE_PAS) etat = ETAT_NE_MONTE_PAS;
      else etat = ETAT_INDETERMINE;
      etats[slug] = { etat: etat, part: part, total: st.total };
    });
    return etats;
  }

  // ── L'enchaînement complet, §4 -> §7 ─────────────────────────────────────
  //
  // Rend une DESCRIPTION, jamais une mutation : les séries reçues ne sont pas
  // touchées. Chaque série sort avec son rôle, et le palier avec les meilleures
  // reps qui y ont été tenues.
  function analyser(seriesBrutes, etatExercice) {
    var series = trier(seriesBrutes);
    var roles = new Map();

    // §4 — le tag prime. Une chauffe taguée est une chauffe, point.
    var travail = [];
    series.forEach(function (s) {
      var tag = roleDuTag(s);
      if (tag) roles.set(s, tag); else travail.push(s);
    });

    if (!travail.length) return sortie(series, roles, null, 'aucune-serie-de-travail');

    var plusLourde = Math.max.apply(null, travail.map(function (s) { return nombre(s.charge_kg); }));

    // ── PASSE 1 — palier PROVISOIRE, sans aucune exclusion (§7.3) ──────────
    // Il ne sert qu'à situer la frontière de chauffe. Il ne sort pas d'ici.
    var palierProvisoire = calculerPalier(travail);
    var indexPalier = travail.length;
    if (palierProvisoire !== null) {
      for (var i = 0; i < travail.length; i++) {
        if (nombre(travail[i].charge_kg) === palierProvisoire) { indexPalier = i; break; }
      }
    }

    // §4.1 — chauffe probable : <= 75 % de la plus lourde ET AVANT la première
    // série au palier. Les deux conditions comptent : une série légère APRÈS le
    // palier est une descente de fin, pas une chauffe.
    travail.forEach(function (s, k) {
      if (k < indexPalier && nombre(s.charge_kg) <= SEUIL_CHAUFFE_PROBABLE * plusLourde) {
        roles.set(s, 'chauffe_probable');
      }
    });

    var retenues = travail.filter(function (s) { return !roles.has(s); });
    if (!retenues.length) return sortie(series, roles, null, 'tout-ecarte-par-la-chauffe');

    // ── §5.2 / §5.4 — la rampe ne vote pas si l'exercice « monte » ─────────
    // Elle reste une série de travail entière (volume, tonnage, historique) :
    // la seule chose qu'elle ne fait pas, c'est juger le palier du jour.
    var etat = (etatExercice && etatExercice.etat) || ETAT_INDETERMINE;
    if (etat === ETAT_MONTE && retenues.length >= 2) {
      var apres = retenues.slice(1).map(function (s) { return nombre(s.charge_kg); });
      if (nombre(retenues[0].charge_kg) < Math.max.apply(null, apres)) {
        roles.set(retenues[0], 'rampe');
        retenues = retenues.slice(1);
      }
    }

    // ── §6.3 / §6.5 — descente de fin NON TAGUÉE ──────────────────────────
    // Le tag a déjà tranché les deux autres mécanismes plus haut. Ici seulement
    // la déduction : si l'avant-dernière a tenu le compte de reps AU PALIER,
    // la descente est un choix et ne vote pas ; sinon c'est de la fatigue et
    // elle reste. Le compte de référence se prend AU PALIER (§6.5) — le
    // prendre sur toutes les séries laisserait la série de montée le gonfler.
    if (retenues.length >= 3) {
      var derniere = retenues[retenues.length - 1];
      var avant = retenues[retenues.length - 2];
      if (nombre(derniere.charge_kg) < nombre(avant.charge_kg)) {
        var sansDerniere = retenues.slice(0, -1);
        var palierRef = calculerPalier(sansDerniere);
        var repsRef = null;
        if (palierRef !== null) {
          sansDerniere.forEach(function (s) {
            if (nombre(s.charge_kg) !== palierRef) return;
            var r = nombre(s.reps);
            if (repsRef === null || r > repsRef) repsRef = r;
          });
        }
        if (repsRef !== null && nombre(avant.reps) >= repsRef) {
          roles.set(derniere, 'descente_choisie');
          retenues = sansDerniere;
        }
      }
    }

    // ── §7.2 — palier DÉFINITIF, sur les seules séries retenues ───────────
    var palier = calculerPalier(retenues);

    // §7.5 — toute série plus lourde que le palier est une EXPLORATION. Elle
    // est conservée et affichée, elle nourrit l'estimation du maximum, mais
    // elle ne valide rien : on a tenté le poids du dessus pour voir.
    retenues.forEach(function (s) {
      if (palier !== null && nombre(s.charge_kg) > palier) roles.set(s, 'exploration');
      else if (!roles.has(s)) roles.set(s, 'travail');
    });

    return sortie(series, roles, palier, null);
  }

  function sortie(series, roles, palier, erreur) {
    var decrites = series.map(function (s) {
      return { serie: s, role: roles.get(s) || null };
    });
    var retenues = decrites.filter(function (d) { return d.role === 'travail'; })
      .map(function (d) { return d.serie; });

    // Les meilleures reps AU PALIER — « j'ai fait 122,5 × 6 ». Jamais la série
    // la plus lourde, qui peut être une exploration à une rep ou une rampe.
    var reps = null;
    if (palier !== null) {
      retenues.forEach(function (s) {
        if (nombre(s.charge_kg) !== palier) return;
        var r = nombre(s.reps);
        if (reps === null || r > reps) reps = r;
      });
    }

    return {
      palier: palier, reps: reps, erreur: erreur || null,
      series: decrites, retenues: retenues
    };
  }

  // ── §17.3 / §17.4 / §9.2 — la validation d'un palier ─────────────────────
  //
  // Porté ici parce que la RECETTE du §6.1 du banc l'exige telle quelle. Rien
  // d'autre ne s'en sert dans ce commit : aucune cible n'est calculée, aucune
  // consigne n'est émise. La cible est une ENTRÉE de ces fonctions.

  // §17.3 — trois crans, bandes FERMÉES : facile < 8 · dur 8 à 9,5 · max = 10.
  //
  // Le 9,5 dans `dur` est le seul arbitrage réel, et il est mesuré : le classer
  // en `max` fait basculer trois séance-exercices de « palier tenu » à « palier
  // non tenu » alors que les reps visées étaient faites. Le cran `max` veut dire
  // « plus rien en réserve » ; à 9,5 il reste quelque chose.
  function cranEffort(rpe) {
    var v = nombre(rpe);
    if (v === null) return null;
    if (v < 8) return 'facile';
    if (v <= 9.5) return 'dur';
    return 'max';
  }

  // §17.4 — une série marquée `max` compte −1 rep POUR LA VALIDATION SEULEMENT.
  // Le nombre réel reste celui du volume, du tonnage et de l'estimation du max.
  function repsComptees(reps, rpe) {
    var r = nombre(reps);
    if (r === null) return null;
    return cranEffort(rpe) === 'max' ? r - 1 : r;
  }

  // §9.2 — les deux premières séries atteignent la cible, les suivantes sont
  // tolérées à −1 rep. Les séries 1 et 2 sont les moins fatiguées, donc les plus
  // représentatives de la maîtrise ; au-delà c'est une courbe de fatigue
  // normale, pas un défaut de maîtrise.
  //
  // `series` : [{ reps, rpe }], DÉJÀ réduites aux séries au palier (le rang se
  // compte au palier, pas sur l'exercice — §9.2).
  function palierTenu(series, cible) {
    var liste = series || [];
    if (liste.length < 2) return { tenu: false, raison: 'moins de deux séries au palier' };
    var c = nombre(cible);
    for (var i = 0; i < liste.length; i++) {
      var r = repsComptees(liste[i].reps, liste[i].rpe);
      var seuil = i < 2 ? c : c - 1;
      if (r === null || r < seuil) {
        return { tenu: false, raison: 'série ' + (i + 1) + ' : ' + r + ' comptée(s) < ' + seuil + ' requise(s)' };
      }
    }
    return { tenu: true, raison: 'toutes les séries au seuil' };
  }

  var api = {
    SEUIL_CHAUFFE_PROBABLE: SEUIL_CHAUFFE_PROBABLE,
    SEUIL_SEANCES_ETAT: SEUIL_SEANCES_ETAT,
    SEUIL_MONTE: SEUIL_MONTE,
    SEUIL_NE_MONTE_PAS: SEUIL_NE_MONTE_PAS,
    ETAT_MONTE: ETAT_MONTE,
    ETAT_NE_MONTE_PAS: ETAT_NE_MONTE_PAS,
    ETAT_INDETERMINE: ETAT_INDETERMINE,
    CHAUFFE: CHAUFFE, DEGRESSIVE: DEGRESSIVE, ECHEC: ECHEC,
    ROLE_DU_TAG: ROLE_DU_TAG,
    roleDuTag: roleDuTag,
    trier: trier,
    utilisable: utilisable,
    serieDeTravail: serieDeTravail,
    calculerPalier: calculerPalier,
    decouperParExercice: decouperParExercice,
    seanceExercices: seanceExercices,
    etatsExercices: etatsExercices,
    analyser: analyser,
    cranEffort: cranEffort,
    repsComptees: repsComptees,
    palierTenu: palierTenu
  };

  racine.THPalier = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
