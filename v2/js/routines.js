// v2/js/routines.js — la bibliothèque de routines, côté PUR.
//
// Tout ce qui décide vit ici : normaliser un nom, valider des bornes, et
// surtout produire le PLAN D'ÉCRITURES d'une routine modifiée. Aucun DOM,
// aucun réseau — c'est testable sans navigateur, et c'est là que sont les
// règles.
//
// ══ LA CONTRAINTE QUI COMMANDE TOUT CE FICHIER ═════════════════════════════
//
//   CREATE UNIQUE INDEX routine_exos_rang_uniq ON routine_exercises (routine_id, rang)
//
// Relevé EN BASE, et **non différable**. Conséquence : on ne peut pas écrire
// les nouveaux rangs dans n'importe quel ordre. Échanger deux voisins en
// écrivant « A prend le rang de B » puis « B prend celui de A » échoue à la
// première écriture — B occupe encore le rang visé. Une permutation se réalise
// en place, dans un ordre calculé, avec un rang TAMPON pour casser les cycles.
//
// C'est exactement ce que fait `planEcritures`, et c'est la seule raison d'être
// de ce module.
//
// ══ CE QUE LA ROUTINE NE PORTE JAMAIS ══════════════════════════════════════
//
//   AUCUNE CHARGE. Pas de kg, pas de poids, nulle part.
//
// Une charge écrite dans une routine est périmée dès qu'on progresse, et c'est
// précisément ce que le moteur sait calculer (ECRAN-SAISIE-V1 §1.1). La liste
// blanche `CHAMPS_EXERCICE` ci-dessous est la garde : rien d'autre ne part en
// base, et un test l'exige explicitement.

