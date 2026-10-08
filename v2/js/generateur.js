// v2/js/generateur.js — le programme construit (« Construis-le-moi »), côté PUR.
//
// QUESTIONNAIRE-COACH-V2 §5 bis (60-4). Ce module choisit des EXERCICES, leur ORDRE, des SÉRIES de travail et des
// REPS visées — rien d'autre. Aucun DOM, aucun réseau, aucune écriture : c'est testable sans navigateur, et les
// règles vivent ici et nulle part ailleurs (MOTEUR §9.13 bis : un seul coach, un seul câblage).
//
// ══ CE QU'IL NE DÉCIDE JAMAIS ══════════════════════════════════════════════
//
//   · une CHARGE   — le coach la propose séance par séance (« Première fois ici », MOTEUR §9.21) ;
//   · une CHAUFFE  — le coach les propose (MOTEUR §9.15.2) ;
//   · un REPOS     — le chemin de « Créer la routine » les donne (ECRAN-SAISIE §7 quindecies.4) ;
//   · une DURÉE    — la durée visée passe APRÈS, par la fonction de « J'ai peu de temps » (MOTEUR §9.18).
//
// ══ CE QU'IL LIT, ET D'OÙ ══════════════════════════════════════════════════
//
//   · le matériel   — la table de 60-1 (`THProfil.equipementsDe`), jamais recopiée ;
//   · les zones     — le radar (`THSemaine.ZONES`) : « Poitrine », « Dos »… sont ses libellés, dans son ordre ;
//   · l'historique  — un fait (`THFaits`), passé en entrée : `faits` = { slug : séances sur 12 semaines } ;
//   · le catalogue  — celui que l'app a déjà chargé : { slug : { equipement, muscles_primaires, muscles_secondaires } }.
//
// La référence est `tests/unit/fixtures/gen60.py` (Claude.ai, 08/10/2026) ; ses cas, `cas-60-4-generateur.json`,
// sont rejoués à l'identique par `tests/unit/v2-generateur.test.js`. Un cas qui semble faux se rapporte : il ne se
// corrige pas ici en silence.

