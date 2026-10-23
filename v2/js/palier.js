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

  // 152 — UNE SÉRIE `echec` À 1 REP OU PLUS EST UNE SÉRIE DE TRAVAIL À FOND, pas un tag
  // qui écarte : la lecture est UNE (`THModele.estAEchec`, chargé avant ce module). À
  // 0 rep (ou reps vides) elle reste le rôle `echec`, ignoré comme avant.
  function aEchec(s) {
    return !!racine.THModele && racine.THModele.estAEchec(s);
  }

  function roleDuTag(s) {
    if (aEchec(s)) return null;
    return Object.prototype.hasOwnProperty.call(ROLE_DU_TAG, s && s.type_serie)
      ? ROLE_DU_TAG[s.type_serie] : null;
  }

  var ETAT_MONTE = 'monte';
  var ETAT_NE_MONTE_PAS = 'ne_monte_pas';
  var ETAT_INDETERMINE = 'indetermine';

  // ── LES RAISONS D'UNE ABSENCE DE PALIER ──────────────────────────────────
  //
  // ⚠️ « PAS DE PALIER PAR NATURE » ET « PAS DE PALIER CETTE FOIS » NE SONT PAS
  // LA MÊME CHOSE, et le moteur doit pouvoir les distinguer — c'est la réserve
  // notée au chantier 24, levée ici.
  //
  //   · `sans-charge`   — l'exercice n'a pas de charge PAR NATURE (`reps`,
  //                       `temps`). Une planche n'aura jamais de palier en kg,
  //                       et il n'y a rien à réessayer demain.
  //   · `hors-moteur`   — `distance_temps` est exclu du moteur (CADRAGE §2 ter) :
  //                       aucun palier, aucune cible, aucune suggestion, jamais.
  //   · les deux autres — l'absence est CIRCONSTANCIELLE : ce jour-là, rien n'a
  //                       été retenu. Demain, peut-être.
  var SANS_CHARGE = 'sans-charge';
  var HORS_MOTEUR = 'hors-moteur';
  var AUCUNE_SERIE = 'aucune-serie-de-travail';
  var TOUT_CHAUFFE = 'tout-ecarte-par-la-chauffe';

  // Les mesures du catalogue qui ne portent PAS de charge. `charge_reps` est la
  // seule que le moteur sait juger ; une mesure inconnue n'est pas supposée
  // sans charge — on ne devine pas, on laisse l'enchaînement décider.
  var MESURES_SANS_CHARGE = { reps: true, temps: true };

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
  //
  // ⚠️ ET QUAND LE RANG MANQUE, L'ORDRE REÇU FAIT FOI (20/09/2026). Une série
  // qui n'est pas encore en base n'a pas de rang : il se calcule à l'écriture.
  // Le départage tombait alors sur `localeCompare` de l'identifiant — un UUID
  // tiré au hasard à la création de la ligne —, et le constat de fin de bloc
  // lisait la séance du jour dans un ordre qu'aucun geste de l'utilisateur
  // n'avait produit : au squat du 20/09, `120 → 130 → 130 → 130` (5, 4, 4 au
  // palier) s'est lu « 4-5-4 ». Le même dégât qu'au soulevé hex du 21 août
  // (§1.2 de la spec), par l'autre bout.
  //
  // Le tri de JavaScript est STABLE : à rangs égaux, l'ordre du tableau
  // survit, et c'est celui de l'écran. Un départage « pour la forme » n'est pas
  // de la stabilité — c'est du hasard rendu déterministe.
  function trier(series) {
    return (series || []).filter(utilisable).slice().sort(function (a, b) {
      var ra = nombre(a.rang), rb = nombre(b.rang);
      if (ra === null) ra = 0;
      if (rb === null) rb = 0;
      return ra - rb;
    });
  }

  // §4 — le tag prime TOUJOURS.
  //
  // `echec` NE VOTE PAS, comme le dit le tableau du §4. `banc_etage1.py`
  // n'écartait que `warmup` et `dropset` : c'était un oubli du banc, arbitré le
  // 11/09/2026, et `v2-atelier/banc/banc_etage1.py` porte la correction.
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
  //
  // ⚠️ ZÉRO N'EST PAS UNE CHARGE, ET IL NE VOTE PAS. `max(0, 0, 0)` vaut 0, la
  // règle de majorité trouve trois séries « à cette charge », et le palier
  // sortait VALIDE À ZÉRO KILO — un plateau sur rien. Aucune ligne de la base
  // ne déclenche ce chemin aujourd'hui (`charge_kg = 0` : zéro ligne sur les
  // 26 132 séries de travail, toutes mesures), mais un import peut en produire
  // à tout moment : un export Hevy écrit `0` là où la base écrit `NULL`.
  //
  // Une charge NÉGATIVE, elle, vote : −20 kg d'assistance est une charge, et
  // elle est plus lourde que −10. 124 séries en base, toutes en `charge_reps`.
  function calculerPalier(series) {
    var liste = series || [];
    if (!liste.length) return null;
    var n = liste.length;
    var requis = Math.min(3, Math.ceil(n / 2));

    var compte = new Map();
    liste.forEach(function (s) {
      var kg = nombre(s.charge_kg);
      if (kg === 0) return;
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
  // ⚠️ LES SÉRIES HORS CHAUFFE — UNE NOTION À PART, PAS LA SÉRIE DE TRAVAIL
  // (consolidation, PR 7). Tout ce qui n'est pas une chauffe : le travail, et
  // AUSSI les dégressives et les échecs. Le Python du §5.1 compte ainsi —
  // contrairement à `analyser`, qui les écarte —, et c'est la référence qui a
  // produit les chiffres de « monte en charge » : on la porte telle quelle.
  // La série de travail (`THModele.estTravail`, PR 6) est une autre notion ;
  // celle-ci ne sert qu'à `etatsExercices`, et son nom ne peut pas la faire
  // passer pour l'autre.
  function seriesHorsChauffe(series) {
    return (series || []).filter(function (s) { return s.type_serie !== CHAUFFE; });
  }

  function etatsExercices(listeSeanceExercices) {
    var stats = new Map();
    (listeSeanceExercices || []).forEach(function (se) {
      var horsChauffe = seriesHorsChauffe(se.series);
      if (horsChauffe.length < 3) return;
      var st = stats.get(se.slug) || { monte: 0, total: 0 };
      st.total += 1;
      var suivantes = horsChauffe.slice(1).map(function (s) { return nombre(s.charge_kg); });
      if (nombre(horsChauffe[0].charge_kg) < Math.max.apply(null, suivantes)) st.monte += 1;
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
  function analyser(seriesBrutes, etatExercice, options) {
    var series = trier(seriesBrutes);
    var roles = new Map();
    var mesure = (options && options.mesure) || null;

    // ⚠️ LA MESURE TRANCHE AVANT TOUT LE RESTE, et elle doit donc être DONNÉE.
    // La déduire des séries — « aucune ne porte de charge » — confondrait une
    // planche avec un développé couché dont personne n'a saisi les kilos
    // (84 séries en base sont dans ce cas). L'appelant a le catalogue ; le
    // moteur ne devine pas la nature d'un exercice à partir d'un jour.
    if (mesure === 'distance_temps') return sortie(series, roles, null, HORS_MOTEUR, []);
    if (MESURES_SANS_CHARGE[mesure]) return sortie(series, roles, null, SANS_CHARGE, []);

    // §4 — le tag prime. Une chauffe taguée est une chauffe, point.
    var travail = [];
    series.forEach(function (s) {
      var tag = roleDuTag(s);
      if (tag) roles.set(s, tag); else travail.push(s);
    });

    if (!travail.length) return sortie(series, roles, null, AUCUNE_SERIE, []);

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
    if (!retenues.length) return sortie(series, roles, null, TOUT_CHAUFFE, []);

    // ── §5.2 / §5.4 — la rampe ne vote pas si l'exercice « monte » ─────────
    // Elle reste une série de travail entière (volume, tonnage, historique) :
    // la seule chose qu'elle ne fait pas, c'est juger le palier du jour.
    //
    // ⚠️ ELLE SE JUGE CONTRE LE PALIER PROVISOIRE, JAMAIS CONTRE LA PLUS LOURDE
    // DES SÉRIES SUIVANTES (§5.2, corrigé le 19/09/2026). La plus lourde peut
    // être une EXPLORATION (§7.5) — une charge tentée une fois, précisément ce
    // que le palier refuse de valider. La prendre pour repère écartait une série
    // tenue AU palier. Couché du 15/09/2026, constaté sur appareil :
    // `125×4, 125×5, 130×3` -> la première était écartée parce que plus légère
    // que 130 ; il ne restait que deux séries, et le §7.2 gardait la plus lourde.
    // « Palier 130 », le jour où 130 n'avait été tenu qu'une fois. C'est 125.
    //
    // PAS DE PALIER PROVISOIRE, PAS DE RAMPE. Sans charge tenue sur la majorité,
    // il n'existe aucun repère contre lequel juger la première série, et on n'en
    // invente pas un. Ce sont les pyramides : le moteur s'y tait, et c'est voulu
    // (§7.3 — le taux de reconnaissance mesuré passe de 93-98 % à 90-92 %, parce
    // que l'ancien chiffre comptait ces faux paliers).
    //
    // UN SEUL CALCUL, DEUX USAGES (`CADRAGE-V2` §2 undecies) : `palierProvisoire`
    // vient de situer la frontière de chauffe du §4.1 juste au-dessus. Le
    // recalculer ici donnerait deux voix au même verdict.
    //
    // ⚠️ `retenues.length >= 2` a été RETIRÉ, pas oublié : la garde est désormais
    // impliquée. `travail[indexPalier]` porte exactement `palierProvisoire` et
    // n'est jamais marqué chauffe probable (celle-ci ne marque que `k <
    // indexPalier`) — il est donc toujours dans `retenues`. Si `retenues` n'avait
    // qu'un élément, ce serait lui, et `< palierProvisoire` serait faux. Une
    // garde qui ne peut pas tomber est morte, et ce fichier en a déjà enterré une
    // (cf. `meilleureSerie`).
    var etat = (etatExercice && etatExercice.etat) || ETAT_INDETERMINE;
    if (etat === ETAT_MONTE && palierProvisoire !== null &&
        nombre(retenues[0].charge_kg) < palierProvisoire) {
      roles.set(retenues[0], 'rampe');
      retenues = retenues.slice(1);
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
    // `retenues` est ici l'ensemble qui VOTE : il comprend les séries que le
    // §7.5 reclassera en exploration juste après. C'est aussi l'ensemble sur
    // lequel se calcule la meilleure série — cf. `meilleureSerie`.
    var votantes = retenues.slice();
    var palier = calculerPalier(retenues);

    // §7.5 — toute série plus lourde que le palier est une EXPLORATION. Elle
    // est conservée et affichée, elle nourrit l'estimation du maximum, mais
    // elle ne valide rien : on a tenté le poids du dessus pour voir.
    retenues.forEach(function (s) {
      if (palier !== null && nombre(s.charge_kg) > palier) roles.set(s, 'exploration');
      else if (!roles.has(s)) roles.set(s, 'travail');
    });

    return sortie(series, roles, palier, null, votantes);
  }

  // ── §9.17 — LE POIDS DU CORPS : UNE CHARGE QUI NE BOUGE PAS ──────────────
  //
  // Un exercice mesuré en `reps` (tractions, dips, pompes, extension du dos,
  // relevés…) n'a pas de charge en base — `charge_kg` y est NULL — et il suit
  // pourtant la consigne des charges, LA CHARGE VALANT 0 : le poids du corps.
  // C'est ce que fait cette fonction : elle rend la même description que
  // `analyser`, avec un palier de 0 et des séries à 0, et c'est ce contrat que
  // `consignePour` lit comme n'importe quel autre (« même fonction, pas une
  // copie »).
  //
  // ⚠️ ELLE N'EST PAS `analyser` AVEC DES ZÉROS, et c'est tout son objet. La
  // chaîne générique juge la chauffe sur la CHARGE (« ≤ 75 % de la plus lourde,
  // avant le palier ») et le palier sur la majorité d'une charge non nulle : à
  // zéro partout, `calculerPalier` rend `null` (« zéro n'est pas une charge »,
  // plus haut), aucune série n'est « au palier » et toutes sortent en chauffe
  // probable (0 ≤ 0,75 × 0). Sans charge, il n'y a ni rampe, ni chauffe
  // probable, ni descente choisie à deviner : seuls les TAGS de la personne
  // écartent une série (chauffe, dégressive, échec), tout le reste est du
  // travail, et le palier est 0 dès qu'une série de travail existe.
  //
  // Les séries rendues sont des COPIES à `charge_kg: 0` : l'entrée n'est jamais
  // modifiée, et rien de ce que cette description produit ne s'écrit en base —
  // une série d'un exercice en `reps` garde sa charge vide (`validerSerie`
  // n'écrit que les champs du gabarit).
  function analyserPoidsDuCorps(seriesBrutes) {
    var zero = (seriesBrutes || []).map(function (s) {
      var copie = {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) copie[k] = s[k];
      copie.charge_kg = 0;
      return copie;
    });
    var series = trier(zero);
    var roles = new Map();
    var travail = [];
    series.forEach(function (s) {
      var tag = roleDuTag(s);
      if (tag) roles.set(s, tag); else travail.push(s);
    });
    if (!travail.length) return sortie(series, roles, null, AUCUNE_SERIE, []);
    travail.forEach(function (s) { roles.set(s, 'travail'); });
    return sortie(series, roles, 0, null, travail);
  }

  // ── §7 bis.5 — LA MEILLEURE SÉRIE ───────────────────────────────────────
  //
  // GRANDEUR DISTINCTE DU PALIER, et les deux sont vraies. Le palier est la
  // charge tenue sur la majorité des séries : c'est la grandeur du moteur, elle
  // décide de la suite. La meilleure série est ce qui a été fait de mieux ce
  // jour-là : c'est ce qu'on lit dans un journal. Ne pas en faire une seule.
  //
  // « La charge la plus lourde tenue sur AU MOINS LA MOITIÉ des reps de la
  // série la plus longue. » Aucune formule.
  //
  // Le garde-fou des reps est tout le mécanisme : il retient une dernière série
  // plus lourde à reps pleines — 127,6 × 10 après trois 122,6 × 10, qui est une
  // performance — et il écarte une exploration à 140 × 1 quand on travaille à
  // 10 reps, qui n'en est pas une.
  //
  // Elle se calcule sur les séries qui ONT VOTÉ pour le palier, explorations
  // comprises : ce sont les séries de travail retenues par le §7, après les
  // exclusions des §4, §4.1, §5 et §6. Une exploration reste une série faite ;
  // c'est le compte de reps qui décide si elle vaut d'être montrée.
  function meilleureSerie(votantes) {
    var liste = votantes || [];
    if (!liste.length) return null;

    var repsMax = null;
    liste.forEach(function (s) {
      var r = nombre(s.reps);
      if (r !== null && (repsMax === null || r > repsMax)) repsMax = r;
    });
    if (repsMax === null) return null;
    var seuil = repsMax / 2;

    var charge = null;
    liste.forEach(function (s) {
      if (nombre(s.reps) < seuil) return;
      var kg = nombre(s.charge_kg);
      if (kg !== null && (charge === null || kg > charge)) charge = kg;
    });
    if (charge === null) return null;

    // À charge égale, les MEILLEURES reps. Pas de second test du seuil ici : la
    // charge vient d'être choisie PARMI les séries qui le passent, donc au moins
    // une série à cette charge le passe, et une série plus courte à la même
    // charge ne peut pas être le maximum. Le banc de mutation l'a montré — le
    // garde-fou qui s'y trouvait était inkillable, donc mort.
    var reps = null;
    liste.forEach(function (s) {
      if (nombre(s.charge_kg) !== charge) return;
      var r = nombre(s.reps);
      if (reps === null || r > reps) reps = r;
    });
    return { charge: charge, reps: reps };
  }

  function sortie(series, roles, palier, erreur, votantes) {
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
      // Deux grandeurs distinctes, jamais fusionnées : `palier`/`reps` pour le
      // moteur, `meilleure` pour le journal.
      meilleure: meilleureSerie(votantes),
      series: decrites, retenues: retenues, votantes: (votantes || []).slice()
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

  // §17.3 — LE RESSENTI, LU SUR LES MÊMES TROIS CRANS (19/09/2026).
  //
  // La saisie v2 pose un ressenti en reps restantes, EXCLUSIF du RPE : une
  // série porte l'un ou l'autre, jamais les deux (`definirEffort`, seance.js).
  // C'est la voie NORMALE, pas un cas de bord — sur 28 768 séries, 288
  // seulement portent un RPE. Un moteur qui ne lit que le RPE lit donc 99 % des
  // séries comme si personne n'y avait mis d'effort.
  //
  // La frontière est la même que celle des bandes du RPE : trois reps en
  // réserve ou plus, c'est un RPE de 7 ou moins, donc `facile` ; « reste 0 » ne
  // laisse plus rien, comme un RPE de 10, donc `max`. Entre les deux, `dur` —
  // et `reste_2` comme `reste_1` y tombent, ce que le RPE distinguerait.
  //
  // ⚠️ LES QUATRE VALEURS SONT NOMMÉES ICI, ET C'EST UNE SECONDE LISTE APRÈS
  // `THSeance.RESSENTIS`. Assumé, et voici pourquoi le §2 undecies ne s'y
  // oppose pas :
  //   · `palier.js` charge AVANT `seance.js` (index.html, 328 puis 331) : il ne
  //     pourrait lire `RESSENTIS` qu'en différé, à l'appel ;
  //   · c'est le SEUL module de la v2 sans aucune dépendance — une seule touche
  //     à `racine`, l'export tout en bas — et c'est ce qui le rend testable
  //     seul. Faire dépendre le moteur du modèle de l'écran de SAISIE
  //     inverserait la flèche : l'écran lit le moteur, pas l'inverse.
  //
  // Ce que le §2 undecies interdit vraiment, ce n'est pas que deux listes
  // existent, c'est qu'elles DÉRIVENT en silence. Un test l'en empêche : chaque
  // valeur de `THSeance.RESSENTIS` doit trouver un cran ici, sinon il tombe.
  var CRAN_DU_RESSENTI = {
    reste_3_plus: 'facile',
    reste_2: 'dur',
    reste_1: 'dur',
    reste_0: 'max'
  };

  // ── LE POINT UNIQUE : une SÉRIE donne un cran ────────────────────────────
  //
  // Tout ce qui a besoin du cran passe par ici — `repsComptees` juste en
  // dessous, et demain le niveau validé (§9.2) et la preuve « effort facile »
  // du réglage Franc (§9.8). Deux lectures de l'effort finiraient par se
  // contredire sur la même série, et c'est exactement la famille de défauts que
  // l'audit v1 a cataloguée.
  //
  // ⚠️ LE RPE L'EMPORTE quand une série porte les deux. Ça ne DOIT pas arriver
  // — `definirEffort` met l'autre à `null` — mais une ligne importée ou une
  // écriture concurrente peut le produire, et le silence serait pire que
  // l'arbitrage. Le RPE gagne parce qu'il est plus précis : il sépare 8 de 9,5
  // là où « reste 2 » et « reste 1 » tombent dans le même cran.
  function cranDeSerie(serie) {
    if (!serie) return null;
    // 152 : « à l'échec » (1 rep et +) = plus rien en réserve, comme `reste_0` — le même cran, la même conséquence (68B).
    if (aEchec(serie)) return 'max';
    var parRPE = cranEffort(serie.rpe);
    if (parRPE !== null) return parRPE;
    // `hasOwnProperty` et pas une lecture directe : `ressenti` vient de la base,
    // et `constructor` ou `__proto__` y rendraient une valeur qui n'est pas un
    // cran. Même garde que `roleDuTag` et `gabaritDe`.
    return Object.prototype.hasOwnProperty.call(CRAN_DU_RESSENTI, serie.ressenti)
      ? CRAN_DU_RESSENTI[serie.ressenti] : null;
  }

  // §17.4, révisé le 11/10/2026 (74) — UNE SÉRIE À FOND COMPTE SES REPS. On
  // n'enlève pas une rep réellement faite : le niveau validé, le test,
  // l'échelle, l'observation d'un pari, le bilan se lisent sur les reps faites.
  // Ce qui empêche une série à fond de faire MONTER la consigne suivante n'est
  // pas ici : ce sont les plafonds de `consigneDExercice` (moteur.js), qui
  // comparent au calcul prudent (`repsPrudentes`, ci-dessous).
  //
  // ⚠️ ELLE PREND LA SÉRIE, ET PLUS `(reps, rpe)` — changé le 19/09/2026. Le
  // cran se lit sur DEUX champs qui s'excluent, et l'arbitrage entre eux (le
  // RPE l'emporte) ne peut se faire qu'en les voyant tous les deux. Deux
  // paramètres positionnels ne le permettaient pas sans en ajouter un
  // troisième — qu'on finirait par passer dans le mauvais ordre, en silence,
  // puisque `nombre()` rend `null` sur tout ce qu'il ne comprend pas. Un objet,
  // une forme, et l'appel ne peut plus se tromper.
  function repsComptees(serie) {
    return nombre(serie && serie.reps);
  }

  // §17.4 (74) — LE CALCUL PRUDENT, la règle de 68B : une série marquée `max`
  // (RPE 10 ou `reste_0`, sans distinction — « plus rien en réserve ») compte
  // une rep de moins. Il ne décide plus seul : le moteur le calcule à côté des
  // reps faites, et ses plafonds s'en servent pour ne pas monter sur une série
  // à fond. ⚠️ C'EST SON SEUL ENDROIT (garde « une notion, un module »).
  function repsPrudentes(serie) {
    var r = nombre(serie && serie.reps);
    if (r === null) return null;
    return cranDeSerie(serie) === 'max' ? r - 1 : r;
  }

  // §9.2 — les deux premières séries atteignent la cible, les suivantes sont
  // tolérées à −1 rep. Les séries 1 et 2 sont les moins fatiguées, donc les plus
  // représentatives de la maîtrise ; au-delà c'est une courbe de fatigue
  // normale, pas un défaut de maîtrise.
  //
  // `series` : [{ reps, rpe }] ou [{ reps, ressenti }], DÉJÀ réduites aux
  // séries au palier (le rang se compte au palier, pas sur l'exercice — §9.2).
  // La règle ne change pas : elle hérite du point unique par `repsComptees`.
  function palierTenu(series, cible) {
    var liste = series || [];
    if (liste.length < 2) return { tenu: false, raison: 'moins de deux séries au palier' };
    var c = nombre(cible);
    for (var i = 0; i < liste.length; i++) {
      var r = repsComptees(liste[i]);
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
    // Les raisons d'une absence, nommées : un appelant qui veut distinguer
    // « par nature » de « cette fois » compare à une constante, pas à un texte.
    SANS_CHARGE: SANS_CHARGE,
    HORS_MOTEUR: HORS_MOTEUR,
    AUCUNE_SERIE: AUCUNE_SERIE,
    TOUT_CHAUFFE: TOUT_CHAUFFE,
    MESURES_SANS_CHARGE: MESURES_SANS_CHARGE,
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
    seriesHorsChauffe: seriesHorsChauffe,
    analyser: analyser,
    analyserPoidsDuCorps: analyserPoidsDuCorps,
    meilleureSerie: meilleureSerie,
    cranEffort: cranEffort,
    // Exportée pour le test anti-dérive SEUL : il l'énumère pour vérifier
    // qu'aucun ressenti du moteur n'a disparu de l'écran. Rien d'autre ne la
    // lit — on passe par `cranDeSerie`, qui arbitre.
    CRAN_DU_RESSENTI: CRAN_DU_RESSENTI,
    cranDeSerie: cranDeSerie,
    repsComptees: repsComptees,
    repsPrudentes: repsPrudentes,
    palierTenu: palierTenu
  };

  racine.THPalier = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
