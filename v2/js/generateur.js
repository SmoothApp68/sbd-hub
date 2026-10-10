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
// La référence est `tests/unit/fixtures/gen60b.py` (Claude.ai, 08/10/2026 : `gen60.py` de 60-4 + les règles de 60-6) ;
// ses cas, `cas-60-6-generateur.json`, sont rejoués à l'identique par `tests/unit/v2-generateur.test.js`. Un cas qui
// semble faux se rapporte : il ne se corrige pas ici en silence.

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
    // 2 jours (60-6, S1) : le couché dans les DEUX séances (deux principaux « poussée » et un secondaire), les mollets
    // à la place des élévations latérales, plus de triceps en direct.
    2: [['Corps entier A', [['squat', 'P'], ['couche', 'P'], ['rowing', 'S'], ['jambes_tendues', 'S'], ['mollets', 'I'],
                            ['abdos', 'T']]],
        ['Corps entier B', [['charniere', 'P'], ['militaire', 'P'], ['tirage_vertical', 'S'], ['presse', 'S'],
                            ['couche', 'S'], ['curl', 'I']]]],
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

  // Le poids du corps lourd (60-6, S3) : pour qui a moins d'un an de pratique et ne l'a jamais fait, ces trois exercices
  // ne sont proposés qu'en dernier recours — quand ni le motif, ni son voisin, ni un exercice déjà pris ailleurs dans la
  // semaine ne donne autre chose (jamais retirés pour de bon : la place ne reste pas vide à cause d'eux).
  var PDC_LOURD = ['tractions', 'releve_de_genoux_suspendu', 'rowing_inverse'];
  // Débutant = `anciennete === 'moins_1_an'` (la clé du profil) ; absente ou inconnue : pas débutant.
  var DEBUTANT = 'moins_1_an';

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
  //
  // `session` : les exercices DÉJÀ DANS cette séance (60-6, S2/S6). Le repli « un exercice déjà pris » les exclut : le
  // même exercice deux fois dans une séance n'a pas de sens, la place saute plutôt. `debutant` (S3) : on cherche
  // d'abord SANS les trois exercices de poids du corps lourd qui ne sont pas dans l'historique, puis, si rien, avec.
  function choisir(motif, ok, ecartes, pris, menager, faits, materiel, debutant, session) {
    if (debutant) {
      var sans = function (s) { return !(contient(PDC_LOURD, s) && !(possede(faits, s) ? Number(faits[s]) || 0 : 0)); };
      var r = choisirBrut(motif, function (s) { return ok(s) && sans(s); }, ecartes, pris, menager, faits, materiel, session);
      if (r) return r;
    }
    return choisirBrut(motif, ok, ecartes, pris, menager, faits, materiel, session);
  }

  function choisirBrut(motif, ok, ecartes, pris, menager, faits, materiel, session) {
    function candidats(src, sansPris) {
      return src.filter(function (s) {
        return !contient(ecartes, s) && ok(s) && !(sansPris && possede(pris, s)) && !(!sansPris && possede(session, s));
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

  // La zone d'un exercice = celle de son PREMIER muscle principal ; hors du radar, la zone à part (jamais rattachée au hasard).
  function cleDeZone(fiche) {
    var z = zoneDe(liste(fiche && fiche.muscles_primaires)[0]);
    return z ? z.cle : ZONE_INCONNUE.cle;
  }

  // `solo` : les zones dont TOUTES les places du programme sont des principaux (60-6, S4) — { cleDeZone : true }.
  function ligne(catalogue, slug, motif, role, p, solo) {
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
    // Un muscle prioritaire, hors sèche (un exercice prioritaire l'est toujours, sèche comprise) : +1 série sur un
    // secondaire, une isolation ou le tronc ; sur un principal seulement quand sa zone n'a aucune autre place dans le
    // programme (`solo`) — sinon la priorité passe par les autres places de la zone (60-6, S4).
    var prioMu = phase !== 'seche' && liste(fiche.muscles_primaires).some(function (m) {
      var z = zoneDe(m);
      return !!z && contient(priorites, z.cle);
    });
    if (prioEx || (prioMu && (role === 'S' || role === 'I' || role === 'T' ||
                              (role === 'P' && possede(solo, cleDeZone(fiche)))))) n += 1;
    var menage = menager.some(function (z) { return possede(CHARGE_ZONE, z) && contient(CHARGE_ZONE[z], motif); });
    if (menage && role === 'P') reps = r[1];               // pas de série lourde ; toutes les séries gardées
    if (motif === 'charniere') reps = Math.min(reps, CHARNIERE_MAX);
    return { exercise_slug: slug, motif: motif, role: role, series: n, reps: reps,
             prioritaire: prioEx, menage: menage, barre_fixe: contient(BARRE_FIXE, slug) };
  }

  // ── Le programme ────────────────────────────────────────────────────────────
  // `entree` : { jours, objectif, phase, materiel, anciennete, priorites, menager, ecartes, faits }. Rend des routines
  // { nom, exercices: [{ exercise_slug, motif, role, series, reps, prioritaire, menage, barre_fixe }] }.
  function generer(catalogue, entree) {
    var p = entree || {};
    var faits = p.faits || {};
    var ecartes = liste(p.ecartes);
    var ok = faisable(catalogue, p.materiel, faits);
    var debutant = p.anciennete === DEBUTANT;
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
      // Les exercices déjà choisis DANS cette séance (les places plus prioritaires) : jamais deux fois le même.
      var session = {};
      gabarit[pl.r][1].forEach(function (autre, jj) {
        var deja = choix[pl.r + '-' + jj];
        if (deja) session[deja] = true;
      });
      var s = choisir(pl.motif, ok, ecartes, pris, p.menager, faits, p.materiel, debutant, session);
      if (s) { choix[pl.r + '-' + pl.j] = s; pris[s] = true; }
    });
    // Les zones dont toutes les places du programme sont des principaux : la priorité de zone n'y aurait aucun effet.
    var zonesP = {}, zonesAutres = {}, solo = {};
    Object.keys(choix).forEach(function (cle) {
      var parts = cle.split('-');
      var fiche = catalogue[choix[cle]];
      if (!fiche) return;
      (gabarit[Number(parts[0])][1][Number(parts[1])][1] === 'P' ? zonesP : zonesAutres)[cleDeZone(fiche)] = true;
    });
    Object.keys(zonesP).forEach(function (cle) { if (!possede(zonesAutres, cle)) solo[cle] = true; });
    return gabarit.map(function (rt, r) {
      var ex = [];
      rt[1].forEach(function (pl, j) {
        var s = choix[r + '-' + j];
        if (s) ex.push(ligne(catalogue, s, pl[0], pl[1], p, solo));
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
    // `pris` = les exercices de CETTE séance : le repli ne les reprend jamais (60-6, S6) ; le débutant reste débutant.
    var s = choisir(vieux.motif, faisable(catalogue, p.materiel, faits), ecartes, pris, p.menager, faits, p.materiel,
                    p.anciennete === DEBUTANT, pris);
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
  // Les salles ont une barre fixe (R3, 60-5) ; ailleurs — maison équipée, maison minimale, poids du corps — rien ne la
  // garantit. La condition est l'EXERCICE présent (`barre_fixe`), jamais l'étiquette du matériel : celle-ci ne fait que
  // dire où la phrase ne se dit pas. Un matériel NON RENSEIGNÉ (`null`, '' ou absent) vaut la salle complète — c'est
  // ainsi que `faisable` le traite (aucune restriction) — donc pas de phrase (60-6, S5).
  var SALLES = ['salle_complete', 'salle_basique'];

  function barreFixeAVerifier(materiel) {
    return typeof materiel === 'string' && materiel !== '' && !contient(SALLES, materiel);
  }

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
    if (l.barre_fixe && barreFixeAVerifier(e.materiel)) m.push('demande une barre fixe');
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
    if (barreFixeAVerifier(e.materiel)) {
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

  // ══ « LE COACH RELIT TA SEMAINE » (66A, QUESTIONNAIRE-COACH-V2 §5 ter) ══════════════
  //
  // Pour qui a des routines, le générateur ne réécrit rien : il RELIT la semaine, dit ce qu'il voit et propose. Une
  // fonction pure, `relireSemaine(entree)`, sous la garde (`GARDEES`) : l'écran (66B) ne calcule rien. Elle ne calcule
  // AUCUN fait, elle les reçoit :
  //   · `volume`   — le fait du coach par muscle (`Moteur.placeDeVolume`, MOTEUR §14.6) : `{ muscle: { moyenne,
  //                  seuil, max, fenetres } | null }` ;
  //   · `barres`   — le fait des barres (`faits.barresDuBilan`, §5 ter.2) ;
  //   · `routines` — les routines du dossier relu, telles qu'en base ; `catalogue` (`muscles_primaires`,
  //                  `muscles_secondaires`, `muscles_stabilisateurs`, `equipement`, `mesure`, `charge`, et `mouvement`
  //                  que seul `Modele.freresDe` lit) ; `profil` (`sexe`, `objectif`, `phase`) ; `priorites` ;
  //                  `aujourdhui` (le jour civil `AAAA-MM-JJ`, ou une date : jamais l'horloge).
  // Elle lit les définitions existantes, elle ne les recopie pas : la série de travail (`Modele.estTravail`), les
  // poids 1 / ½ / ¼ (`Semaine.musclesPonderes`), le polyarticulaire (`Moteur.estPolyarticulaire`), la sortie (celle du
  // jeu), l'accord des muscles (`Moteur.motsDesMuscles`), les nombres (`Modele.nombre`, la face exportée de
  // `nombreTexte`) et les dates (`Modele`), l'écart en jours (`Profil.joursDepuis`), les variantes à la barre (les
  // frères à la barre, `Modele.freresDe` : la seule lecture de `mouvement`).
  //
  // La référence est `tests/unit/fixtures/relire66.py` (Claude.ai, 10/10/2026) ; ses dix cas, `cas-66-relire.json`,
  // sont rejoués à l'identique par `tests/unit/v2-relire-semaine.test.js`. Un cas qui semble faux se rapporte.

  // Les quatre barres, dans l'ordre de la spec, et leur nom court.
  var BARRES = [['squat_barre', 'Squat'], ['developpe_couche_barre', 'Couché'], ['souleve_de_terre_barre', 'Soulevé'],
                ['developpe_militaire_barre', 'Militaire']];
  var SQUAT = BARRES[0][0], COUCHE = BARRES[1][0], MILITAIRE = BARRES[3][0];
  // Squat ÷ couché : le bas des moyennes de compétition par sexe (moyennes IPF des débutants ; van den Hoek et al.
  // 2024, J Sci Med Sport, 809 986 compétitions). Le repère affiché : la fourchette débutants → élite.
  var RATIO_SQUAT_COUCHE = { homme: 1.2, femme: 1.6 };
  var REPERE_SQUAT_COUCHE = { homme: '1,2 à 1,5', femme: '1,6 à 1,7' };
  var GENS = { homme: 'hommes', femme: 'femmes' };
  var DISCIPLINES_RATIO = ['force', 'les_deux'];
  var JOURS_PLAT = 365;             // « pas encore dépassé » : un record d'au moins 12 mois, sur une barre travaillée
  var SECHE_DEPASSEMENT = 1.3;      // en sèche, un muscle à plus de 1,3 × son plus haut volume (N3)
  var PAR_SEANCE = 11;              // ~11 séries d'un muscle par séance (Remmert, Pelland et al. 2025)
  var PEU_TRAVAILLE = 2;            // Muscle / Forme : sous 2 séries par semaine, même à son plus haut
  var MUSCLES_SUIVIS = ['pectoraux', 'grand_dorsal', 'deltoide_lateral', 'deltoide_posterieur', 'biceps', 'triceps',
                        'quadriceps', 'ischio_jambiers', 'fessiers', 'abdominaux'];
  var TIRAGE = ['grand_dorsal', 'haut_du_dos'];
  // L'ordre dans lequel la sèche traite les muscles : chacun sur la semaine déjà allégée des précédents.
  var MUSCLES = ['pectoraux', 'grand_dorsal', 'haut_du_dos', 'trapezes', 'bas_du_dos', 'deltoide_anterieur',
                 'deltoide_lateral', 'deltoide_posterieur', 'biceps', 'triceps', 'avant_bras', 'quadriceps',
                 'ischio_jambiers', 'fessiers', 'mollets', 'adducteurs', 'abducteurs', 'abdominaux'];
  var TRONC = 'abdominaux';
  var EPS_RELECTURE = 1e-9;

  // Les définitions des autres modules, lues À L'APPEL (ils se chargent avant celui-ci ; un test charge les siens).
  function relecture() {
    var Modele = racine.THModele, Semaine = racine.THSemaine, Moteur = racine.THMoteur, Profil = racine.THProfil;

    var ficheDe = function (cat, slug) { return (cat || {})[slug] || null; };
    var primaires = function (f) { return liste(f && f.muscles_primaires); };
    var estPoly = function (f) {
      return Moteur.estPolyarticulaire({ prim: liste(f && f.muscles_primaires), sec: liste(f && f.muscles_secondaires),
                                         stab: liste(f && f.muscles_stabilisateurs) });
    };
    // Une sortie (le cardio) : la définition du jeu.
    var estSortie = function (f) { return Modele.estExerciceSortie(f) && !Semaine.porteDuVolume(f); };
    // Le tronc : un exercice dont le seul principal est abdominaux.
    var estTronc = function (f) { var p = primaires(f); return p.length === 1 && p[0] === TRONC; };
    var pl = function (n) { return n >= 2 ? 's' : ''; };
    var mots = function (muscles) {
      return Moteur.motsDesMuscles(muscles.map(function (m) { return { cle: m, libelle: Semaine.libelleMuscle(m) }; }));
    };
    // Le jour civil, en date locale (les formateurs lisent une date, pas une chaîne au fuseau UTC).
    var jourLocal = function (v) { return new Date(Moteur.jourCivil(v) + 'T00:00:00'); };
    var seriesDeTravail = function (x) { return liste(x && x.series).filter(function (s) { return Modele.estTravail(s); }).length; };
    // La barre d'un exercice — elle-même, ou une variante à la barre (ses frères à la barre) — ou `null`.
    var familleDe = function (slug, cat) {
      for (var i = 0; i < BARRES.length; i++) {
        var b = BARRES[i][0], f = ficheDe(cat, slug);
        if (slug === b || (f && f.equipement === 'barre' && contient(Modele.freresDe(cat, b), slug))) return b;
      }
      return null;
    };

    // ── §5 ter.3 — Ton historique ────────────────────────────────────────────
    function propositionPriorite(e) {
      var cat = e.catalogue, deplacements = [];
      liste(e.routines).forEach(function (r) {
        var ex = liste(r.exercices).filter(function (x) { return !estSortie(ficheDe(cat, x.exercise_slug)); });
        var k = -1;
        for (var i = 0; i < ex.length; i++) if (familleDe(ex[i].exercise_slug, cat) === SQUAT) { k = i; break; }
        if (k > 0) deplacements.push({ routine_id: r.id, exercise_slug: ex[k].exercise_slug, avant: ex[0].exercise_slug });
      });
      var phrase = 'Faire du squat ta priorité ?';
      if (deplacements.length) phrase += ' Il passe en premier dans ses séances.';
      return { type: 'priorite', slug: SQUAT, phrase: phrase, deplacements: deplacements,
               oui: 'En faire ma priorité', non: 'Non merci' };
    }

    function historique(e) {
      var barres = e.barres || {}, prof = e.profil || {}, auj = Moteur.jourCivil(e.aujourdhui);
      var presentes = BARRES.filter(function (b) { return barres[b[0]] && barres[b[0]].record; });
      var plusLourd = 0;
      presentes.forEach(function (b) { plusLourd = Math.max(plusLourd, barres[b[0]].record.charge); });
      var lignes = presentes.map(function (bn) {
        var b = barres[bn[0]], r = b.record, recent = b.recent;
        var travaillee = (b.semaines || 0) > 0;
        var plat = travaillee && Profil.joursDepuis(r.date, auj) >= JOURS_PLAT;
        var detail = [Modele.moisAnnee(jourLocal(r.date)) + (plat ? ', pas encore dépassé' : '')];
        if (recent) detail.push(Modele.chargeFois(recent.charge, recent.reps) + ' ' + Modele.quand(jourLocal(recent.date), jourLocal(auj)));
        if (travaillee) {
          var expo = b.semaines + ' semaine' + pl(b.semaines) + ' sur 26';
          if (b.lourdes) expo += ', ' + b.lourdes + ' série' + pl(b.lourdes) + ' lourde' + pl(b.lourdes);
          if (b.variantes) expo += ' (+ ' + b.variantes + ' en variante)';
          detail.push(expo);
        }
        return { slug: bn[0], nom: bn[1], record: r.charge, detail: detail.join(' · '),
                 jauge: Modele.arrondi(r.charge / plusLourd, 2), retard: false };
      });
      var sortie = { barres: lignes, ratio: null, peu_travailles: null };
      // La barre en retard (Force, Les deux) : squat ÷ couché sous le repère de son sexe.
      var sq = barres[SQUAT] || {}, co = barres[COUCHE] || {}, sexe = prof.sexe;
      if (contient(DISCIPLINES_RATIO, prof.objectif) && possede(RATIO_SQUAT_COUCHE, sexe) && sq.record && co.record &&
          sq.semaines && co.semaines) {
        var ratio = sq.record.charge / co.record.charge;
        if (ratio < RATIO_SQUAT_COUCHE[sexe]) {
          lignes.forEach(function (l) { if (l.slug === SQUAT) l.retard = true; });
          var deja = contient(liste(e.priorites), SQUAT);
          var gris = 'Ces repères viennent de compétiteurs, et ta morphologie peut jouer. Ce qu\'on voit chez toi : ' +
            'le couché ' + co.semaines + ' semaines sur 26, le squat ' + sq.semaines + '.';
          sortie.ratio = {
            phrase: 'Ton squat vaut ' + Modele.nombre(ratio, 2) + ' fois ton couché. Chez les ' + GENS[sexe] +
              ' qui font de la force, le squat vaut ' + REPERE_SQUAT_COUCHE[sexe] + ' fois le couché.',
            gris: gris + (deja ? ' C\'est déjà ta priorité.' : ''),
            proposition: deja ? null : propositionPriorite(e)
          };
        }
      }
      // Muscle, Forme ou sans réponse : le retard se lit par muscle, pas par barre.
      if (!contient(DISCIPLINES_RATIO, prof.objectif)) {
        var vol = e.volume || {};
        var peu = MUSCLES_SUIVIS.filter(function (m) { return vol[m] && vol[m].max < PEU_TRAVAILLE; });
        if (peu.length) {
          var t = mots(peu);
          sortie.peu_travailles = t.texte + ' ' + (t.pluriel ? 'sont' : 'est') + ' presque jamais travaillé' +
            (t.pluriel ? 's' : '') + ' : moins de 2 séries par semaine, même à ton plus haut.';
        }
      }
      return sortie;
    }

    // ── §5 ter.4 — Ta semaine ────────────────────────────────────────────────
    function semaine(e) {
      var cat = e.catalogue, prof = e.profil || {};
      // Une copie de travail : la sèche retire des séries une à une, l'entrée n'est jamais touchée.
      var routines = liste(e.routines).map(function (r) {
        return { id: r.id, nom: r.nom, exercices: liste(r.exercices).map(function (x) {
          return { exercise_slug: x.exercise_slug, n: seriesDeTravail(x),
                   groupe: x.groupe_superset === undefined ? null : x.groupe_superset };
        }) };
      });
      var volumeDe = function (rs) {
        var v = {};
        rs.forEach(function (r) {
          r.exercices.forEach(function (x) {
            Semaine.musclesPonderes(ficheDe(cat, x.exercise_slug)).forEach(function (p) {
              v[p.muscle] = (v[p.muscle] || 0) + p.poids * x.n;
            });
          });
        });
        return v;
      };
      var total = 0;
      routines.forEach(function (r) {
        r.exercices.forEach(function (x) { if (!estSortie(ficheDe(cat, x.exercise_slug))) total += x.n; });
      });
      var verifs = [], constats = [];
      // Le lourd en premier : dans chaque routine, la première barre (ou variante à la barre) avant toute isolation.
      var barreQuelquePart = false, lourdOk = true;
      routines.forEach(function (r) {
        var ex = r.exercices.filter(function (x) {
          var f = ficheDe(cat, x.exercise_slug);
          return !estSortie(f) && !estTronc(f);
        });
        var k = -1;
        for (var i = 0; i < ex.length; i++) if (familleDe(ex[i].exercise_slug, cat)) { k = i; break; }
        if (k < 0) return;
        barreQuelquePart = true;
        var avant = ex.slice(0, k).filter(function (x) { return !estPoly(ficheDe(cat, x.exercise_slug)); });
        if (avant.length) {
          lourdOk = false;
          constats.push('Dans « ' + r.nom + ' », une isolation passe avant la barre.');
        }
      });
      // Le tronc à la fin.
      var troncPresent = false, troncOk = true;
      routines.forEach(function (r) {
        var ex = r.exercices.filter(function (x) { return !estSortie(ficheDe(cat, x.exercise_slug)); });
        var ks = [];
        ex.forEach(function (x, i) { if (estTronc(ficheDe(cat, x.exercise_slug))) ks.push(i); });
        if (!ks.length) return;
        troncPresent = true;
        if (ks[0] < ex.length - ks.length) troncOk = false;
      });
      if (barreQuelquePart && lourdOk && troncPresent && troncOk) verifs.push('le lourd en premier, le tronc à la fin');
      else if (barreQuelquePart && lourdOk) verifs.push('le lourd en premier');
      else if (troncPresent && troncOk) verifs.push('le tronc à la fin');
      // Les supersets : les groupes, routine par routine.
      var paires = 0;
      routines.forEach(function (r) {
        var groupes = {};
        r.exercices.forEach(function (x) { if (x.groupe !== null) groupes[JSON.stringify(x.groupe)] = true; });
        paires += Object.keys(groupes).length;
      });
      if (paires) verifs.push(paires + ' superset' + pl(paires) + ' dans ta semaine');
      // Par séance (D13) : le plus haut volume d'un muscle dans une routine.
      var pire = 0, ou = null, quel = null;
      routines.forEach(function (r) {
        var v = volumeDe([r]);
        Object.keys(v).forEach(function (m) {
          if (v[m] > pire + EPS_RELECTURE) { pire = v[m]; ou = r.nom; quel = m; }
        });
      });
      if (pire > 0) {
        if (pire <= PAR_SEANCE + EPS_RELECTURE) verifs.push('au plus ' + Modele.nombre(pire, 1) + ' séries d\'un muscle par séance');
        else constats.push(Semaine.libelleMuscle(quel) + ' : ' + Modele.nombre(pire, 1) + ' séries dans « ' + ou +
          ' ». Au-delà d\'environ 11, une série de plus rapporte peu.');
      }
      // Tirage et poussée, en séries directes.
      var tirage = 0, pousse = 0;
      routines.forEach(function (r) {
        r.exercices.forEach(function (x) {
          var p = primaires(ficheDe(cat, x.exercise_slug));
          if (p.some(function (m) { return contient(TIRAGE, m); })) tirage += x.n;
          if (contient(p, 'pectoraux') || familleDe(x.exercise_slug, cat) === MILITAIRE) pousse += x.n;
        });
      });
      if (tirage || pousse) verifs.push(tirage + ' série' + pl(tirage) + ' de tirage pour ' + pousse + ' de poussée');
      // En sèche : un muscle nettement au-dessus de son plus haut volume → retirer des séries d'isolation (N3).
      var propositions = [];
      if (prof.phase === 'seche') {
        var volume = e.volume || {};
        var ordreDesRoutines = routines.map(function (r) { return r.id; });
        MUSCLES.forEach(function (m) {
          var f = volume[m];
          var v = volumeDe(routines);
          if (!f || (v[m] || 0) <= SECHE_DEPASSEMENT * f.max + EPS_RELECTURE) return;
          var avantV = v[m] || 0;
          var lignes = {}, cles = [];
          while ((volumeDe(routines)[m] || 0) > f.max + EPS_RELECTURE) {
            // La plus chargée d'abord ; à égalité, la première routine, puis le premier exercice.
            var choix = null;
            routines.forEach(function (r) {
              r.exercices.forEach(function (x) {
                var fx = ficheDe(cat, x.exercise_slug);
                if (!contient(primaires(fx), m) || estPoly(fx) || x.n < 2) return;
                if (!choix || x.n > choix.x.n) choix = { r: r, x: x };
              });
            });
            if (!choix) break;
            var cle = JSON.stringify([choix.r.id, choix.x.exercise_slug]);
            if (!possede(lignes, cle)) {
              lignes[cle] = { routine_id: choix.r.id, routine: choix.r.nom, exercise_slug: choix.x.exercise_slug,
                              de: choix.x.n, a: null };
              cles.push(cle);
            }
            choix.x.n -= 1;
            lignes[cle].a = choix.x.n;
          }
          if (!cles.length) return;
          var t = mots([m]);
          var retirees = 0;
          cles.forEach(function (c) { retirees += lignes[c].de - lignes[c].a; });
          propositions.push({
            type: 'retirer', muscle: m,
            phrase: 'En sèche, ' + t.texte.charAt(0).toLowerCase() + t.texte.slice(1) + ' ' +
              (t.pluriel ? 'dépassent' : 'dépasse') + ' ton plus haut volume habituel : ' + Modele.nombre(avantV, 1) +
              ' séries par semaine pour ' + Modele.nombre(f.max, 1) + '.',
            question: 'Retirer ' + retirees + ' série' + pl(retirees) + ' ? Tes barres ne bougent pas.',
            lignes: trier(cles.map(function (c) { return lignes[c]; }), function (a, b) {
              var ra = ordreDesRoutines.indexOf(a.routine_id), rb = ordreDesRoutines.indexOf(b.routine_id);
              if (ra !== rb) return ra - rb;
              return a.exercise_slug < b.exercise_slug ? -1 : (a.exercise_slug > b.exercise_slug ? 1 : 0);
            }),
            oui: 'Retirer ces séries', non: 'Non merci'
          });
        });
      }
      return { seances: routines.length, series: total, verifs: verifs, constats: constats, propositions: propositions };
    }

    return {
      relire: function (e) { return { historique: historique(e), semaine: semaine(e) }; }
    };
  }

  function relireSemaine(entree) {
    return relecture().relire(entree || {});
  }

  // LES INVARIANTS DE LA RELECTURE (§5 ter.1) : R1 une proposition de retrait ne fait que retirer, et jamais sous 1
  // série ; R2 aucun retrait hors sèche ; R3 toute proposition porte un « oui » et un « non » — celles de la semaine
  // comme la priorité de « Ton historique » ; R4 pas de repère de ratio hors Force et Les deux. Rend la liste des fautes
  // (vide : la relecture tient).
  function verifierRelecture(entree, sortie) {
    var e = entree || {}, s = sortie || {}, fautes = [];
    var profil = e.profil || {};
    liste(s.semaine && s.semaine.propositions).forEach(function (p) {
      if (p.type === 'retirer') {
        liste(p.lignes).forEach(function (l) {
          if (!(l.a < l.de && l.a >= 1)) fautes.push('R1 une proposition de sèche ajoute ou vide un exercice');
        });
        if (profil.phase !== 'seche') fautes.push('R2 retrait hors sèche');
      }
      if (!p.oui || !p.non) fautes.push('R3 une proposition sans « oui » ni « non »');
    });
    var r = s.historique ? s.historique.ratio : null;
    // R3 couvre aussi la priorité de « Ton historique » (66A bis).
    var q = r ? r.proposition : null;
    if (q && (!q.oui || !q.non)) fautes.push('R3 une proposition sans « oui » ni « non »');
    if (r && !contient(DISCIPLINES_RATIO, profil.objectif)) fautes.push('R4 un repère de ratio hors Force / Les deux');
    return fautes;
  }

  var api = {
    MOTIFS: MOTIFS,
    GABARITS: GABARITS,
    VOISIN: VOISIN,
    BARRE_FIXE: BARRE_FIXE,
    PDC_LOURD: PDC_LOURD,
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
    carteCycles: carteCycles,
    // 66A — la relecture de la semaine (QUESTIONNAIRE-COACH-V2 §5 ter)
    BARRES: BARRES,
    RATIO_SQUAT_COUCHE: RATIO_SQUAT_COUCHE,
    SECHE_DEPASSEMENT: SECHE_DEPASSEMENT,
    PAR_SEANCE: PAR_SEANCE,
    PEU_TRAVAILLE: PEU_TRAVAILLE,
    MUSCLES_SUIVIS: MUSCLES_SUIVIS,
    MUSCLES: MUSCLES,
    relireSemaine: relireSemaine,
    verifierRelecture: verifierRelecture
  };

  racine.THGenerateur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
