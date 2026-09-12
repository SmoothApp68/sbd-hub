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

  // Bornes relevées sur les CHECK de la base, pas supposées :
  //   routines_nom_court         char_length(nom) entre 1 et 60
  //   routine_exos_series_bornees        series entre 1 et 20
  //   routine_exos_reps_bornees     reps_visees NULL ou 1 à 100
  //   routine_exos_repos_borne    repos_cible_s NULL ou 5 à 1800
  var NOM_MAX = 60;
  var SERIES_MIN = 1, SERIES_MAX = 20;
  var REPS_MIN = 1, REPS_MAX = 100;
  var REPOS_MIN = 5, REPOS_MAX = 1800;

  // Le défaut de la colonne `series` en base. On le reprend tel quel plutôt que
  // d'en choisir un : ce n'est pas une valeur inventée ici, c'est celle qui
  // s'appliquerait si on n'envoyait rien.
  var SERIES_DEFAUT = 3;

  // ⚠️ LISTE BLANCHE. Ce qui n'y figure pas ne part pas en base. Elle ne
  // contient aucun champ de charge, et c'est le point : la routine porte la
  // structure, le moteur décide du poids.
  var CHAMPS_EXERCICE = ['routine_id', 'exercise_slug', 'rang', 'series',
                         'reps_visees', 'repos_cible_s'];

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

  function seriesValides(v) {
    var n = entierOuNul(v);
    if (n === undefined || n === null) return { ok: false, valeur: SERIES_DEFAUT };
    return { ok: n >= SERIES_MIN && n <= SERIES_MAX, valeur: n };
  }

  function repsValides(v) { return borne(v, REPS_MIN, REPS_MAX); }
  function reposValide(v) { return borne(v, REPOS_MIN, REPOS_MAX); }

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
      if (!seriesValides(e && e.series).ok) soucis.push({ champ: 'series', rang: i, raison: 'hors-bornes' });
      if (!repsValides(e && e.reps_visees).ok) soucis.push({ champ: 'reps_visees', rang: i, raison: 'hors-bornes' });
      if (!reposValide(e && e.repos_cible_s).ok) soucis.push({ champ: 'repos_cible_s', rang: i, raison: 'hors-bornes' });
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
  function planEcritures(existantes, voulues, routineId) {
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
      ['series', 'reps_visees', 'repos_cible_s', 'exercise_slug'].forEach(function (c) {
        if (champs[c] !== vieux[c]) change[c] = champs[c];
      });
      if (Object.keys(change).length) majsChamps.push({ id: v.id, champs: change });
      if (vieux.rang !== cible) aDeplacer.push({ id: v.id, cible: cible });
    });

    return {
      suppressions: suppressions,
      majs: majsChamps.concat(ordonnerDeplacements(aDeplacer, occupe, maxRang)),
      insertions: insertions
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
      series: seriesValides(e && e.series).valeur,
      reps_visees: repsValides(e && e.reps_visees).valeur,
      repos_cible_s: reposValide(e && e.repos_cible_s).valeur
    };
    if (routineId) o.routine_id = routineId;
    return o;
  }

  // ── L'aperçu de la liste ────────────────────────────────────────────────
  //
  // « 4 exercices · 13 séries ». Le total de séries est la somme des `series`,
  // pas le nombre de lignes : c'est ce que la séance durera, et c'est ce que la
  // routine PRESCRIT — pas un comptage de lignes.
  function apercu(exercices) {
    var liste = exercices || [];
    var series = liste.reduce(function (n, e) {
      return n + (seriesValides(e && e.series).valeur || 0);
    }, 0);
    return { nbExercices: liste.length, nbSeries: series };
  }

  // Les routines visibles : non archivées, dans un ordre stable. Le tri est par
  // nom replié — c'est la seule clé que l'utilisateur voit et contrôle ; trier
  // par date de création ferait bouger la liste sans raison lisible.
  function visibles(routines) {
    return (routines || [])
      .filter(function (r) { return r && !r.archivee_a; })
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

    var plan = planEcritures(b.existantes, b.exercices, routine.id);

    try {
      if (plan.suppressions.length) { await ecrivain.supprimerExercices(plan.suppressions); ecrit = true; }
      for (var i = 0; i < plan.majs.length; i++) {
        await ecrivain.majExercice(plan.majs[i].id, plan.majs[i].champs);
        ecrit = true;
      }
      if (plan.insertions.length) { await ecrivain.insererExercices(plan.insertions); ecrit = true; }
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
    SERIES_MIN: SERIES_MIN, SERIES_MAX: SERIES_MAX, SERIES_DEFAUT: SERIES_DEFAUT,
    REPS_MIN: REPS_MIN, REPS_MAX: REPS_MAX,
    REPOS_MIN: REPOS_MIN, REPOS_MAX: REPOS_MAX,
    CHAMPS_EXERCICE: CHAMPS_EXERCICE,
    normaliserNom: normaliserNom,
    nomPropre: nomPropre,
    nomValide: nomValide,
    nomEnConflit: nomEnConflit,
    seriesValides: seriesValides,
    repsValides: repsValides,
    reposValide: reposValide,
    valider: valider,
    planEcritures: planEcritures,
    normaliserExercice: normaliserExercice,
    apercu: apercu,
    enregistrer: enregistrer,
    classerErreur: classerErreur,
    messageErreur: messageErreur,
    MESSAGES: MESSAGES,
    visibles: visibles,
    replier: replier,
    chercher: chercher
  };

  racine.THRoutines = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