(function (racine) {
  'use strict';

  // Bornes relevées sur les CHECK de la base, pas supposées.
  //
  // `routine_exercises` :
  //   routines_nom_court         char_length(nom) entre 1 et 60
  //   routine_exos_repos_borne    repos_cible_s NULL ou 5 à 1800
  //   routine_exos_superset_positif  groupe_superset NULL ou >= 0
  //   routine_exos_rang_positif                 rang >= 0
  //
  // `routine_sets` (`v2_042_routine_sets`) — ⚠️ SES BORNES NE SONT PAS CELLES
  // DE LA TABLE PARENTE, et les confondre donne un 23514 à chaque première
  // série : le rang y commence à **1**, là où celui d'un exercice accepte 0.
  //   routine_sets_rang_positif                 rang >= 1
  //   type_serie          'travail'|'echauffement'|'degressive'|'echec'
  //   reps_visees                          NULL ou 1 à 100
  //   duree_cible_s                        NULL ou 1 à 35999
  //   distance_cible_m                     NULL ou 0 à 100000
  //
  // ⚠️ `routine_exos_series_bornees` (series 1..20) EXISTE ENCORE EN BASE mais
  // ne contraint plus rien ici : la colonne n'est plus écrite depuis le
  // chantier 43 (§7 quindecies), et son défaut vaut pour les lignes anciennes.
  var NOM_MAX = 60;
  var REPS_MIN = 1, REPS_MAX = 100;
  var REPOS_MIN = 5, REPOS_MAX = 1800;

  // ⚠️ LISTE BLANCHE. Ce qui n'y figure pas ne part pas en base. Elle ne
  // contient aucun champ de charge, et c'est le point : la routine porte la
  // structure, le moteur décide du poids.
  //
  // `groupe_superset` et `note` y sont entrés au chantier 28, et il fallait les
  // deux ensemble. Jusque-là ils étaient tenus DEHORS pour que l'éditeur ne
  // puisse pas les écraser avec le `null` de son brouillon — une protection par
  // omission. Elle ne tient plus dès que l'éditeur doit ÉCRIRE le groupement :
  // la protection est maintenant que le brouillon les TRANSPORTE (`brouillonDe`,
  // app.js). Omettre l'un des deux aurait remplacé une garde par un effacement.
  // ⚠️ `series` ET `reps_visees` EN SONT SORTIES (chantier 43). Depuis
  // `v2_042_routine_sets`, la structure est une LIGNE PAR SÉRIE : les deux
  // entiers disaient la même chose sous une forme plus pauvre, et deux sources
  // pour une même information sont ce que `CADRAGE-V2` §2 undecies interdit.
  // Les colonnes restent en base le temps de la conversion — ce code ne les
  // touche plus, ni en lecture ni en écriture.
  var CHAMPS_EXERCICE = ['routine_id', 'exercise_slug', 'rang',
                         'repos_cible_s', 'groupe_superset', 'note'];

  // Le miroir de `sets`. Mêmes quatre types, et `rang` commence à 1 — pas à 0
  // comme celui de `routine_exercises`. Relevé sur les CHECK, pas supposé.
  var CHAMPS_SERIE = ['routine_exercise_id', 'user_id', 'rang', 'type_serie',
                      'reps_visees', 'charge_cible_kg', 'duree_cible_s', 'distance_cible_m'];
  var TYPES_SERIE = ['travail', 'echauffement', 'degressive', 'echec'];
  var DUREE_MIN = 1, DUREE_MAX = 35999;
  var DISTANCE_MIN = 0, DISTANCE_MAX = 100000;

  // ── Le nom ──────────────────────────────────────────────────────────────
  //
  // L'index d'unicité est `lower(btrim(nom))` : « Push », « push » et « Push  »
  // sont le MÊME nom pour la base. On normalise donc pareil pour prévenir avant
  // l'aller-retour — mais la base reste l'autorité, et l'erreur 23505 est
  // rattrapée quand même (deux appareils peuvent créer le même nom en même
  // temps, et aucune vérification locale ne couvre ça).
  function normaliserNom(nom) {
    return String(nom === null || nom === undefined ? '' : nom).trim().toLowerCase();
  }

  // Ce qui part en base : le nom TEL QUE TAPÉ, aux espaces de bord près. La
  // casse de l'utilisateur est la sienne ; seule la comparaison est repliée.
  function nomPropre(nom) {
    return String(nom === null || nom === undefined ? '' : nom).trim();
  }

  function nomValide(nom) {
    var n = nomPropre(nom);
    return n.length >= 1 && n.length <= NOM_MAX;
  }

  // Conflit détecté LOCALEMENT, sur la liste déjà chargée. `saufId` permet de
  // renommer une routine sans qu'elle se heurte à elle-même.
  function nomEnConflit(nom, routines, saufId) {
    var cible = normaliserNom(nom);
    if (!cible) return false;
    return (routines || []).some(function (r) {
      if (!r || r.archivee_a) return false;          // une archivée ne bloque plus
      if (saufId && r.id === saufId) return false;
      return normaliserNom(r.nom) === cible;
    });
  }

  // ── Les nombres ─────────────────────────────────────────────────────────
  //
  // `null` veut dire « non renseigné » et c'est une valeur VALIDE pour les reps
  // visées comme pour le repos. Une valeur inventée serait pire qu'une absence :
  // elle se lirait comme une prescription.
  function entierOuNul(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) return undefined;   // ni vide ni entier
    return n;
  }

  function borne(v, min, max) {
    var n = entierOuNul(v);
    if (n === undefined) return { ok: false, valeur: null };
    if (n === null) return { ok: true, valeur: null };
    return { ok: n >= min && n <= max, valeur: n };
  }

  function repsValides(v) { return borne(v, REPS_MIN, REPS_MAX); }
  function reposValide(v) { return borne(v, REPOS_MIN, REPOS_MAX); }

  // ⚠️ NORMALISER, C'EST BORNER — PAS SEULEMENT CONVERTIR (chantier 36, D5).
  //
  // `borne` rend `{ok, valeur}` : `valeur` est la valeur LUE, hors bornes
  // comprise. `valider()` regarde `ok` — mais `valider()` n'est appelée QUE par
  // l'éditeur. Le report de fin de séance, lui, passe droit : il prenait
  // `valeur` et l'envoyait telle quelle, et la base répondait `23514`, code
  // DÉFINITIF — l'entrée devenait la tête de file et bloquait tout ce qui suit,
  // pour toujours. Posée APRÈS la séance, rien n'était perdu sur le coup : le
  // blocage ne se voyait que les jours suivants.
  //
  // LA RÈGLE : on ANNULE ce qui peut être absent. `reps_visees`, `repos_cible_s`
  // et les trois autres cibles acceptent NULL, et NULL veut dire « non
  // renseigné » — plus honnête qu'une valeur inventée par un cap.
  //
  // ⚠️ IL N'Y A PLUS DE CAS « BORNER PLUTÔT QU'ANNULER » (chantier 43).
  // C'était `series`, NOT NULL, dont la seule issue était de revenir dans la
  // plage. La colonne n'est plus écrite : `serieBornee` et `seriesValides` sont
  // parties avec elle, plutôt que de rester en entonnoir que plus rien ne
  // traverse (leçon de `palier.js`, chantier 17).
  function nulSiHorsBornes(r) { return r && r.ok ? r.valeur : null; }

  // Un nombre facultatif, borné, qui accepte les décimales : `charge_cible_kg`
  // et `distance_cible_m` sont `numeric`, pas des entiers.
  function decimalOuNul(v, min, max) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n) || n < min || n > max) return null;
    return n;
  }

  // ══ UNE SÉRIE PROGRAMMÉE — LES DEUX VOCABULAIRES D'UNE MÊME LIGNE ═════
  //
  // ⚠️ UNE SEULE TABLE, ET ELLE SERT DANS LES DEUX SENS.
  //
  // L'éditeur de routine EST l'écran de séance (§7 quindecies) : ses lignes
  // portent donc les noms de la SAISIE — `reps`, `charge_kg`, `duree_s`,
  // `distance_m` — ceux que `Modele.champDeMesure` nomme et que
  // `rangeeDeSerie` lit. `routine_sets`, elle, porte les noms de la CIBLE.
  //
  // Deux vocabulaires pour la même ligne, et deux traversées : la base vers
  // l'écran (`enSaisie`) et l'écran vers la base (`normaliserSerie`). Les
  // écrire séparément, c'était garantir qu'un jour l'une gagne une colonne que
  // l'autre n'a pas — et qu'une valeur saisie disparaisse à l'enregistrement
  // sans que rien ne le signale. Ici elles ne peuvent pas diverger.
  //
  // `borner` dit AUSSI comment chaque colonne se borne, parce que c'est la
  // même connaissance : `reps_visees` est entière et 1..100, `charge_cible_kg`
  // décimale et 0..1000. Une colonne de plus s'ajoute à un seul endroit.
  var CIBLES = [
    { saisie: 'reps', cible: 'reps_visees',
      borner: function (v) { return repsEcrites(v); } },
    { saisie: 'charge_kg', cible: 'charge_cible_kg',
      borner: function (v) { return decimalOuNul(v, 0, 1000); } },
    { saisie: 'duree_s', cible: 'duree_cible_s',
      borner: function (v) { return nulSiHorsBornes(borne(v, DUREE_MIN, DUREE_MAX)); } },
    { saisie: 'distance_m', cible: 'distance_cible_m',
      borner: function (v) { return decimalOuNul(v, DISTANCE_MIN, DISTANCE_MAX); } }
  ];

  function typePropre(t) { return TYPES_SERIE.indexOf(t) >= 0 ? t : 'travail'; }

  // La base vers l'écran. La ligne rendue est une ligne de SAISIE : c'est
  // `rangeeDeSerie` qui la lira, et elle ne connaît que ces noms-là.
  //
  // `note`, `rpe`, `ressenti`, `validee_a` n'existent pas dans `routine_sets` —
  // une routine ne porte aucune trace d'exécution. On les pose à `null` plutôt
  // que de les omettre : la rangée les lit, et une propriété absente et une
  // propriété nulle ne se comportent pas pareil au rendu.
  function enSaisie(set) {
    var ligne = {
      id: (set && set.id) || null,
      type_serie: typePropre(set && set.type_serie),
      note: null, rpe: null, ressenti: null, validee_a: null
    };
    CIBLES.forEach(function (c) {
      var v = set ? set[c.cible] : null;
      ligne[c.saisie] = (v === undefined) ? null : v;
    });
    return ligne;
  }

  // ⚠️ `rang` COMMENCE À 1. `routine_sets_rang_unique` porte `rang >= 1`, là où
  // `routine_exercises.rang` accepte 0 : les deux tables ne comptent pas pareil,
  // et les confondre donnerait un 23514 à chaque première série.
  //
  // ⚠️ LA CHARGE CIBLE EST FACULTATIVE ET NE PRIME JAMAIS (§7 quindecies.3).
  // La routine dit la structure, le moteur dit les charges. On l'écrit si elle
  // est là, on ne l'invente jamais.
  function normaliserSerie(s, routineExerciceId, rang, userId) {
    var l = {
      routine_exercise_id: routineExerciceId,
      user_id: userId || null,
      rang: rang,
      type_serie: typePropre(s && s.type_serie)
    };
    CIBLES.forEach(function (c) { l[c.cible] = c.borner(s ? s[c.saisie] : null); });
    return l;
  }

  // Les lignes à écrire pour UN exercice, dans l'ordre de la liste. Le rang est
  // la POSITION, comme pour les exercices : il ne se saisit pas.
  //
  // ⚠️ UNE ENTRÉE DE FILE POSÉE AVANT LE CHANTIER 43 PORTE UN ENTIER.
  //
  // Le report de fin de séance pose son intention SUR DISQUE, et elle peut y
  // dormir des jours — une mise à jour de l'app la retrouve telle quelle. Avant
  // ce chantier, `voulues[].series` était le NOMBRE de séries ; depuis, c'est la
  // liste. Sur une forme ancienne, on rend `null` : l'appelant ne touche alors
  // PAS aux séries programmées de cet exercice.
  //
  // C'est le choix conservateur, et c'est le bon : traiter l'entier comme une
  // liste vide effacerait la structure d'une routine à la première vidange, et
  // lever bloquerait la file définitivement — les deux pires issues possibles
  // pour une entrée qu'on ne peut plus corriger.
  function seriesEcrites(exo, routineExerciceId, userId) {
    var liste = exo && exo.series;
    if (!Array.isArray(liste)) return null;
    return liste.map(function (s, i) {
      return normaliserSerie(s, routineExerciceId, i + 1, userId);
    });
  }

  // ⚠️ CE QUI SERA ÉCRIT, NOMMÉ UNE FOIS. `normaliserExercice` composait ces
  // deux expressions et l'écran en composait d'autres : la carte pouvait donc
  // afficher un nombre que la base ne recevrait jamais. C'est le défaut trouvé
  // par la mutation M7 au chantier 41, sur les séries ; les deux colonnes
  // NULLABLES tombent dans le même piège, et pour la même raison.
  //
  // Une valeur hors bornes rend `null` — PAS le plafond : `reps_visees` et
  // `repos_cible_s` acceptent NULL, et « non renseigné » est plus honnête
  // qu'un nombre que personne n'a saisi. `series`, elle, est NOT NULL : c'est
  // pour ça, et seulement pour ça, que `serieBornee` ramène dans la plage.
  function repsEcrites(v) { return nulSiHorsBornes(repsValides(v)); }
  function reposEcrit(v) { return nulSiHorsBornes(reposValide(v)); }

  // Valide une routine complète avant écriture. Rend la liste des problèmes,
  // pas un booléen : l'écran doit pouvoir dire LEQUEL est en cause.
  function valider(brouillon, routines) {
    var b = brouillon || {};
    var soucis = [];
    if (!nomValide(b.nom)) {
      soucis.push({ champ: 'nom', raison: nomPropre(b.nom) ? 'trop-long' : 'vide' });
    } else if (nomEnConflit(b.nom, routines, b.id)) {
      soucis.push({ champ: 'nom', raison: 'doublon' });
    }
    (b.exercices || []).forEach(function (e, i) {
      if (!e || !e.exercise_slug) soucis.push({ champ: 'exercice', rang: i, raison: 'sans-exercice' });
      if (!reposValide(e && e.repos_cible_s).ok) soucis.push({ champ: 'repos_cible_s', rang: i, raison: 'hors-bornes' });
      // ⚠️ UN EXERCICE SANS AUCUNE SÉRIE N'EST PAS UNE STRUCTURE (chantier 43).
      // L'ancien modèle l'interdisait par construction — `series` était bornée à
      // 1 minimum. Avec une ligne par série, la liste peut se vider : on le
      // refuse ici, sinon la routine démarrerait une séance sans rien à faire.
      //
      // ⚠️ ET ON NE JUGE QUE CE QU'ON VOIT. Une forme ANCIENNE — `series` entier,
      // posée en file avant ce chantier — n'est pas une liste vide : c'est une
      // liste qu'on ne connaît pas. `seriesEcrites` ne touche alors à rien, et
      // refuser ici prétendrait savoir qu'il n'y a aucune série. Les deux
      // fonctions tiennent le même raisonnement, sur le même test.
      var lignes = (e && e.series);
      if (Array.isArray(lignes)) {
        if (!lignes.length) soucis.push({ champ: 'series', rang: i, raison: 'aucune-serie' });
        lignes.forEach(function (ligne, j) {
          if (!repsValides(ligne && ligne.reps).ok) {
            soucis.push({ champ: 'reps_visees', rang: i, serie: j, raison: 'hors-bornes' });
          }
        });
      }
    });
    return { valide: soucis.length === 0, soucis: soucis };
  }

  // ── Le plan d'écritures ─────────────────────────────────────────────────
  //
  // `existantes` : ce qu'il y a en base, avec leurs `id` et leurs `rang`.
  // `voulues`    : l'ordre voulu. La POSITION dans le tableau est le rang cible.
  //                Une entrée sans `id` est une ligne à créer.
  //
  // Rend { suppressions, majs, insertions } où **`majs` est ordonnée** : la
  // suivre dans l'ordre ne heurte jamais l'index unique.
  //
  // L'ordre d'exécution est imposé : suppressions, puis majs, puis insertions.
  // Les suppressions libèrent des rangs dont les majs ont besoin ; les majs
  // libèrent ceux que les insertions occupent.
  // ⚠️ LE PLAN PORTE AUSSI LES SÉRIES PROGRAMMÉES, ET ELLES NE DANSENT PAS.
  //
  // `routine_exos_rang_uniq` est NON différable : c'est toute la raison d'être
  // d'`ordonnerDeplacements` ci-dessous. `routine_sets_rang_unique` est
  // DIFFÉRABLE, et rien ne référence l'identifiant d'une série programmée — une
  // séance en copie la structure, jamais les identifiants. On remplace donc les
  // lignes d'un exercice en bloc, ce qui est exact et idempotent, plutôt que
  // d'écrire une seconde permutation pour une contrainte qui n'en demande pas.
  //
  // ⚠️ ET L'EXERCICE PORTE SON IDENTIFIANT AVANT L'ÉCRITURE. `routine_exercises.id`
  // a `gen_random_uuid()` en défaut : l'app peut donc fabriquer le sien, ce que
  // le report de fin de séance fait déjà. Sans ça, les séries d'un exercice
  // NEUF n'auraient pas de parent à viser tant que l'insertion n'a pas répondu.
  function planEcritures(existantes, voulues, routineId, userId) {
    var avant = existantes || [];
    var apres = voulues || [];

    var parId = {};
    avant.forEach(function (l) { if (l && l.id) parId[l.id] = l; });

    var gardes = {};
    apres.forEach(function (v) { if (v && v.id) gardes[v.id] = true; });

    var suppressions = avant
      .filter(function (l) { return l && l.id && !gardes[l.id]; })
      .map(function (l) { return l.id; });

    var insertions = [];
    var majsChamps = [];     // changements hors rang — aucun ordre imposé
    var aDeplacer = [];      // { id, cible }
    var occupe = {};         // rang -> id, pour les lignes CONSERVÉES seulement
    var maxRang = -1;

    avant.forEach(function (l) {
      if (!l || !l.id || !gardes[l.id]) return;      // les supprimées libèrent leur rang
      occupe[l.rang] = l.id;
      if (l.rang > maxRang) maxRang = l.rang;
    });

    apres.forEach(function (v, cible) {
      if (cible > maxRang) maxRang = cible;
      if (!v) return;
      var champs = normaliserExercice(v, routineId, cible);
      if (!v.id || !parId[v.id]) { insertions.push(champs); return; }

      var vieux = parId[v.id];
      var change = {};
      ['repos_cible_s', 'exercise_slug',
       'groupe_superset', 'note'].forEach(function (c) {
        // `vieux` vient de la base, où une colonne vide vaut NULL ; `champs` est
        // normalisé pareil. On compare donc deux formes identiques, et non
        // `undefined` contre `null` — qui différeraient à chaque tour.
        var avant = vieux[c] === undefined ? null : vieux[c];
        if (champs[c] !== avant) change[c] = champs[c];
      });
      if (Object.keys(change).length) majsChamps.push({ id: v.id, champs: change });
      if (vieux.rang !== cible) aDeplacer.push({ id: v.id, cible: cible });
    });

    // Les séries de CHAQUE exercice conservé ou créé, dans l'ordre de la liste.
    // Celles d'un exercice supprimé partent par la cascade de sa clé étrangère.
    // ⚠️ ON N'ÉCRIT QUE CE QUI CHANGE, ICI AUSSI.
    //
    // `majsChamps` ne porte déjà que les colonnes modifiées : un exercice
    // intact ne produit aucune écriture. Les séries doivent suivre la même
    // règle, sinon le report de fin de séance REMPLACE les lignes de TOUS les
    // exercices à chaque fois — six suppressions et six insertions pour n'avoir
    // rien changé, et « Reporter écrit les écarts, et RIEN d'autre » cesse
    // d'être vrai. Défaut vu au banc de séance, pas en test.
    //
    // La comparaison porte sur la forme NORMALISÉE des deux côtés : même
    // fonction, même ordre de clés, donc `JSON.stringify` suffit et ne peut pas
    // se tromper sur un `undefined` contre un `null`. Faute d'existantes
    // lisibles (`series` absente de la ligne d'avant), on réécrit — c'est le
    // choix sûr, jamais le silencieux.
    var series = apres.filter(Boolean).map(function (v) {
      var id = v.id || null;
      var lignes = seriesEcrites(v, id, userId);
      if (!id || lignes === null) return null;
      var avant = seriesEcrites(parId[v.id], id, userId);
      if (avant !== null && JSON.stringify(avant) === JSON.stringify(lignes)) return null;
      return { id: id, lignes: lignes };
    }).filter(Boolean);

    return {
      suppressions: suppressions,
      majs: majsChamps.concat(ordonnerDeplacements(aDeplacer, occupe, maxRang)),
      insertions: insertions,
      series: series
    };
  }

  // Réalise la permutation EN PLACE, sans jamais viser un rang encore occupé.
  //
  // À chaque tour : on place une ligne dont le rang cible est libre. S'il n'y en
  // a aucune, c'est qu'il ne reste que des cycles — on en casse un en envoyant
  // une ligne sur un rang TAMPON (au-dessus de tout ce qui existe, donc libre),
  // ce qui libère son ancien rang et débloque le tour suivant.
  //
  // Terminaison : chaque tour place définitivement une ligne ou casse un cycle,
  // et un cycle cassé place une ligne au tour suivant. Deux fois le nombre de
  // lignes majore le nombre de tours ; la borne ci-dessous est un filet, pas
  // une limite attendue.
  function ordonnerDeplacements(aDeplacer, occupe, maxRang) {
    var reste = (aDeplacer || []).slice();
    var places = Object.assign({}, occupe || {});
    var ou = {};   // id -> rang actuel, mis à jour au fur et à mesure
    Object.keys(places).forEach(function (r) { ou[places[r]] = Number(r); });

    var tampon = (typeof maxRang === 'number' ? maxRang : -1) + 1;
    var ecritures = [];
    var filet = reste.length * 2 + 2;

    while (reste.length && filet-- > 0) {
      var i = trouverLibre(reste, places);
      if (i < 0) {
        // Que des cycles : on en sort une par le tampon. Sa cible reste à faire,
        // elle repassera par la boucle une fois son ancien rang libéré.
        var bloquee = reste[0];
        deplacer(bloquee.id, tampon);
        tampon++;
        continue;
      }
      var choisie = reste.splice(i, 1)[0];
      deplacer(choisie.id, choisie.cible);
    }

    function deplacer(id, rang) {
      var actuel = ou[id];
      if (actuel !== undefined) delete places[actuel];
      places[rang] = id;
      ou[id] = rang;
      ecritures.push({ id: id, champs: { rang: rang } });
    }

    return ecritures;
  }

  function trouverLibre(reste, places) {
    for (var i = 0; i < reste.length; i++) {
      if (places[reste[i].cible] === undefined) return i;
    }
    return -1;
  }

  // Une ligne prête pour la base : rien d'autre que la liste blanche, et les
  // valeurs déjà bornées. `routine_id` est omis quand il n'est pas connu — une
  // mise à jour ne le renvoie pas.
  function normaliserExercice(e, routineId, rang) {
    var o = {
      exercise_slug: (e && e.exercise_slug) || null,
      rang: rang,
      repos_cible_s: reposEcrit(e && e.repos_cible_s),
      groupe_superset: groupeValide(e && e.groupe_superset),
      note: texteOuNul(e && e.note)
    };
    if (routineId) o.routine_id = routineId;
    // ⚠️ L'IDENTIFIANT, QUAND L'APPELANT EN FOURNIT UN. `routine_exercises.id`
    // a `gen_random_uuid()` en défaut : l'app peut donc fabriquer le sien, et
    // c'est ce qui rend le report de fin de séance IDEMPOTENT — rejoué, il
    // retrouve la ligne au lieu d'en insérer une seconde.
    //
    // ⚠️ L'ÉDITEUR EN FOURNIT UN DEPUIS LE CHANTIER 43, et il le DOIT : les
    // séries programmées visent leur exercice par clé étrangère, donc un
    // exercice créé sans identifiant connu d'avance ne pourrait pas emporter sa
    // structure dans le même passage.
    if (e && e.id) o.id = e.id;
    return o;
  }

  // `routine_exos_superset_positif` : NULL ou >= 0. Relevé sur le CHECK de la
  // base, pas supposé — comme les autres bornes de ce fichier.
  function groupeValide(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n || n < 0) return null;
    return n;
  }

  function texteOuNul(v) {
    if (v === null || v === undefined) return null;
    var t = String(v).trim();
    return t ? t : null;
  }

  // ══ LE GROUPEMENT DANS L'ÉDITEUR (chantier 28) ═══════════════════════════
  //
  // Un superset est une suite CONTIGUË : `THModele.memeBloc` compare des lignes
  // voisines. Dans une liste, la seule chose qui définit un groupe est donc
  // « untel est collé au suivant » — un LIEN entre deux voisins.
  //
  // C'est aussi ce qui rend le geste juste ici : l'éditeur est une liste où l'on
  // range librement, et un lien entre voisins se pose d'un seul appui. Le mode
  // sélection du §5.7 existe pour la SÉANCE, où les blocs sont loin les uns des
  // autres et où l'on ne veut pas réordonner pour grouper.
  //
  // ⚠️ Les numéros de groupe ne sont jamais saisis ni conservés : ils se
  // recalculent depuis les liens, comme les étiquettes A1/B1 se recalculent
  // depuis les blocs (§2.4).
  function liens(exercices) {
    var l = [];
    var liste = exercices || [];
    for (var i = 0; i + 1 < liste.length; i++) {
      var a = liste[i].groupe_superset, b = liste[i + 1].groupe_superset;
      l.push(a !== null && a !== undefined && a === b);
    }
    return l;
  }

  function appliquerLiens(exercices, l) {
    var liste = (exercices || []).map(function (e) { return Object.assign({}, e); });
    var n = 0, i = 0;
    while (i < liste.length) {
      var j = i;
      while (j + 1 < liste.length && l[j]) j++;
      var groupe = (j > i) ? ++n : null;
      for (var k = i; k <= j; k++) liste[k].groupe_superset = groupe;
      i = j + 1;
    }
    return liste;
  }

  // Bascule le lien entre `i` et `i+1`, et renumérote tout derrière.
  function basculerLien(exercices, i) {
    var l = liens(exercices);
    if (i < 0 || i >= l.length) return (exercices || []).slice();
    l[i] = !l[i];
    return appliquerLiens(exercices, l);
  }

  // ⚠️ DÉGROUPER S'ÉCRIT AVEC LES LIENS, PAS À CÔTÉ D'EUX. Sortir l'exercice
  // `i` de son groupe, c'est couper les DEUX liens qui l'y tenaient — celui de
  // gauche et celui de droite. Rien d'autre à faire : `appliquerLiens`
  // renumérote, et un groupe qui tombe à un seul exercice se dissout de
  // lui-même (§7 decies — il n'existe pas de superset à un).
  //
  // C'est le pendant de `THSeance.degrouperExercice` côté routine, et il n'en
  // recopie pas la logique : ici un groupe EST une suite de liens.
  function degrouper(exercices, i) {
    var l = liens(exercices);
    if (i > 0) l[i - 1] = false;
    if (i < l.length) l[i] = false;
    return appliquerLiens(exercices, l);
  }

  // Ce que le menu a le droit de proposer, lu sur les mêmes liens. Sans ça,
  // l'écran redéciderait tout seul ce qu'est un groupe.
  function estGroupe(exercices, i) {
    var l = liens(exercices);
    return (i > 0 && l[i - 1] === true) || (i < l.length && l[i] === true);
  }

  function peutGrouper(exercices, i) {
    var l = liens(exercices);
    return i < l.length && l[i] !== true;
  }

  // Remet les numéros d'aplomb après un déplacement ou un retrait : les liens se
  // relisent de la NOUVELLE adjacence. Déplacer un exercice au milieu d'un
  // superset le coupe donc en deux, et le sortir le dégroupe — ce qui est
  // exactement ce que montre la liste, à l'endroit où on vient de le lâcher.
  function renumeroter(exercices) {
    return appliquerLiens(exercices, liens(exercices));
  }

  // ── Appliquer un plan d'écritures ───────────────────────────────────────
  //
  // ⚠️ L'ORDRE EST IMPOSÉ : suppressions, puis majs, puis insertions. Les
  // suppressions libèrent des rangs dont les majs ont besoin ; les majs libèrent
  // ceux que les insertions occupent. Extrait d'`enregistrer` au chantier 28
  // pour que le report de fin de séance passe par le MÊME chemin — deux façons
  // d'écrire une routine, c'était deux façons de se tromper.
  // ⚠️ `onEcrit` est signalé APRÈS CHAQUE ÉTAPE RÉUSSIE, et pas au retour. Une
  // écriture qui casse au milieu a quand même touché la base : l'appelant doit
  // pouvoir le dire (« enregistrement incomplet ») plutôt que laisser croire
  // que rien n'est parti. C'est ce que le retour seul perdait.
  async function appliquerPlan(plan, ecrivain, onEcrit) {
    var dit = onEcrit || function () {};
    var ecrit = false;
    var marquer = function () { ecrit = true; dit(); };
    if (plan.suppressions.length) { await ecrivain.supprimerExercices(plan.suppressions); marquer(); }
    for (var i = 0; i < plan.majs.length; i++) {
      await ecrivain.majExercice(plan.majs[i].id, plan.majs[i].champs);
      marquer();
    }
    if (plan.insertions.length) { await ecrivain.insererExercices(plan.insertions); marquer(); }
    // ⚠️ LES SÉRIES EN DERNIER, et pas par goût de l'ordre : leur clé étrangère
    // vise `routine_exercises`, qui doit donc exister. Un plan ancien n'en porte
    // pas — une entrée de file posée avant le chantier 43 se rejoue alors sans
    // rien casser, ce qui est exactement ce qu'on veut d'une file qui survit à
    // une mise à jour de l'app.
    var series = plan.series || [];
    for (var k = 0; k < series.length; k++) {
      await ecrivain.remplacerSeriesRoutine(series[k].id, series[k].lignes);
      marquer();
    }
    return ecrit;
  }

  // ── L'aperçu de la liste ────────────────────────────────────────────────
  //
  // « 6 exercices · 21 séries ».
  //
  // ⚠️ « 3 SÉRIES × 8 REPS » N'A PLUS DE SENS (chantier 43) : depuis
  // `v2_042_routine_sets`, les lignes ne sont plus identiques — une routine
  // porte des chauffes, des dégressives et des reps qui varient d'une ligne à
  // l'autre. On annonce donc ce qui se compte : les séries de TRAVAIL.
  //
  // ⚠️ ET PLUS LES CHAUFFES (§7 septendecies.1, chantier 44). Le chantier 43
  // les disait à part — « + 5 de chauffe » — pour lever une ambiguïté de
  // compte. Le détail est inutile dans un résumé : il se voit en ouvrant la
  // routine. `nbChauffes` est parti avec son seul lecteur, plutôt que de rester
  // un champ calculé que personne ne lit (leçon de C1, chantier 39).
  //
  // ⚠️ ET C'EST LE MÊME COMPTE QUE PARTOUT AILLEURS. `THSemaine.compteSeriesTravail`
  // (chantier 39) répond déjà à « combien de séries de travail », la règle du
  // volume comprise — un tapis programmé ne compte pas plus qu'un tapis fait.
  // En écrire un second pour les routines, c'est la maladie du §2 undecies.
  //
  // Les séries programmées ne portent pas leur slug — il vit sur l'exercice
  // parent. On le leur prête ici, le temps du comptage.
  function apercu(exercices, catalogue) {
    var liste = exercices || [];
    var plat = [];
    liste.forEach(function (e) {
      ((e && e.series) || []).forEach(function (s) {
        plat.push({ type_serie: (s && s.type_serie) || 'travail',
                    exercise_slug: e && e.exercise_slug });
      });
    });
    return {
      nbExercices: liste.length,
      nbSeries: racine.THSemaine.compteSeriesTravail(plat, catalogue)
    };
  }

  // ══ LE BROUILLON LOCAL (§7 octodecies) ══════════════════════════════════
  //
  // ⚠️ DEUX QUESTIONS DIFFÉRENTES, DEUX FONCTIONS. « Y a-t-il un brouillon à
  // signaler ? » n'est pas « ce brouillon est-il celui de CETTE routine ? » —
  // la bibliothèque pose la première, l'éditeur la seconde, et les confondre
  // ferait soit disparaître le bandeau, soit déverser le brouillon de Y dans
  // l'éditeur de X.
  //
  // Un enregistrement local vaut `{ modifie_a, nom, brouillon }`. On ne fait
  // confiance à rien : il vient du disque, il a pu être écrit par une version
  // précédente de l'app, et une forme inattendue ne doit pas casser l'écran.
  function brouillonValide(local) {
    return !!(local && local.brouillon && Array.isArray(local.brouillon.exercices));
  }

  // Ce que la bibliothèque signale. `null` quand il n'y a rien à dire.
  function brouillonASignaler(local) {
    if (!brouillonValide(local)) return null;
    return {
      id: local.brouillon.id || null,
      nom: nomPropre(local.nom) || nomPropre(local.brouillon.nom) || '',
      modifie_a: local.modifie_a || null,
      nbExercices: local.brouillon.exercices.length
    };
  }

  // ⚠️ `id` DOIT CORRESPONDRE, `null` COMPRIS. Une routine neuve porte `null`,
  // et deux routines neuves ne se distinguent pas — c'est voulu : il n'y a
  // qu'un brouillon à la fois, et c'est celui d'une création si son `id` est
  // nul. `undefined` et `null` sont ramenés l'un sur l'autre, sinon un appelant
  // qui passe l'un ne retrouverait jamais ce que l'autre a écrit.
  function brouillonReprenable(local, id) {
    if (!brouillonValide(local)) return null;
    var voulu = (id === undefined || id === '') ? null : id;
    var sien = local.brouillon.id === undefined ? null : local.brouillon.id;
    return sien === voulu ? local.brouillon : null;
  }

  // Les routines de la bibliothèque, dans un ordre stable. Le tri est par nom
  // replié — c'est la seule clé que l'utilisateur voit et contrôle ; trier par
  // date de création ferait bouger la liste sans raison lisible.
  //
  // ⚠️ `archivee_a` NE CACHE PLUS RIEN (§7 duodecies.1). L'archivage est
  // supprimé : plus rien n'écrit la colonne, et une routine archivée par erreur
  // n'avait AUCUN chemin de retour depuis l'app — il a fallu une écriture en
  // base le 13/09. Les deux routines qui la portent encore reviennent donc dans
  // la liste, où elles peuvent enfin être supprimées.
  //
  // ⚠️ MAIS `nomEnConflit` CONTINUE DE L'HONORER, et ce n'est pas une seconde
  // lecture de la même règle : `routines_user_nom_actif_uniq` est un index
  // PARTIEL (`WHERE archivee_a IS NULL`). Une archivée ne réserve réellement
  // pas son nom, et refuser localement ce que la base accepte bloquerait un
  // enregistrement pour rien. Deux questions, deux réponses, une seule colonne.
  function visibles(routines) {
    return (routines || [])
      .filter(function (r) { return !!r; })
      .sort(function (a, b) { return normaliserNom(a.nom).localeCompare(normaliserNom(b.nom), 'fr'); });
  }

  // Recherche dans le catalogue : 237 entrées, des noms longs, des accents.
  // On replie les accents des deux côtés — « developpe » doit trouver
  // « Développé ». Sans ça la recherche ne sert à rien sur un clavier pressé.
  function replier(txt) {
    return String(txt === null || txt === undefined ? '' : txt)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function chercher(exercices, requete, limite) {
    var q = replier(requete);
    var max = limite || 30;
    var liste = (exercices || []).filter(function (e) { return e && e.slug; });
    if (!q) return liste.slice(0, max);
    var mots = q.split(/\s+/).filter(Boolean);
    return liste
      .map(function (e) {
        var nom = replier(e.nom || e.slug);
        // Tous les mots doivent apparaître : « couche halt » trouve
        // « Développé Couché Haltères » sans ramener tous les développés.
        if (!mots.every(function (m) { return nom.indexOf(m) >= 0; })) return null;
        // Un nom qui COMMENCE par la requête passe devant : c'est presque
        // toujours celui qu'on visait.
        return { exo: e, score: nom.indexOf(mots[0]) === 0 ? 0 : 1, nom: nom };
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.score - b.score || a.nom.localeCompare(b.nom, 'fr'); })
      .slice(0, max)
      .map(function (r) { return r.exo; });
  }

  // ── L'enregistrement, séquencé ──────────────────────────────────────────
  //
  // `ecrivain` est injecté : en production c'est `THDonnees`, au banc c'est un
  // écrivain de papier. Toute la séquence se teste donc sans réseau, y compris
  // le cas qui compte le plus — celui où une écriture échoue au milieu.
  //
  // L'ORDRE N'EST PAS NÉGOCIABLE : suppressions, puis mises à jour, puis
  // insertions. Les suppressions libèrent des rangs dont les mises à jour ont
  // besoin ; les mises à jour libèrent ceux que les insertions vont occuper.
  // Inverser, c'est heurter `routine_exos_rang_uniq`.
  async function enregistrer(brouillon, ecrivain, contexte) {
    var b = brouillon || {};
    var ctx = contexte || {};
    var nom = nomPropre(b.nom);
    var creation = !b.id;
    var routine = null;
    var ecrit = false;   // quelque chose a-t-il atteint la base ?

    try {
      if (creation) {
        // `user_id` est obligatoire et sans défaut : sans lui, le WITH CHECK
        // de la policy refuse la ligne.
        routine = await ecrivain.creerRoutine({ user_id: ctx.userId, nom: nom });
        ecrit = true;
      } else {
        routine = { id: b.id, nom: nom };
        if (b.nomChange) { routine = await ecrivain.majRoutine(b.id, { nom: nom }); ecrit = true; }
      }
    } catch (e) {
      // Rien n'est parti : le brouillon est intact à l'écran, on ne perd rien.
      return { ok: false, erreur: classerErreur(e), brut: e, etape: 'routine', partiel: false };
    }

    // Sans identifiant, les exercices partiraient avec `routine_id: undefined`
    // et se feraient refuser par un NOT NULL, loin de la cause. On le dit ici.
    if (!routine || !routine.id) {
      return { ok: false, erreur: 'inconnue', etape: 'routine', partiel: creation };
    }

    // ⚠️ UN EXERCICE NEUF PORTE SON IDENTIFIANT AVANT D'ÊTRE ÉCRIT.
    // `routine_exercises.id` a `gen_random_uuid()` en défaut, donc l'app peut
    // fabriquer le sien — et elle DOIT, parce que les séries programmées visent
    // leur parent par clé étrangère : sans identifiant connu d'avance, la
    // structure d'un exercice créé ne pourrait pas être écrite dans le même
    // passage.
    //
    // Sans fabricant, on lÈVE plutôt que d'écrire un exercice sans ses séries :
    // une dépendance manquante doit casser bruyamment, pas rendre une routine
    // à moitié enregistrée (même doctrine qu'au chantier 40).
    var voulues = (b.exercices || []).map(function (e) {
      if (e && e.id) return e;
      if (typeof ctx.uuid !== 'function') {
        throw new Error('THRoutines.enregistrer : `uuid` est requis pour un exercice neuf.');
      }
      return Object.assign({}, e, { id: ctx.uuid() });
    });

    var plan = planEcritures(b.existantes, voulues, routine.id, ctx.userId);

    try {
      await appliquerPlan(plan, ecrivain, function () { ecrit = true; });
    } catch (e) {
      // Une CRÉATION qui échoue ici laisserait une routine vide — et son nom
      // pris pour rien, puisque l'unicité porte sur les non archivées. On défait.
      // Si le défaire échoue aussi, on le DIT : une routine fantôme qu'on
      // passerait sous silence serait pire que le message.
      if (creation) {
        try { await ecrivain.supprimerRoutine(routine.id); return { ok: false, erreur: classerErreur(e), brut: e, etape: 'exercices', partiel: false }; }
        catch (e2) { return { ok: false, erreur: classerErreur(e), brut: e, etape: 'exercices', partiel: true, orpheline: routine.id }; }
      }
      return { ok: false, erreur: classerErreur(e), brut: e, etape: 'exercices', partiel: ecrit };
    }

    return { ok: true, routine: routine, plan: plan };
  }

  // Traduire une erreur Postgres en cause, jamais en texte brut à l'écran.
  //
  // ⚠️ 23505 ne veut PAS dire « nom en double » à lui seul : c'est aussi ce que
  // rend une collision de rang. Confondre les deux masquerait un défaut du plan
  // d'écritures derrière un message rassurant sur le nom. On regarde donc quelle
  // contrainte a sauté.
  function classerErreur(e) {
    if (!e) return 'inconnue';
    var code = e.code || '';
    var texte = String(e.message || '') + ' ' + String(e.details || '');
    if (code === '23505') {
      if (/routine_exos_rang_uniq/.test(texte)) return 'collision-rang';
      return 'doublon';
    }
    if (code === '42501' || /row-level security/i.test(texte)) return 'refuse';
    if (/fetch|network|Failed to fetch|NetworkError/i.test(texte)) return 'reseau';
    return 'inconnue';
  }

  // Le message montré, par cause. « Rien n'est perdu » est dit explicitement
  // quand c'est vrai : c'est la première question que se pose quelqu'un dont
  // l'enregistrement vient d'échouer.
  var MESSAGES = {
    'doublon': 'Tu as déjà une routine de ce nom.',
    'collision-rang': 'Conflit d\u2019ordre à l\u2019enregistrement.',
    'refuse': 'Écriture refusée par le serveur.',
    'reseau': 'Pas de réseau : rien n\u2019a été enregistré.',
    'inconnue': 'Enregistrement impossible.'
  };

  function messageErreur(resultat) {
    var r = resultat || {};
    var base = MESSAGES[r.erreur] || MESSAGES.inconnue;
    if (r.partiel) return base + ' L\u2019enregistrement est incomplet : rouvre la routine pour voir ce qui est passé.';
    if (r.erreur === 'reseau') return base;
    return base + ' Rien n\u2019est perdu, tu peux réessayer.';
  }

  var api = {
    NOM_MAX: NOM_MAX,
    REPS_MIN: REPS_MIN, REPS_MAX: REPS_MAX,
    REPOS_MIN: REPOS_MIN, REPOS_MAX: REPOS_MAX,
    CHAMPS_EXERCICE: CHAMPS_EXERCICE,
    normaliserNom: normaliserNom,
    nomPropre: nomPropre,
    nomValide: nomValide,
    nomEnConflit: nomEnConflit,
    nulSiHorsBornes: nulSiHorsBornes,
    repsEcrites: repsEcrites,
    reposEcrit: reposEcrit,
    repsValides: repsValides,
    reposValide: reposValide,
    valider: valider,
    planEcritures: planEcritures,
    appliquerPlan: appliquerPlan,
    normaliserExercice: normaliserExercice,
    normaliserSerie: normaliserSerie,
    enSaisie: enSaisie,
    seriesEcrites: seriesEcrites,
    TYPES_SERIE: TYPES_SERIE,
    CHAMPS_SERIE: CHAMPS_SERIE,
    liens: liens,
    appliquerLiens: appliquerLiens,
    basculerLien: basculerLien,
    degrouper: degrouper,
    estGroupe: estGroupe,
    peutGrouper: peutGrouper,
    renumeroter: renumeroter,
    apercu: apercu,
    enregistrer: enregistrer,
    classerErreur: classerErreur,
    messageErreur: messageErreur,
    MESSAGES: MESSAGES,
    brouillonASignaler: brouillonASignaler,
    brouillonReprenable: brouillonReprenable,
    visibles: visibles,
    replier: replier,
    chercher: chercher
  };

  racine.THRoutines = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