(function (racine) {
  'use strict';

  // ── Les motifs : des candidats, dans l'ordre par défaut ────────────────────
  var MOTIFS = {
    squat: ['squat_barre', 'hack_squat_machine', 'belt_squat_machine', 'split_squat_bulgare', 'squat_poids_du_corps'],
    presse: ['presse_a_cuisses', 'split_squat_bulgare', 'step_up_haltere', 'step_up'],
    charniere: ['souleve_de_terre_barre', 'souleve_de_terre_barre_hex', 'souleve_de_terre_haltere'],
    jambes_tendues: ['souleve_de_terre_roumain_barre', 'souleve_de_terre_roumain_haltere'],
    hip_thrust: ['hip_thrust_barre', 'hip_thrust_machine', 'hip_thrust_une_jambe_haltere'],
    leg_curl: ['leg_curl_assis', 'leg_curl_allonge_machine', 'souleve_de_terre_roumain_haltere'],
    quad_iso: ['extension_jambes', 'step_up_haltere', 'step_up'],
    mollets: ['extension_mollets_debout_machine', 'extension_mollets_assis'],
    abdos: ['releve_de_genoux_suspendu', 'crunch_poulie', 'crunch'],
    couche: ['developpe_couche_barre', 'developpe_couche_haltere', 'chest_press_machine', 'pompes'],
    incline: ['developpe_couche_incline_haltere', 'developpe_couche_incline_barre', 'chest_press_incline_machine',
              'pompes_declinees'],
    militaire: ['developpe_militaire_barre', 'developpe_militaire_haltere', 'presse_epaules_assis_machine', 'pompes_pic'],
    tirage_vertical: ['tractions', 'tirage_poitrine_poulie', 'tirage_poitrine_machine', 'tirage_vertical_elastique'],
    rowing: ['rowing_poulie_assis', 'rowing_penche_barre', 'rowing_haltere', 'rowing_assis_machine',
             'rowing_incline_poitrine_haltere', 'rowing_elastique', 'rowing_inverse'],
    elev_lat: ['elevation_laterale_poulie', 'elevation_laterale_haltere'],
    arriere: ['tirage_vers_visage', 'oiseau_haltere'],
    curl: ['curl_biceps_barre_ez', 'curl_biceps_haltere', 'curl_marteau_haltere'],
    triceps: ['extension_triceps_poulie_haute', 'extension_des_triceps_au_dessus_de_la_tete_cable',
              'extension_triceps_haltere', 'pompes_diamant'],
    ecarte: ['ecarte_machine', 'ecartes_poulie', 'ecarte_haltere']
  };

  // Rien de faisable dans un motif : son voisin (même muscle, autre angle).
  var VOISIN = { tirage_vertical: 'rowing', rowing: 'tirage_vertical', quad_iso: 'presse', leg_curl: 'jambes_tendues',
                 incline: 'couche', couche: 'incline', ecarte: 'incline' };

  // +3 reps en isolation : les petits muscles se travaillent long.
  var PETITS = ['elev_lat', 'arriere', 'mollets', 'abdos'];

  // ── Les gabarits, par nombre de jours : [nom, [[motif, rôle]]] ───────────────
  // P principal · S secondaire · I isolation · T tronc.
  var H_A = ['Haut A', [['couche', 'P'], ['tirage_vertical', 'S'], ['incline', 'S'], ['rowing', 'S'], ['elev_lat', 'I'],
                        ['triceps', 'I'], ['ecarte', 'I']]];
  var B_A = ['Bas A', [['squat', 'P'], ['jambes_tendues', 'S'], ['quad_iso', 'I'], ['leg_curl', 'I'], ['mollets', 'I'],
                       ['abdos', 'T']]];
  var H_B = ['Haut B', [['militaire', 'P'], ['rowing', 'S'], ['couche', 'S'], ['tirage_vertical', 'S'], ['arriere', 'I'],
                        ['elev_lat', 'I'], ['curl', 'I']]];
  var B_B = ['Bas B', [['charniere', 'P'], ['presse', 'S'], ['hip_thrust', 'S'], ['leg_curl', 'I'], ['mollets', 'I'],
                       ['abdos', 'T']]];
  var GABARITS = {
    2: [['Corps entier A', [['squat', 'P'], ['couche', 'P'], ['rowing', 'S'], ['jambes_tendues', 'S'], ['elev_lat', 'I'],
                            ['abdos', 'T']]],
        ['Corps entier B', [['charniere', 'P'], ['militaire', 'P'], ['tirage_vertical', 'S'], ['presse', 'S'],
                            ['curl', 'I'], ['triceps', 'I']]]],
    3: [['Corps entier A', [['squat', 'P'], ['couche', 'P'], ['rowing', 'S'], ['leg_curl', 'I'], ['elev_lat', 'I'],
                            ['abdos', 'T']]],
        ['Corps entier B', [['charniere', 'P'], ['militaire', 'P'], ['tirage_vertical', 'S'], ['presse', 'S'],
                            ['curl', 'I'], ['mollets', 'I']]],
        ['Corps entier C', [['hip_thrust', 'S'], ['incline', 'S'], ['rowing', 'S'], ['quad_iso', 'I'], ['triceps', 'I'],
                            ['ecarte', 'I']]]],
    4: [H_A, B_A, H_B, B_B],
    5: [H_A, B_A, H_B, B_B, ['Haut du corps', [['incline', 'S'], ['rowing', 'S'], ['elev_lat', 'I'], ['ecarte', 'I'],
                                               ['curl', 'I'], ['triceps', 'I']]]],
    6: [['Poussée A', [['couche', 'P'], ['militaire', 'S'], ['incline', 'S'], ['elev_lat', 'I'], ['triceps', 'I']]],
        ['Tirage A', [['tirage_vertical', 'P'], ['rowing', 'S'], ['arriere', 'I'], ['curl', 'I'], ['abdos', 'T']]],
        ['Jambes A', [['squat', 'P'], ['jambes_tendues', 'S'], ['quad_iso', 'I'], ['leg_curl', 'I'], ['mollets', 'I']]],
        ['Poussée B', [['militaire', 'P'], ['incline', 'S'], ['couche', 'S'], ['elev_lat', 'I'], ['triceps', 'I']]],
        ['Tirage B', [['rowing', 'P'], ['tirage_vertical', 'S'], ['arriere', 'I'], ['curl', 'I'], ['abdos', 'T']]],
        ['Jambes B', [['charniere', 'P'], ['presse', 'S'], ['hip_thrust', 'S'], ['leg_curl', 'I'], ['mollets', 'I']]]]
  };

  var JOURS_MIN = 2, JOURS_MAX = 6, JOURS_DEFAUT = 3;

  // Les exercices qui demandent une barre fixe : la maison minimale n'en a pas.
  var BARRE_FIXE = ['tractions', 'rowing_inverse'];

  // Les deux élastiques passent avant tout au poids du corps (décidé le 08/10/2026, question 3).
  var ELASTIQUES = ['rowing_elastique', 'tirage_vertical_elastique'];

  // ── La zone à ménager (décidé le 08/10/2026, question 1) ─────────────────────
  // Une place dont le motif charge la zone GARDE son exercice et toutes ses séries, SANS série lourde.
  var CHARGE_ZONE = {
    genou: ['squat', 'presse', 'quad_iso'],
    dos: ['charniere', 'jambes_tendues', 'squat', 'rowing'],
    epaule: ['militaire', 'couche', 'elev_lat'],
    coude: ['triceps', 'curl'],
    hanche: ['hip_thrust', 'squat', 'charniere']
  };

  // La variante plus tolérée, seulement les cas évidents : le dos prend le belt squat (la charge est à la ceinture),
  // la barre hexagonale (Swinton 2011 : moins de contrainte lombaire), le rowing poitrine appuyée. Ailleurs, seule
  // la charge baisse.
  var DOUX = {
    dos: { charniere: 'souleve_de_terre_barre_hex', squat: 'belt_squat_machine', rowing: 'rowing_incline_poitrine_haltere' }
  };

  // ── Les reps visées, par objectif et rôle (principal, secondaire, isolation) ──
  // Sans objectif (ou un objectif que cette table ne connaît pas), celles de « Muscle ».
  var REPS = { force: [5, 7, 12], les_deux: [5, 9, 12], muscle: [7, 9, 12], forme: [9, 12, 15] };
  var REPS_DEFAUT = [7, 9, 12];

  // Une charnière ne dépasse JAMAIS 8 reps : la fatigue défait la technique.
  var CHARNIERE_MAX = 8;

  var ROLES = 'PSIT';

  // La zone d'un exercice sans muscle connu n'est pas rattachée au hasard : elle tombe dans une zone À PART, visible
  // (la règle du radar, semaine.js `ZONE_INCONNUE`).
  var ZONE_INCONNUE = { cle: 'hors-zone', libelle: 'Hors zone' };

  // ── Petits outils ──────────────────────────────────────────────────────────
  function possede(o, cle) { return Object.prototype.hasOwnProperty.call(o || {}, cle); }
  function contient(liste, x) { return (liste || []).indexOf(x) >= 0; }
  function liste(x) { return Object.prototype.toString.call(x) === '[object Array]' ? x : []; }

  function bornerJours(jours) {
    if (jours === null || jours === undefined || jours === '') return JOURS_DEFAUT;
    var n = Math.floor(Number(jours));
    if (!isFinite(n)) return JOURS_DEFAUT;
    return Math.max(JOURS_MIN, Math.min(JOURS_MAX, n));
  }

  // Un tri STABLE (Array.prototype.sort ne l'a pas garanti partout) : à clés égales, l'ordre d'entrée reste.
  function trier(elements, comparer) {
    return elements.map(function (e, i) { return { e: e, i: i }; })
      .sort(function (x, y) { return comparer(x.e, y.e) || x.i - y.i; })
      .map(function (x) { return x.e; });
  }

  function seriesDe(role, objectif) {
    if (role === 'P') return (objectif === 'force' || objectif === 'les_deux') ? 4 : 3;
    return role === 'T' ? 2 : 3;
  }

  // ── Ce que le matériel permet ───────────────────────────────────────────────
  // LA TABLE EST CELLE DE 60-1 (`Profil.equipementsDe`) : lue ici, jamais recopiée. `null` : tout le matériel (Salle
  // complète, ou « pas renseigné »).
  function faisable(catalogue, materiel, faits) {
    var autorises = racine.THProfil.equipementsDe(materiel);
    // La maison minimale n'a pas de barre fixe : ni tractions, ni rowing inversé (elle a ses rowings aux haltères).
    var sansBarreFixe = materiel === 'maison_minimal';
    return function (slug) {
      if (!possede(catalogue, slug)) return false;          // absent du catalogue de la personne : la place l'ignore
      if (possede(faits, slug)) return true;                // un exercice déjà fait n'est jamais rétrogradé (60-1)
      if (sansBarreFixe && contient(BARRE_FIXE, slug)) return false;
      return autorises === null || contient(autorises, catalogue[slug].equipement);
    };
  }

  // ── Une place : l'exercice choisi, ou rien (la place saute) ──────────────────
  // Le motif ; sinon son voisin ; sinon un exercice déjà pris (plutôt qu'un muscle sans travail). Tri : la variante
  // plus tolérée d'une zone à ménager, puis l'HISTORIQUE (le plus fait d'abord), puis l'élastique d'abord au poids du
  // corps, puis l'ordre du motif.
  function choisir(motif, ok, ecartes, pris, menager, faits, materiel) {
    function candidats(src, sansPris) {
      return src.filter(function (s) {
        return !contient(ecartes, s) && ok(s) && !(sansPris && possede(pris, s));
      });
    }
    var src = MOTIFS[motif];
    var cand = candidats(src, true);
    if (!cand.length && possede(VOISIN, motif)) {
      src = MOTIFS[VOISIN[motif]];
      cand = candidats(src, true);
    }
    if (!cand.length) {
      src = MOTIFS[motif];
      cand = candidats(src, false);
    }
    if (!cand.length) return null;
    var doux = null;
    liste(menager).some(function (z) {
      if (possede(DOUX, z) && possede(DOUX[z], motif)) { doux = DOUX[z][motif]; return true; }
      return false;
    });
    var corps = materiel === 'poids_du_corps';
    var tries = trier(cand, function (x, y) {
      function cle(s) {
        return [s !== doux ? 1 : 0, -(possede(faits, s) ? Number(faits[s]) || 0 : 0),
                corps && contient(ELASTIQUES, s) ? 0 : 1, src.indexOf(s)];
      }
      var kx = cle(x), ky = cle(y);
      for (var i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] < ky[i] ? -1 : 1;
      return 0;
    });
    return tries[0];
  }

  // ── Une ligne : séries et reps de la place ──────────────────────────────────
  function zoneDe(muscle) { return racine.THSemaine.zoneDuMuscle(muscle); }

  function ligne(catalogue, slug, motif, role, p) {
    var objectif = p.objectif, phase = p.phase;
    var priorites = liste(p.priorites), menager = liste(p.menager);
    var r = possede(REPS, objectif) ? REPS[objectif] : REPS_DEFAUT;
    var fiche = catalogue[slug];
    var barre = fiche.equipement === 'barre';
    // Lourd seulement à la barre : un principal hors barre prend les reps d'un secondaire.
    var reps = (role === 'P' ? (barre ? r[0] : r[1]) : role === 'S' ? r[1] : r[2]) +
      (contient(PETITS, motif) && (role === 'I' || role === 'T') ? 3 : 0);
    var n = seriesDe(role, objectif);
    var prioEx = contient(priorites, slug);
    // Un muscle prioritaire : sur un secondaire ou une isolation, hors sèche (un exercice prioritaire l'est toujours).
    var prioMu = phase !== 'seche' && liste(fiche.muscles_primaires).some(function (m) {
      var z = zoneDe(m);
      return !!z && contient(priorites, z.cle);
    });
    if (prioEx || (prioMu && (role === 'S' || role === 'I'))) n += 1;
    var menage = menager.some(function (z) { return possede(CHARGE_ZONE, z) && contient(CHARGE_ZONE[z], motif); });
    if (menage && role === 'P') reps = r[1];               // pas de série lourde ; toutes les séries gardées
    if (motif === 'charniere') reps = Math.min(reps, CHARNIERE_MAX);
    return { exercise_slug: slug, motif: motif, role: role, series: n, reps: reps,
             prioritaire: prioEx, menage: menage, barre_fixe: contient(BARRE_FIXE, slug) };
  }

  // ── Le programme ────────────────────────────────────────────────────────────
  // `entree` : { jours, objectif, phase, materiel, priorites, menager, ecartes, faits }. Rend des routines
  // { nom, exercices: [{ exercise_slug, motif, role, series, reps, prioritaire, menage, barre_fixe }] }.
  function generer(catalogue, entree) {
    var p = entree || {};
    var faits = p.faits || {};
    var ecartes = liste(p.ecartes);
    var ok = faisable(catalogue, p.materiel, faits);
    var gabarit = GABARITS[bornerJours(p.jours)];
    // Les principaux de la semaine d'abord (ils prennent la barre), puis les secondaires, puis le reste ; un exercice
    // n'est pris qu'une fois dans la semaine tant qu'il y a le choix.
    var places = [];
    gabarit.forEach(function (rt, r) {
      rt[1].forEach(function (pl, j) { places.push({ r: r, j: j, motif: pl[0], role: pl[1] }); });
    });
    places = trier(places, function (x, y) {
      return ROLES.indexOf(x.role) - ROLES.indexOf(y.role) || x.r - y.r || x.j - y.j;
    });
    var pris = {}, choix = {};
    places.forEach(function (pl) {
      var s = choisir(pl.motif, ok, ecartes, pris, p.menager, faits, p.materiel);
      if (s) { choix[pl.r + '-' + pl.j] = s; pris[s] = true; }
    });
    return gabarit.map(function (rt, r) {
      var ex = [];
      rt[1].forEach(function (pl, j) {
        var s = choix[r + '-' + j];
        if (s) ex.push(ligne(catalogue, s, pl[0], pl[1], p));
      });
      // Stable : l'exercice prioritaire d'abord, puis par rôle.
      ex = trier(ex, function (x, y) {
        return (x.prioritaire ? 0 : 1) - (y.prioritaire ? 0 : 1) || ROLES.indexOf(x.role) - ROLES.indexOf(y.role);
      });
      return { nom: rt[0], exercices: ex };
    });
  }

  // ── « Je n'en veux pas » ──────────────────────────────────────────────────────
  // SEULE la place touchée change (regénérer tout ferait cascader les choix, mesuré le 08/10/2026). Le suivant du
  // même motif (sinon le voisin, sinon un déjà pris), en évitant ce qui est déjà dans CETTE séance ; les séries
  // restent celles de la place (la personne a pu les changer) ; l'exercice rejoint les écartés. Rien au catalogue : la
  // place disparaît. Rend { routines, ecartes } ; rien n'est modifié en place.
  function neVeuxPas(catalogue, routines, entree, r, k) {
    var p = entree || {};
    var nouveau = liste(routines).map(function (rt) {
      return { nom: rt.nom, exercices: liste(rt.exercices).map(function (x) {
        var c = {}; Object.keys(x).forEach(function (cle) { c[cle] = x[cle]; }); return c;
      }) };
    });
    var ecartes = liste(p.ecartes).slice();
    var vieux = nouveau[r] && nouveau[r].exercices[k];
    if (!vieux) return { routines: nouveau, ecartes: ecartes };
    if (!contient(ecartes, vieux.exercise_slug)) ecartes.push(vieux.exercise_slug);
    var faits = p.faits || {};
    var pris = {};
    nouveau[r].exercices.forEach(function (x) { pris[x.exercise_slug] = true; });
    var s = choisir(vieux.motif, faisable(catalogue, p.materiel, faits), ecartes, pris, p.menager, faits, p.materiel);
    if (s === null) {
      nouveau[r].exercices.splice(k, 1);                    // rien au catalogue : la place disparaît
    } else {
      var neuve = ligne(catalogue, s, vieux.motif, vieux.role, p);
      neuve.series = vieux.series;
      if (vieux.raccourcie) neuve.raccourcie = true;                // la place a perdu des séries pour tenir la durée
      nouveau[r].exercices[k] = neuve;
    }
    return { routines: nouveau, ecartes: ecartes };
  }

  // Le motif d'un exercice : `prefere` s'il en est un candidat, sinon le premier de la table qui le contient, sinon `null`
  // (un exercice hors de tout motif ne charge aucune zone et n'a pas de reps de tronc ou de petit muscle).
  function motifDe(slug, prefere) {
    if (prefere && possede(MOTIFS, prefere) && contient(MOTIFS[prefere], slug)) return prefere;
    var trouve = null;
    Object.keys(MOTIFS).some(function (m) { if (contient(MOTIFS[m], slug)) { trouve = m; return true; } return false; });
    return trouve;
  }

  // ── « Remplacer » dans l'aperçu ──────────────────────────────────────────────────
  // La personne choisit elle-même l'exercice (un frère de la feuille, ou le catalogue) : SEULE la place touchée change,
  // comme pour « Je n'en veux pas » — le motif, le rôle et les séries de la place restent, les reps suivent le nouvel
  // exercice (lourd seulement à la barre). Rien ne s'écarte. Rend les routines ; rien n'est modifié en place.
  function remplacePar(catalogue, routines, entree, r, k, slug) {
    var p = entree || {};
    var nouveau = liste(routines).map(function (rt) {
      return { nom: rt.nom, exercices: liste(rt.exercices).map(function (x) {
        var c = {}; Object.keys(x).forEach(function (cle) { c[cle] = x[cle]; }); return c;
      }) };
    });
    var vieux = nouveau[r] && nouveau[r].exercices[k];
    if (!vieux || !possede(catalogue, slug)) return nouveau;
    // Le MOTIF suit l'exercice choisi (la zone à ménager se lit sur ce que l'exercice charge, pas sur la place qu'il
    // prend) : celui de la place si l'exercice en est un candidat, sinon le premier motif qui le contient, sinon aucun.
    var neuve = ligne(catalogue, slug, motifDe(slug, vieux.motif), vieux.role, p);
    neuve.series = vieux.series;
    if (vieux.raccourcie) neuve.raccourcie = true;
    nouveau[r].exercices[k] = neuve;
    return nouveau;
  }

  // ── La ligne « pourquoi » ──────────────────────────────────────────────────────
  // Les séries par zone du radar, chaque exercice compté dans la zone de son PREMIER muscle principal, la plus grosse
  // d'abord, à égalité l'ordre du radar : « Poitrine 10 · Dos 6 · Bras 3 · Épaules 3 séries ».
  function pourquoi(catalogue, routine) {
    var zones = racine.THSemaine.ZONES;
    var g = {}, ordre = {};
    zones.forEach(function (z, i) { ordre[z.cle] = i; });
    ordre[ZONE_INCONNUE.cle] = zones.length;
    var libelles = {};
    zones.forEach(function (z) { libelles[z.cle] = z.libelle; });
    libelles[ZONE_INCONNUE.cle] = ZONE_INCONNUE.libelle;
    liste(routine && routine.exercices).forEach(function (x) {
      var fiche = catalogue[x.exercise_slug];
      var z = fiche ? zoneDe(liste(fiche.muscles_primaires)[0]) : null;
      var cle = z ? z.cle : ZONE_INCONNUE.cle;
      g[cle] = (g[cle] || 0) + x.series;
    });
    var cles = trier(Object.keys(g), function (x, y) { return (g[y] - g[x]) || (ordre[x] - ordre[y]); });
    if (!cles.length) return '';
    return cles.map(function (cle) { return libelles[cle] + ' ' + g[cle]; }).join(' · ') + ' séries';
  }

  // ── Ce que le coach DIT de l'aperçu (QUESTIONNAIRE §5 bis) ───────────────────────
  // Des phrases, pas des décisions : l'écran les pose telles quelles. `nommer(slug)` donne le nom de l'exercice
  // (celui de l'app, `THModele.nommer`) ; `entree` est celle qui a construit le programme.
  var POSSESSIF = { epaule: 'ton épaule', dos: 'ton dos', genou: 'ton genou', coude: 'ton coude', hanche: 'ta hanche' };
  // Les salles ont une barre fixe (R3, 60-5) ; ailleurs — maison équipée, maison minimale, poids du corps, matériel
  // non renseigné — « maison équipée » ne la garantit pas. La condition est l'EXERCICE présent (`barre_fixe`), jamais
  // l'étiquette du matériel : celle-ci ne fait que dire où la phrase ne se dit pas.
  var SALLES = ['salle_complete', 'salle_basique'];

  function joindre(noms) {
    if (noms.length < 2) return noms.join('');
    return noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1];
  }

  function uniques(noms) {
    var vus = {}, sortie = [];
    noms.forEach(function (n) { if (!possede(vus, n)) { vus[n] = true; sortie.push(n); } });
    return sortie;
  }

  // Les zones à ménager que charge la place de cette ligne (son motif), dans l'ordre de `menager`.
  function zonesDeLigne(l, menager) {
    return liste(menager).filter(function (z) { return possede(CHARGE_ZONE, z) && contient(CHARGE_ZONE[z], l.motif); });
  }

  // Sous un exercice : « sans série lourde · ton genou », « demande une barre fixe ». Une liste (parfois les deux).
  function mentionsDeLigne(l, entree) {
    var e = entree || {}, m = [];
    var zones = zonesDeLigne(l, e.menager);
    if (zones.length) m.push('sans série lourde \u00b7 ' + joindre(zones.map(function (z) { return POSSESSIF[z]; })));
    if (l.barre_fixe && !contient(SALLES, e.materiel)) m.push('demande une barre fixe');
    return m;
  }

  // Le haut de l'aperçu : « {N} séances par semaine. », une phrase par zone à ménager, et la barre fixe.
  function phrasesDeLApercu(routines, entree, nommer, total) {
    var e = entree || {}, rts = liste(routines);
    var lignes = [];
    rts.forEach(function (rt) { liste(rt.exercices).forEach(function (l) { lignes.push(l); }); });
    var zones = [];
    liste(e.menager).forEach(function (z) {
      if (!possede(CHARGE_ZONE, z)) return;
      var noms = uniques(lignes.filter(function (l) { return contient(CHARGE_ZONE[z], l.motif); })
        .map(function (l) { return nommer(l.exercise_slug); }));
      if (!noms.length) return;
      var souleve = z === 'dos' && lignes.some(function (l) { return l.motif === 'charniere'; });
      // Le raccourci de la durée (MOTEUR §9.18) ne coupe JAMAIS une série d'un exercice ménagé (60-5, R4/R6 : il en
      // est exempté). Cette branche n'est pourtant pas morte : « Remplacer » donne à une place déjà raccourcie un
      // exercice qui, lui, charge la zone (le motif suit l'exercice, `remplacePar`) — la ligne arrive avec ses séries
      // coupées, `raccourcie` en tête, et la phrase ne promet pas « toutes ses séries ». Une zone à un seul exercice
      // dit « ses séries ».
      var coupees = lignes.some(function (l) { return l.raccourcie && contient(CHARGE_ZONE[z], l.motif); });
      var phrase = 'Tu ménages ' + POSSESSIF[z] + ' : ' + noms.join(', ') + ', sans série lourde.';
      if (!coupees) {
        phrase += ' Toutes ' + (noms.length > 1 ? 'leurs' : 'ses') + ' séries restent' +
          (souleve ? ' ; ' + CHARNIERE_MAX + ' répétitions au plus au soulevé' : '') + '.';
      } else if (souleve) phrase += ' ' + CHARNIERE_MAX + ' répétitions au plus au soulevé.';
      zones.push(phrase);
    });
    var barre = '';
    if (!contient(SALLES, e.materiel)) {
      var fixes = uniques(lignes.filter(function (l) { return l.barre_fixe; }).map(function (l) { return nommer(l.exercise_slug); }));
      if (fixes.length) {
        barre = joindre(fixes) + (fixes.length > 1 ? ' demandent' : ' demande') +
          ' une barre fixe. Sans barre : touche-le, puis Remplacer.';
      }
    }
    // `total` : le nombre de séances du programme, quand toutes ne sont pas encore à créer (une reprise après panne).
    return { titre: (total === undefined ? rts.length : total) + ' séances par semaine.', zones: zones, barreFixe: barre };
  }

  // ── Ce que le raccourci de la durée ne touche pas (R4/R6, 60-5) ──────────────────────
  // Les exercices d'une séance dont la place charge une zone à ménager (`menage`, posé par `ligne()` d'après
  // `CHARGE_ZONE`) : `Moteur.raccourcirRoutine(structure, cible, exemptes)` ne leur coupe aucune série.
  function exemptsDuRaccourci(routine) {
    return liste(routine && routine.exercices).filter(function (l) { return l.menage; })
      .map(function (l) { return l.exercise_slug; });
  }

  // ── La carte « Passer en cycles » ────────────────────────────────────────────────
  // MOTEUR §9.22 (décidée le 08/10/2026, question 4) : Force ou Les deux, 21 jours après la création du dossier et au
  // moins 6 séances faites depuis ses routines, UNE SEULE FOIS, ni en « Juste un carnet », ni si le dossier est déjà
  // un programme. `e` : { objectif, joursDepuisCreation, seancesDuDossier, estProgramme, carnet, dejaVue }.
  var CARTE_JOURS = 21, CARTE_SEANCES = 6;

  function carteCycles(e) {
    var x = e || {};
    return (x.objectif === 'force' || x.objectif === 'les_deux') &&
      Number(x.joursDepuisCreation) >= CARTE_JOURS && Number(x.seancesDuDossier) >= CARTE_SEANCES &&
      !x.estProgramme && !x.carnet && !x.dejaVue;
  }

  var api = {
    MOTIFS: MOTIFS,
    GABARITS: GABARITS,
    VOISIN: VOISIN,
    BARRE_FIXE: BARRE_FIXE,
    CHARGE_ZONE: CHARGE_ZONE,
    DOUX: DOUX,
    REPS: REPS,
    CHARNIERE_MAX: CHARNIERE_MAX,
    JOURS_MIN: JOURS_MIN,
    JOURS_MAX: JOURS_MAX,
    CARTE_JOURS: CARTE_JOURS,
    CARTE_SEANCES: CARTE_SEANCES,
    bornerJours: bornerJours,
    generer: generer,
    neVeuxPas: neVeuxPas,
    remplacePar: remplacePar,
    pourquoi: pourquoi,
    mentionsDeLigne: mentionsDeLigne,
    phrasesDeLApercu: phrasesDeLApercu,
    exemptsDuRaccourci: exemptsDuRaccourci,
    carteCycles: carteCycles
  };

  racine.THGenerateur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
