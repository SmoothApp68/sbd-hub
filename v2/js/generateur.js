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

  // ── 193-2 — LES FAMILLES DE FORCE (Force = powerlifting, Les deux = powerbuilding), 2 à 6 jours ──────────────
  // Le même mouvement revient dans la semaine DANS UNE AUTRE ZONE (l'ondulation, MOTEUR §9.29) : la zone est écrite dans
  // `routine_exercises.zone` de la ligne (193-3). Une place est `[motif, rôle, surcharge]`. Surcharge : `id` / `lie` (deux places
  // liées : la même barre, deux zones, toujours le MÊME exercice), `zone`, `n` (séries), `reps`, `reculs` + `repsRecul` (une
  // grosse série puis des reculs, 193-1 : Les deux seulement ; à PLUS de reps que la grosse série (193-5, MOTEUR §9.28), leur charge
  // se cale sur le max du jour — « 1 × 4 puis 2 × 8 »),
  // `lourd` (une barre lourde : jamais coupée par le raccourci, elle porte la phase). Pur table : aucun calcul.
  var FAMILLE_OBJECTIFS = ['force', 'les_deux'];
  function pl(motif, role, o) { return [motif, role, o || {}]; }
  function lourde(motif, id, n, reps, lourd) { return pl(motif, 'P', { id: id, zone: 'lourd', n: n, reps: reps, lourd: lourd !== false }); }
  function grosse(motif, id, reps, reculs, repsRecul, lourd) {
    return pl(motif, 'P', { id: id, zone: 'lourd', n: 1, reps: reps, reculs: reculs, repsRecul: repsRecul, lourd: lourd !== false });
  }
  function reprise(lie, zone, n, reps) { return pl(null, 'S', { lie: lie, zone: zone, n: n, reps: reps }); }
  function acc(motif, role, n, reps, zone) { return pl(motif, role, zone ? { n: n, reps: reps, zone: zone } : { n: n, reps: reps }); }
  var SERREE = pl('couche_serre', 'S', { zone: 'hypertrophie', n: 3, reps: 8, variante: true });
  var ROUMAIN = function (n) { return acc('jambes_tendues', 'S', n, 8, 'hypertrophie'); };

  var HAUT_DU_CORPS = ['Haut du corps', [['incline', 'S'], ['rowing', 'S'], ['elev_lat', 'I'], ['ecarte', 'I'], ['curl', 'I'], ['triceps', 'I']]];
  var BAS_DU_CORPS = ['Bas du corps', [['presse', 'S'], ['presse', 'S'], ['leg_curl', 'I'], ['hip_thrust', 'S'], ['mollets', 'I']]];

  var F_QUATRE = [
    ['Jour A', [lourde('squat', 's', 4, 4), reprise('c', 'mix', 4, 6), acc('rowing', 'S', 3, 8), acc('elev_lat', 'I', 2, 15)]],
    ['Jour B', [lourde('couche', 'c', 4, 4), ROUMAIN(3), acc('tirage_vertical', 'S', 3, 7), acc('triceps', 'I', 2, 10)]],
    ['Jour C', [lourde('charniere', 'd', 3, 3), SERREE, acc('arriere', 'I', 2, 15)]],
    ['Jour D', [reprise('s', 'mix', 4, 6), acc('militaire', 'S', 3, 6), acc('rowing', 'S', 3, 10), acc('abdos', 'T', 2, 10)]]
  ];
  var D_QUATRE = [
    ['Haut A', [grosse('couche', 'c', 4, 2, 8), reprise('m', 'hypertrophie', 3, 9), acc('tirage_vertical', 'S', 3, 9), acc('elev_lat', 'I', 3, 15)]],
    ['Bas A', [grosse('squat', 's', 4, 2, 6), ROUMAIN(3), acc('leg_curl', 'I', 3, 12), acc('mollets', 'I', 3, 15)]],
    ['Haut B', [grosse('militaire', 'm', 4, 2, 8, false), reprise('c', 'hypertrophie', 3, 9), acc('rowing', 'S', 3, 10), acc('curl', 'I', 3, 12)]],
    ['Bas B', [grosse('charniere', 'd', 4, 2, 5), reprise('s', 'hypertrophie', 3, 9), acc('presse', 'S', 3, 12), acc('abdos', 'T', 3, 15)]]
  ];
  var FAMILLES = {
    force: {
      2: [['Jour A', [lourde('squat', 's', 4, 4), reprise('c', 'mix', 4, 6), ROUMAIN(3), acc('rowing', 'S', 3, 8), acc('abdos', 'T', 2, 10)]],
          ['Jour B', [lourde('couche', 'c', 4, 4), lourde('charniere', 'd', 3, 3), acc('tirage_vertical', 'S', 3, 7), acc('triceps', 'I', 2, 10)]]],
      3: [['Jour A', [lourde('squat', 's', 4, 4), reprise('c', 'mix', 4, 6), acc('rowing', 'S', 3, 8), acc('elev_lat', 'I', 2, 15)]],
          ['Jour B', [lourde('couche', 'c', 4, 4), reprise('s', 'mix', 4, 6), ROUMAIN(3), acc('tirage_vertical', 'S', 3, 7)]],
          ['Jour C', [lourde('charniere', 'd', 3, 3), SERREE, acc('arriere', 'I', 2, 15), acc('triceps', 'I', 2, 10)]]],
      4: F_QUATRE,
      5: F_QUATRE.concat([HAUT_DU_CORPS]),
      6: F_QUATRE.concat([HAUT_DU_CORPS, BAS_DU_CORPS])
    },
    les_deux: {
      2: [['Jour A', [grosse('squat', 's', 4, 2, 6), acc('tirage_vertical', 'S', 3, 9), acc('militaire', 'S', 3, 9), acc('leg_curl', 'I', 3, 12)]],
          ['Jour B', [grosse('couche', 'c', 4, 2, 8), grosse('charniere', 'd', 4, 2, 5), acc('rowing', 'S', 3, 10), acc('curl', 'I', 3, 12)]]],
      3: [['Jour A', [grosse('squat', 's', 4, 2, 6), reprise('c', 'hypertrophie', 3, 9), acc('tirage_vertical', 'S', 3, 9), acc('elev_lat', 'I', 3, 15)]],
          ['Jour B', [grosse('couche', 'c', 4, 2, 8), reprise('s', 'hypertrophie', 3, 9), ROUMAIN(3), acc('rowing', 'S', 3, 10)]],
          ['Jour C', [grosse('charniere', 'd', 4, 2, 5), acc('militaire', 'S', 3, 9), acc('curl', 'I', 3, 12), acc('abdos', 'T', 3, 15)]]],
      4: D_QUATRE,
      5: D_QUATRE.concat([HAUT_DU_CORPS]),
      6: D_QUATRE.concat([HAUT_DU_CORPS, BAS_DU_CORPS])
    }
  };
  // Les variantes qui n'ont pas de motif de remplacement dans `MOTIFS` (pour ne pas changer le programme déduit) : la prise serrée,
  // puis Larsen, puis la barre elle-même (la dernière passe de `choisirBrut` la reprend, MOTEUR §9.29).
  var VARIANTES = { couche_serre: ['developpe_couche_prise_serree', 'developpe_couche_larsen', 'developpe_couche_barre'] };

  // 190 (décision d'Aurélien du 30/10/2026) — LES EXERCICES QUI DEMANDENT UNE BARRE (de traction, fixe, en hauteur) : une seule
  // définition, celle du profil (`THProfil.demandeUneBarreDeTraction`, lue sur le slug et l'équipement de la fiche du catalogue
  // — il n'y a pas de colonne qui le dise). Elle remplace la liste à la main (`tractions`, `rowing_inverse`) qui laissait passer
  // le relevé de genoux suspendu à la maison (le défaut G-maison-suspendu du bêta-test) et toutes les variantes de tractions.
  function demandeUneBarreFixe(slug, fiche) { return racine.THProfil.demandeUneBarreDeTraction(slug, fiche); }

  // Le poids du corps lourd (60-6, S3) : pour qui a moins d'un an de pratique et ne l'a jamais fait, ces trois exercices
  // ne sont proposés qu'en dernier recours — quand ni le motif, ni son voisin, ni un exercice déjà pris ailleurs dans la
  // semaine ne donne autre chose (jamais retirés pour de bon : la place ne reste pas vide à cause d'eux).
  var PDC_LOURD = ['tractions', 'releve_de_genoux_suspendu', 'rowing_inverse'];
  // Débutant : la règle du profil (`THProfil.estDebutant`, « Moins d'un an ») — une définition, lue ici (124, audit du
  // 16/10/2026, 01 #14) ; absente ou inconnue : pas débutant.

  // Les deux élastiques passent avant tout au poids du corps (décidé le 08/10/2026, question 3).
  var ELASTIQUES = ['rowing_elastique', 'tirage_vertical_elastique'];

  // ── La zone à ménager (décidé le 08/10/2026, question 1) ─────────────────────
  // Une place dont le motif charge la zone GARDE son exercice et toutes ses séries, SANS série lourde.
  var CHARGE_ZONE = {
    genou: ['squat', 'presse', 'quad_iso'],
    dos: ['charniere', 'jambes_tendues', 'squat', 'rowing'],
    epaule: ['militaire', 'couche', 'couche_serre', 'elev_lat'],
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
  // 190 — `barreTraction` : la réponse de Ma salle (`true`, `false`, ou inconnue). « Non » : ni tractions ni exercice suspendu,
  // PARTOUT et même fait avant (une déclaration passe avant l'historique) ; « Oui » : permis même à la maison ; inconnue : la
  // maison minimale n'en a pas, comme avant.
  function faisable(catalogue, materiel, faits, barreTraction) {
    var autorises = racine.THProfil.equipementsDe(materiel);
    var sansBarre = barreTraction === false;
    var maisonSansBarre = barreTraction !== true && materiel === 'maison_minimal';
    return function (slug) {
      if (!possede(catalogue, slug)) return false;          // absent du catalogue de la personne : la place l'ignore
      var suspendu = demandeUneBarreFixe(slug, catalogue[slug]);
      if (sansBarre && suspendu) return false;
      if (possede(faits, slug)) return true;                // un exercice déjà fait n'est jamais rétrogradé (60-1)
      if (maisonSansBarre && suspendu) return false;
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

  function candidatsDe(motif) { return liste(possede(MOTIFS, motif) ? MOTIFS[motif] : VARIANTES[motif]); }

  function choisirBrut(motif, ok, ecartes, pris, menager, faits, materiel, session) {
    function candidats(src, sansPris) {
      return src.filter(function (s) {
        return !contient(ecartes, s) && ok(s) && !(sansPris && possede(pris, s)) && !(!sansPris && possede(session, s));
      });
    }
    // Un exercice hors de tout motif (une ligne déduite habillée, 66D : `motif` nul) n'a pas de candidat : la place disparaît.
    var src = candidatsDe(motif);
    var cand = candidats(src, true);
    if (!cand.length && possede(VOISIN, motif)) {
      src = MOTIFS[VOISIN[motif]];
      cand = candidats(src, true);
    }
    if (!cand.length) {
      src = candidatsDe(motif);
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

  // CE QU'UNE PLACE DOIT À LA ZONE MÉNAGÉE ET À LA CHARNIÈRE — une définition, lue par `ligne()` (le gabarit) et par
  // `habiller` (le programme déduit, 66D) : la place charge une zone à ménager (son motif, `CHARGE_ZONE`) ; sans série
  // lourde, ses reps au moins celles d'un secondaire (toutes ses séries gardées) ; la charnière bornée. Des reps
  // inconnues (une ligne déduite sans habitude) restent inconnues.
  function repsDeObjectif(objectif) { return possede(REPS, objectif) ? REPS[objectif] : REPS_DEFAUT; }
  function estMenagee(motif, menager) { return zonesDeLigne({ motif: motif }, menager).length > 0; }
  function repsDeLaPlace(reps, motif, menage, objectif) {
    if (typeof reps !== 'number') return reps;
    if (menage) reps = Math.max(reps, repsDeObjectif(objectif)[1]);
    if (motif === 'charniere') reps = Math.min(reps, CHARNIERE_MAX);
    return reps;
  }

  // `solo` : les zones dont TOUTES les places du programme sont des principaux (60-6, S4) — { cleDeZone : true }.
  function ligne(catalogue, slug, motif, role, p, solo, spec) {
    var objectif = p.objectif, phase = p.phase;
    var priorites = liste(p.priorites), menager = liste(p.menager);
    var r = repsDeObjectif(objectif);
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
    var menage = estMenagee(motif, menager);
    if (spec) return ligneDeFamille(fiche, slug, motif, role, p, spec, n - seriesDe(role, objectif), prioEx, menage);
    reps = repsDeLaPlace(reps, motif, menage, objectif);
    return { exercise_slug: slug, motif: motif, role: role, series: n, reps: reps,
             prioritaire: prioEx, menage: menage, barre_fixe: demandeUneBarreFixe(slug, fiche) };
  }

  // 193-2 — une place de FAMILLE : séries, reps, zone et reculs viennent de la table. La priorité (un exercice prioritaire) ajoute
  // UNE série — ou UN recul à une grosse série : jamais une seconde grosse série. Un muscle prioritaire (`bonus`) n'ajoute rien à une
  // barre de la famille (la table fixe sa part), mais joue pour un accessoire comme avant. Une place qui charge une zone à ménager
  // perd sa série lourde : sa zone Lourd devient Mix (Force) ou Hypertrophie (Les deux), ses reculs redeviennent des séries
  // égales (toutes ses séries gardées), ses reps au moins celles d'un secondaire (`repsDeLaPlace`).
  function ligneDeFamille(fiche, slug, motif, role, p, spec, bonus, prioEx, menage) {
    var objectif = p.objectif;
    var barreDeLaFamille = !!spec.zone;
    var n = spec.n, reps = spec.reps, zone = spec.zone || null;
    var reculs = spec.reculs || 0, repsRecul = reculs ? spec.repsRecul : null;
    if (barreDeLaFamille) { if (prioEx) { if (reculs) reculs += 1; else n += 1; } }
    else n += bonus;
    if (menage) {
      if (zone === 'lourd') zone = objectif === 'les_deux' ? 'hypertrophie' : 'mix';
      if (reculs) { n += reculs; reculs = 0; repsRecul = null; }
      reps = repsDeLaPlace(reps, motif, true, objectif);
    } else if (motif === 'charniere') reps = Math.min(reps, CHARNIERE_MAX);
    var l = { exercise_slug: slug, motif: motif, role: role, series: n, reps: reps, prioritaire: prioEx, menage: menage,
              barre_fixe: demandeUneBarreFixe(slug, fiche), spec: spec };
    if (zone) l.zone = zone;
    if (reculs) { l.reculs = reculs; l.reps_recul = repsRecul; }
    if (spec.lourd) l.lourd = true;
    if (spec.id || spec.lie) l.lien = spec.id || spec.lie;
    return l;
  }


  // ── 193-6 — LA DERNIÈRE SÉRIE « AU MAX », posée par défaut (MOTEUR §9.30) ─────────────────────────────────────────────
  // UNE SEULE FONCTION DE DÉCISION : `Moteur.auMaxDe` (pure). Le générateur la LIT pour chaque ligne d'une séance, dans l'ordre de la
  // séance (un squat suivi d'une autre barre lourde de jambes ne va pas à l'échec) : aucune table ici. Elle dit oui (muscle, les_deux),
  // oui aux accessoires seulement (force), non (forme, objectif absent) ; le débutant, la zone à ménager sont dans la fonction.
  // `au_max: true` sur la ligne = la dernière série de travail ou de recul de l'exercice (posée à l'écriture, `routineDeduite`).
  function marquerAuMax(catalogue, exercices, p, seuls) {
    var Moteur = racine.THMoteur, Modele = racine.THModele, B = Modele.BARRES;
    var debutant = racine.THProfil.estDebutant(p);
    var lignes = liste(exercices);
    lignes.forEach(function (l, i) {
      if (seuls && seuls.indexOf(i) < 0) return;      // un remplacement ne touche que la ligne neuve
      delete l.au_max;
      var fiche = ficheDu(catalogue, l.exercise_slug);
      if (!fiche) return;
      var jambesApres = lignes.slice(i + 1).some(function (a) {
        var fam = familleDeBarre(a.exercise_slug, catalogue);
        return fam === B[0] || fam === B[2];
      });
      var a = Moteur.auMaxDe({
        objectif: p.objectif, debutant: debutant, famille: familleDeBarre(l.exercise_slug, catalogue),
        equipement: fiche.equipement || null,
        isolation: Moteur.estIsolation({ prim: liste(fiche.muscles_primaires), sec: liste(fiche.muscles_secondaires), stab: liste(fiche.muscles_stabilisateurs) }),
        allegee: false, menagee: !!l.menage, douleurRecente: false, barreDeJambesApres: jambesApres
      });
      if (a && a.pose === 'defaut') l.au_max = true;
    });
    return lignes;
  }

  // ── 193-2 — QUELLE FAMILLE ? ───────────────────────────────────────────────────────────────────────────────────────
  // Force et Les deux, avec une barre à disposition (le squat ET le couché à la barre sont faisables : matériel, catalogue ; un
  // exercice « Je n'en veux pas » ne l'enlève pas, il se remplace) : `FAMILLES[objectif][jours]`. Sinon `null` : le gabarit d'avant,
  // inchangé (Muscle, Forme, sans objectif, maison sans barre). Moins d'un an : la même semaine, mais 3 × 5 sans zone, sans reculs
  // et sans prise serrée (l'apprentissage du geste ; Moesgaard 2022 : la périodisation aide surtout les entraînés).
  function gabaritDeForce(catalogue, p, ok, debutant) {
    if (p.famille === false || !contient(FAMILLE_OBJECTIFS, p.objectif)) return null;     // `famille: false` : le gabarit d'avant (les cas de 60-6 le rejouent)
    if (!ok('squat_barre') || !ok('developpe_couche_barre')) return null;
    var base = FAMILLES[p.objectif][bornerJours(p.jours)];
    return debutant ? pourDebutant(base) : base;
  }
  function pourDebutant(gabarit) {
    return gabarit.map(function (rt) {
      var places = [];
      rt[1].forEach(function (pl) {
        var sp = pl[2];
        if (!sp || !sp.zone) { places.push(pl); return; }
        if (sp.variante) return;                                   // pas de prise serrée
        var barre = !!(sp.id || sp.lie);                           // une barre de la famille (liée), pas le roumain
        var o = {}; Object.keys(sp).forEach(function (k) { o[k] = sp[k]; });
        delete o.zone; delete o.reculs; delete o.repsRecul;
        if (barre) { o.n = 3; o.reps = 5; }
        places.push([pl[0], pl[1], o]);
      });
      return [rt[0], places];
    });
  }
  // Pour les tests et le chemin du profil : la famille s'applique-t-elle à cette entrée ?
  function familleApplicable(catalogue, entree) {
    var p = entree || {};
    var ok = faisable(catalogue, p.materiel, p.faits || {}, p.barre_traction);
    return gabaritDeForce(catalogue, p, ok, racine.THProfil.estDebutant(p)) !== null;
  }

  // ── 199 (MOTEUR §9.37) — HYBRIDE : LES JAMBES LOURDES, LOIN DU CARDIO RÉGULIER ───────────────────────────────────────────────────────
  // Le coach lit les jours de cardio réguliers de la personne dans ses séances (`faits.joursDeCardioReguliers` : rien n'est demandé). Le générateur
  // place le jour de jambes lourdes (un squat ou un soulevé en zone Lourd ou Mix) À DEUX JOURS AU MOINS d'un jour de cardio régulier — ni la
  // veille, ni le lendemain, ni le jour même. Convention de coachs (plans Hyrox, Tactical Barbell), dite comme telle ; la science (Schumann 2022)
  // ne l'exige pas : elle dit seulement que l'explosivité baisse un peu si les deux sont à moins de 3 h d'écart.
  // Le programme ne connaît pas les jours de la semaine : sauf `entree.joursSeances` (lundi = 0), ses séances tombent sur les jours TYPES ci-dessous
  // (convention : réparties dans la semaine). Impossible de les écarter toutes : l'ordre reste, et le générateur le dit.
  var NOMS_DES_JOURS = racine.THModele.JOURS_DEPUIS_LUNDI;       // lundi = 0 (le formateur, une seule liste)
  var JOURS_TYPES = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
  var HYBRIDE_ECART_MIN = 2;
  var HYBRIDE_SCIENCE = 'Courir ne te fait pas perdre de force : 43 études, ni force maximale ni muscle en moins quand on mélange les deux. Seule l\u2019explosivité baisse un peu si les deux sont à moins de 3 h d\u2019écart (Schumann 2022).';
  var HYBRIDE_CONVENTION = 'Éviter les jambes lourdes la veille et le lendemain d\u2019un cardio dur est une convention de coachs (plans Hyrox, Tactical Barbell), pas une règle prouvée.';

  function joursDeCardio(x) {
    var vus = {}, sortie = [];
    liste(x).forEach(function (j) { var n = Number(j); if (n % 1 === 0 && n >= 0 && n <= 6 && !possede(vus, n)) { vus[n] = true; sortie.push(n); } });
    return sortie;
  }
  function ecartDeJours(a, b) { var d = Math.abs(a - b); return Math.min(d, 7 - d); }
  // Une séance de jambes lourdes : un squat ou un soulevé (la place, `motif`) en zone Lourd ou Mix.
  function aDesJambesLourdes(rt) {
    return liste(rt && rt.exercices).some(function (l) { return racine.THMoteur.estZoneForce(l.zone) && contient(['squat', 'charniere'], l.motif); });
  }
  function joursDuProgramme(n, e) {
    var vises = liste(e && e.joursSeances).map(Number).filter(function (j) { return j % 1 === 0 && j >= 0 && j <= 6; });
    if (vises.length === n && new Set(vises).size === n) return vises.slice().sort(function (a, b) { return a - b; });
    return possede(JOURS_TYPES, n) ? JOURS_TYPES[n] : null;
  }
  function permutations(n) {
    var sortie = [];
    (function rec(pref, reste) {
      if (!reste.length) { sortie.push(pref); return; }
      reste.forEach(function (r, i) { rec(pref.concat([r]), reste.slice(0, i).concat(reste.slice(i + 1))); });
    })([], Array.apply(null, Array(n)).map(function (_, i) { return i; }));
    return sortie;
  }
  // Rend les routines dans l'ordre de la semaine (les jours TYPES ou `joursSeances`), chacune de jambes lourdes portant `hybride` :
  // `{ jour, jourAvant, deplace, impossible }`. Sans jour de cardio régulier, sans jambes lourdes ou au-delà de 6 séances : rien ne change.
  function placerLesJambesLourdes(routines, entree) {
    var rts = liste(routines), cardio = joursDeCardio((entree || {}).cardioJours);
    var jours = rts.length >= 1 && rts.length <= 6 ? joursDuProgramme(rts.length, entree) : null;
    if (!cardio.length || !jours) return rts;
    var lourdes = rts.map(aDesJambesLourdes);
    if (!lourdes.some(Boolean)) return rts;
    function proche(jour) { return cardio.some(function (c) { return ecartDeJours(jour, c) < HYBRIDE_ECART_MIN; }); }
    function fautes(perm) {
      var n = 0;
      perm.forEach(function (r, k) { if (lourdes[r] && proche(jours[k])) n++; });
      return n;
    }
    // La meilleure semaine : le moins de jours de jambes lourdes trop près du cardio, puis le moins de séances déplacées (la première en cas d'égalité).
    var meilleure = null, f0 = 99, d0 = 99;
    permutations(rts.length).forEach(function (perm) {
      var f = fautes(perm), d = perm.filter(function (r, k) { return r !== k; }).length;
      if (f < f0 || (f === f0 && d < d0)) { meilleure = perm; f0 = f; d0 = d; }
    });
    return meilleure.map(function (r, k) {
      var rt = Object.assign({}, rts[r]);
      if (lourdes[r]) rt.hybride = { jour: jours[k], jourAvant: jours[r], deplace: r !== k, impossible: proche(jours[k]) };
      return rt;
    });
  }
  // Ce que le coach DIT de la place des jambes lourdes (l'aperçu du programme) : `[]` quand rien ne change et que rien n'est impossible.
  // `entree.cardioSemaines` : `{ jour: nombre de semaines sur 4 }` (le fait de `faits.joursDeCardioReguliers`).
  function phrasesHybrides(routines, entree) {
    var e = entree || {}, cardio = joursDeCardio(e.cardioJours);
    var lourdes = liste(routines).filter(function (rt) { return rt && rt.hybride; });
    if (!cardio.length || !lourdes.length) return [];
    var deplacees = lourdes.filter(function (rt) { return rt.hybride.deplace; });
    var restent = lourdes.filter(function (rt) { return rt.hybride.impossible; });
    var sem = e.cardioSemaines || {};
    var qui = joindre(cardio.map(function (j) { return NOMS_DES_JOURS[j] + (sem[j] > 0 ? ' (' + sem[j] + ' des 4 dernières semaines)' : ''); }));
    var phrases = [];
    deplacees.forEach(function (rt) {
      phrases.push('Tu fais du cardio le ' + qui + '. Ton jour de jambes lourdes (' + rt.nom + ') passe au ' + NOMS_DES_JOURS[rt.hybride.jour] +
        ', pas au ' + NOMS_DES_JOURS[rt.hybride.jourAvant] + ' : la veille ou le lendemain d\u2019un cardio dur, tes jambes sont moins fraîches.');
    });
    if (restent.length) {
      phrases.push((deplacees.length ? '' : 'Tu fais du cardio le ' + qui + '. ') + 'Je n\u2019ai pas pu écarter de ton cardio ' +
        joindre(restent.map(function (rt) { return rt.nom; })) + ' : ' + (restent.length > 1 ? 'elles restent' : 'elle reste') + ' à moins de deux jours.');
    }
    return phrases.concat([HYBRIDE_SCIENCE, HYBRIDE_CONVENTION]);
  }

  // ── Le programme ────────────────────────────────────────────────────────────
  // `entree` : { jours, objectif, phase, materiel, anciennete, priorites, menager, ecartes, faits }. Rend des routines
  // { nom, exercices: [{ exercise_slug, motif, role, series, reps, prioritaire, menage, barre_fixe }] }.
  function generer(catalogue, entree) {
    var p = entree || {};
    var faits = p.faits || {};
    var ecartes = liste(p.ecartes);
    var ok = faisable(catalogue, p.materiel, faits, p.barre_traction);
    var debutant = racine.THProfil.estDebutant(p);
    var gabarit = gabaritDeForce(catalogue, p, ok, debutant) || GABARITS[bornerJours(p.jours)];
    // 193-2 — les places liées (la même barre, deux zones) : `id` → clé de la place ; une liée prend l'exercice de sa principale.
    var ids = {};
    gabarit.forEach(function (rt, r) {
      rt[1].forEach(function (pl2, j) { if (pl2[2] && pl2[2].id) ids[pl2[2].id] = r + '-' + j; });
    });
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
      var liee = gabarit[pl.r][1][pl.j][2];
      if (liee && liee.lie) {                      // 193-2 : la même barre, une autre zone — jamais un second choix
        var cle = ids[liee.lie];
        if (cle && choix[cle]) choix[pl.r + '-' + pl.j] = choix[cle];
        return;
      }
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
    return placerLesJambesLourdes(gabarit.map(function (rt, r) {
      var ex = [];
      rt[1].forEach(function (pl, j) {
        var s = choix[r + '-' + j];
        if (!s) return;
        var motif = pl[0], spec = pl[2];
        if (spec && spec.lie) {                       // le motif de la principale (la zone à ménager se lit sur lui)
          var kp = ids[spec.lie].split('-');
          motif = gabarit[Number(kp[0])][1][Number(kp[1])][0];
        }
        ex.push(ligne(catalogue, s, motif, pl[1], p, solo, spec));
      });
      // Stable : l'exercice prioritaire d'abord, puis par rôle.
      ex = trier(ex, function (x, y) {
        return (x.prioritaire ? 0 : 1) - (y.prioritaire ? 0 : 1) || ROLES.indexOf(x.role) - ROLES.indexOf(y.role);
      });
      return { nom: rt[0], exercices: marquerAuMax(catalogue, ex, p) };
    }), p);
  }

  // ── « Je n'en veux pas » ──────────────────────────────────────────────────────
  // SEULE la place touchée change (regénérer tout ferait cascader les choix, mesuré le 08/10/2026). Le suivant du
  // même motif (sinon le voisin, sinon un déjà pris), en évitant ce qui est déjà dans CETTE séance ; les séries
  // restent celles de la place (la personne a pu les changer) ; l'exercice rejoint les écartés. Rien au catalogue : la
  // place disparaît. Rend { routines, ecartes } ; rien n'est modifié en place.
  // 193-2 — LES PLACES LIÉES (la même barre, deux zones) se remplacent ENSEMBLE : toutes les lignes qui portent le même `lien` et le
  // même exercice que la ligne touchée (dans toutes les séances), la ligne touchée comprise. Une ligne sans lien : elle seule.
  function lieesDe(routines, r, k) {
    var rt = liste(routines);
    var vieux = rt[r] && liste(rt[r].exercices)[k];
    if (!vieux) return [];
    var sortie = [[r, k]];
    if (!vieux.lien) return sortie;
    rt.forEach(function (s, i) {
      liste(s.exercices).forEach(function (x, j) {
        if ((i !== r || j !== k) && x.lien === vieux.lien && x.exercise_slug === vieux.exercise_slug) sortie.push([i, j]);
      });
    });
    return sortie;
  }

  // La ligne neuve d'une place : celle de la FAMILLE (sa table : zone, reculs, reps) quand la place en a une — recalculée pour le
  // nouvel exercice (il peut charger une zone à ménager) —, sinon l'ancienne façon. Les séries retouchées de la place restent, tant
  // que la zone à ménager ne change rien à la place.
  function ligneNeuve(catalogue, slug, motif, vieux, p) {
    var neuve = ligne(catalogue, slug, motif, vieux.role, p, {}, vieux.spec || undefined);
    if (!vieux.spec || neuve.menage === vieux.menage) neuve.series = vieux.series;
    if (vieux.raccourcie) neuve.raccourcie = true;
    return neuve;
  }

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
    var liees = lieesDe(nouveau, r, k);
    // Les séances des places liées : l'exercice choisi ne doit être dans AUCUNE d'elles.
    liees.forEach(function (c) { nouveau[c[0]].exercices.forEach(function (x) { pris[x.exercise_slug] = true; }); });
    // `pris` = les exercices de CETTE séance : le repli ne les reprend jamais (60-6, S6) ; le débutant reste débutant.
    var s = choisir(vieux.motif, faisable(catalogue, p.materiel, faits, p.barre_traction), ecartes, pris, p.menager, faits, p.materiel,
                    racine.THProfil.estDebutant(p), pris);
    if (s === null) {
      // rien au catalogue : la place disparaît (ses places liées avec elle, de la dernière à la première pour garder les rangs)
      liees.slice().sort(function (a, b) { return b[1] - a[1]; }).forEach(function (c) { nouveau[c[0]].exercices.splice(c[1], 1); });
    } else {
      liees.forEach(function (c) {
        var place = nouveau[c[0]].exercices[c[1]];
        nouveau[c[0]].exercices[c[1]] = ligneNeuve(catalogue, s, place.motif, place, p);
      });
    }
    if (s !== null) liees.forEach(function (c) { marquerAuMax(catalogue, nouveau[c[0]].exercices, p, [c[1]]); });
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
    var motif = motifDe(slug, vieux.motif);
    lieesDe(nouveau, r, k).forEach(function (c) {
      var place = nouveau[c[0]].exercices[c[1]];
      nouveau[c[0]].exercices[c[1]] = ligneNeuve(catalogue, slug, motif, place, p);
    });
    lieesDe(nouveau, r, k).forEach(function (c) { marquerAuMax(catalogue, nouveau[c[0]].exercices, p, [c[1]]); });
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
      g[cle] = (g[cle] || 0) + x.series + (x.reculs > 0 ? x.reculs : 0);       // 193-2 : les reculs comptent dans le volume
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

  // 190 — « Oui, j'ai une barre de traction » : rien à vérifier, la phrase ne se dit pas.
  function barreFixeAVerifier(materiel, barreTraction) {
    return barreTraction !== true && typeof materiel === 'string' && materiel !== '' && !contient(SALLES, materiel);
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

  // 187 (A4) — LA ZONE LUE EN SÉANCE : les zones à ménager que charge CET EXERCICE (son slug, tous les motifs qui le
  // contiennent — la même table `MOTIFS`/`CHARGE_ZONE` que le gabarit, jamais une seconde). Dans l'ordre de `menager`.
  function zonesQueChargeLExercice(slug, menager) {
    var motifs = Object.keys(MOTIFS).filter(function (m) { return contient(MOTIFS[m], slug); });
    return liste(menager).filter(function (z) {
      return possede(CHARGE_ZONE, z) && motifs.some(function (m) { return contient(CHARGE_ZONE[z], m); });
    });
  }

  // Sous un exercice : « sans série lourde · ton genou », « demande une barre fixe ». Une liste (parfois les deux).
  function mentionsDeLigne(l, entree) {
    var e = entree || {}, m = [];
    var zones = zonesDeLigne(l, e.menager);
    if (zones.length) m.push('sans série lourde \u00b7 ' + joindre(zones.map(function (z) { return POSSESSIF[z]; })));
    if (l.barre_fixe && barreFixeAVerifier(e.materiel, e.barre_traction)) m.push('demande une barre fixe');
    // 193-2 — la zone du jour que la routine portera (193-3), avec ses reps : « Lourd (3-5) ». Une place sans zone (Automatique) : rien.
    if (l.zone && racine.THMoteur && racine.THMoteur.libelleZoneDeBloc) {
      var zl = racine.THMoteur.libelleZoneDeBloc(l.zone, true);
      if (zl) m.unshift('zone ' + zl);
    }
    return m;
  }

  // 193-2 — ce que dit l'en-tête d'un programme de FAMILLE (Force, Les deux) : combien de fois chaque barre passe dans la semaine, ce
  // que fait la zone de chaque jour, la semaine allégée, et pourquoi la fréquence. Des faits, pas des ordres. Aucune phrase sans lignes
  // à zone (Muscle, Forme, débutant, maison sans barre : rien).
  var MOTIFS_SQUAT = ['squat'], MOTIFS_COUCHE = ['couche', 'couche_serre'], MOTIFS_SOULEVE = ['charniere'];
  function fois(n) { return n + ' fois'; }
  function phrasesDeFamille(lignes, total) {
    var zonees = lignes.filter(function (l) { return !!l.zone; });
    if (!zonees.length) return [];
    var compte = function (motifs, zone) {
      return zonees.filter(function (l) { return contient(motifs, l.motif) && (!zone || l.zone === zone); }).length;
    };
    var sq = compte(MOTIFS_SQUAT), co = compte(MOTIFS_COUCHE), so = compte(MOTIFS_SOULEVE, 'lourd');
    var parts = [];
    if (sq) parts.push('squat ' + fois(sq));
    if (co) parts.push('couché ' + fois(co));
    if (so) parts.push('soulevé ' + fois(so) + ' lourd');
    var phrases = [];
    if (parts.length) phrases.push('Dans la semaine\u00a0: ' + parts.join(', ') + '.');
    var reculs = zonees.some(function (l) { return l.reculs > 0; });
    phrases.push(reculs ? 'Un jour lourd, une grosse série puis des reculs\u00a0; un jour en hypertrophie, des séries égales.'
                        : 'Chaque jour a sa zone\u00a0: la même barre passe de Lourd à Mix ou à Hypertrophie.');
    if (total <= 2 && sq <= 1 && co <= 1) phrases.push('Avec ' + total + ' séances, chaque barre passe une fois.');
    phrases.push('Une semaine allégée toutes les 5 semaines\u00a0: mêmes charges, moins de séries.');
    if (sq >= 2 || co >= 2) {
      phrases.push('Fréquence\u00a0: environ 3\u00a0% de force de plus par séance hebdomadaire ajoutée sur un mouvement (Pelland 2026).');
    }
    return phrases;
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
    if (barreFixeAVerifier(e.materiel, e.barre_traction)) {
      var fixes = uniques(lignes.filter(function (l) { return l.barre_fixe; }).map(function (l) { return nommer(l.exercise_slug); }));
      if (fixes.length) {
        barre = joindre(fixes) + (fixes.length > 1 ? ' demandent' : ' demande') +
          ' une barre fixe. Sans barre : touche-le, puis Remplacer.';
      }
    }
    // `total` : le nombre de séances du programme, quand toutes ne sont pas encore à créer (une reprise après panne).
    // 66D : avec un historique, une seule séance est possible (« 1 séance par semaine. »).
    var n = total === undefined ? rts.length : total;
    return { titre: n + (n > 1 ? ' séances' : ' séance') + ' par semaine.', zones: zones, barreFixe: barre,
             famille: phrasesDeFamille(lignes, n), hybride: phrasesHybrides(rts, e) };
  }

  // ── Ce que le raccourci de la durée ne touche pas (R4/R6, 60-5) ──────────────────────
  // Les exercices d'une séance dont la place charge une zone à ménager (`menage`, posé par `ligne()` d'après
  // `CHARGE_ZONE`) : `Moteur.raccourcirRoutine(structure, cible, exemptes)` ne leur coupe aucune série.
  function exemptsDuRaccourci(routine) {
    return liste(routine && routine.exercices).filter(function (l) { return l.menage; })
      .map(function (l) { return l.exercise_slug; });
  }
  // 188-2 — LES PRIORITÉS NE SE RACCOURCISSENT JAMAIS : parmi des exercices, ceux qu'une priorité désigne (une des quatre barres et
  // ses variantes à la barre, les tractions et leurs frères, ou un exercice dont un muscle principal est dans la zone prioritaire).
  // Le raccourci (`Moteur.raccourcirRoutine`, « J'ai peu de temps » comme le programme construit) les reçoit en exemptés.
  function exemptsDesPriorites(slugs, priorites, cat) {
    var M = racine.THModele, S = racine.THSemaine;
    return liste(slugs).filter(function (sl) {
      return liste(priorites).some(function (p) {
        if (p === 'tractions') return sl === 'tractions' || contient(M.freresDe(cat, 'tractions'), sl);
        if (BARRES.some(function (b) { return b[0] === p; })) return familleDeBarre(sl, cat) === p;
        var z = S.ZONES.filter(function (x) { return x.cle === p; })[0];
        return !!z && liste((ficheDu(cat, sl) || {}).muscles_primaires).some(function (m) { return contient(z.muscles, m); });
      });
    });
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
  // poids 1 / ½ / ¼ (`Semaine.musclesPonderes`), le polyarticulaire (`Moteur.estPolyarticulaire`), ce qui ne porte pas
  // de volume (`Semaine.porteDuVolume`, 133b — plus la sortie), l'accord des muscles (`Moteur.motsDesMuscles`), les nombres (`Modele.nombre`, la face exportée de
  // `nombreTexte`) et les dates (`Modele`), l'écart en jours (`Profil.joursDepuis`), les variantes à la barre (les
  // frères à la barre, `Modele.freresDe` : la seule lecture de `mouvement`).
  //
  // La référence est `tests/unit/fixtures/relire66.py` (Claude.ai, 10/10/2026) ; ses dix cas, `cas-66-relire.json`,
  // sont rejoués à l'identique par `tests/unit/v2-relire-semaine.test.js`. Un cas qui semble faux se rapporte.

  // Les quatre barres, dans l'ordre de la spec, et leur nom court : écrits une fois, dans `THModele` (124, audit du
  // 16/10/2026, 06 #16) — `modele.js` se charge avant ce module.
  var BARRES = racine.THModele.BARRES.map(function (b) {
    var n = racine.THModele.NOM_DE_BARRE[b];
    return [b, n.charAt(0).toUpperCase() + n.slice(1)];
  });
  var SQUAT = BARRES[0][0], COUCHE = BARRES[1][0], MILITAIRE = BARRES[3][0];
  // Squat ÷ couché : le repère et sa lecture sont ceux de « Ton parcours » (`THParcours.repereSquatCouche`,
  // carnets de pratiquants ; 76, 12/10/2026 — plus les moyennes de compétition). Aucune table ici.
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

  // ── Tirage, poussée, barres lourdes : UNE définition (66C), lue par la relecture (§5 ter.4) et le complément
  // (§5 quater.3) ─────────────────────────────────────────────────────────────────────────────────────────────
  function ficheDu(cat, slug) { return (cat || {})[slug] || null; }
  // La barre d'un exercice — elle-même, ou une variante à la barre (ses frères à la barre, `Modele.freresDe` : la
  // seule lecture de `mouvement`) — ou `null`.
  function familleDeBarre(slug, cat) {
    var Modele = racine.THModele, f = ficheDu(cat, slug);
    for (var i = 0; i < BARRES.length; i++) {
      var b = BARRES[i][0];
      if (slug === b || (f && f.equipement === 'barre' && contient(Modele.freresDe(cat, b), slug))) return b;
    }
    return null;
  }
  // Une barre lourde (§5 quater.3, C) : une des quatre barres, ou un de ses frères à la barre.
  function estBarreLourde(slug, cat) { return familleDeBarre(slug, cat) !== null; }
  // Une série directe de TIRAGE : un principal grand dorsal ou haut du dos.
  function estTirage(fiche) { return liste(fiche && fiche.muscles_primaires).some(function (m) { return contient(TIRAGE, m); }); }
  // Une série directe de POUSSÉE : un principal pectoraux, ou le militaire et ses variantes (barre, haltères…).
  // 184 (B6) : le militaire AUX HALTÈRES (ou à tout autre matériel) est une poussée comme le militaire à la barre — il
  // partage son `mouvement` (`Modele.freresDe`), quel que soit le matériel ; la relecture l'oubliait.
  function estPoussee(slug, cat) {
    var f = ficheDu(cat, slug);
    return contient(liste(f && f.muscles_primaires), 'pectoraux') || familleDeBarre(slug, cat) === MILITAIRE ||
           slug === MILITAIRE || contient(racine.THModele.freresDe(cat, MILITAIRE), slug);
  }

  // Les définitions des autres modules, lues À L'APPEL (ils se chargent avant celui-ci ; un test charge les siens).
  function relecture() {
    var Modele = racine.THModele, Semaine = racine.THSemaine, Moteur = racine.THMoteur, Profil = racine.THProfil;

    var ficheDe = ficheDu;
    var primaires = function (f) { return liste(f && f.muscles_primaires); };
    var estPoly = function (f) {
      return Moteur.estPolyarticulaire({ prim: liste(f && f.muscles_primaires), sec: liste(f && f.muscles_secondaires),
                                         stab: liste(f && f.muscles_stabilisateurs) });
    };
    // Ce qui ne porte pas de volume (le cardio, un étirement) : hors des comptes et de l'ordre des routines.
    // 133b (22/10/2026) — la règle du volume (`Semaine.porteDuVolume`), pas la sortie : depuis 133 un étirement n'est
    // plus une sortie, et il ne devient pas pour autant une isolation ni une série de musculation.
    var sansVolume = function (f) { return !!f && !Semaine.porteDuVolume(f); };
    // Le tronc : un exercice dont le seul principal est abdominaux.
    var estTronc = function (f) { var p = primaires(f); return p.length === 1 && p[0] === TRONC; };
    var pl = function (n) { return n >= 2 ? 's' : ''; };
    var mots = function (muscles) {
      return Moteur.motsDesMuscles(muscles.map(function (m) { return { cle: m, libelle: Semaine.libelleMuscle(m) }; }));
    };
    // Le jour civil, en date locale (les formateurs lisent une date, pas une chaîne au fuseau UTC).
    var jourLocal = function (v) { return new Date(Moteur.jourCivil(v) + 'T00:00:00'); };
    var seriesDeTravail = function (x) { return liste(x && x.series).filter(function (s) { return Modele.estTravail(s); }).length; };
    var familleDe = familleDeBarre;

    // ── §5 ter.3 — Ton historique ────────────────────────────────────────────
    function propositionPriorite(e) {
      var cat = e.catalogue, deplacements = [];
      liste(e.routines).forEach(function (r) {
        var ex = liste(r.exercices).filter(function (x) { return !sansVolume(ficheDe(cat, x.exercise_slug)); });
        var k = -1;
        for (var i = 0; i < ex.length; i++) if (familleDe(ex[i].exercise_slug, cat) === SQUAT) { k = i; break; }
        if (k > 0) deplacements.push({ routine_id: r.id, exercise_slug: ex[k].exercise_slug, avant: ex[0].exercise_slug });
      });
      // 179 (D1, décision d'Aurélien du 28/10/2026) — une proposition, pas un verdict : « En faire une priorité ? ».
      var phrase = 'En faire une priorité ?';
      if (deplacements.length) phrase += ' Le squat passerait en premier dans ses séances.';
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
                 jauge: Modele.arrondi(r.charge / plusLourd, 2) };
      });
      var sortie = { barres: lignes, ratio: null, peu_travailles: null };
      // Le rapport squat ÷ couché sous le repère de son sexe (Force, Les deux). 179 (D1) : un FAIT et une proposition, jamais
      // l'étiquette « en retard » (un avancé fort au développé n'est pas en retard sur sa barre la plus lourde).
      var sq = barres[SQUAT] || {}, co = barres[COUCHE] || {}, sexe = prof.sexe;
      if (contient(DISCIPLINES_RATIO, prof.objectif) && sq.record && co.record && sq.semaines && co.semaines) {
        var ratio = sq.record.charge / co.record.charge;
        var rp = racine.THParcours.repereSquatCouche(ratio, sexe);
        if (rp.lecture === 'en dessous') {
          var deja = contient(liste(e.priorites), SQUAT);
          // Trois priorités déjà prises (66B, E1) : la base en refuse une quatrième et `Profil.basculerPriorite` rendrait
          // la liste inchangée — un « oui » qui ne ferait rien. Pas de proposition ; le gris renvoie au profil.
          var pleines = !deja && liste(e.priorites).length >= Profil.PRIORITES_MAX;
          var gris = 'Ces repères viennent de carnets d\'entraînement, et ta morphologie peut jouer. Ce qu\'on voit chez toi : ' +
            'le couché ' + co.semaines + ' semaines sur 26, le squat ' + sq.semaines + '.';
          sortie.ratio = {
            phrase: 'Ton squat vaut ' + Modele.nombre(ratio, 2) + ' × ton couché ; repère de pratiquants ' +
              Modele.nombre(rp.repere, 2) + '.',
            gris: gris + (deja ? ' C\'est déjà ta priorité.'
              : (pleines ? ' Tes trois priorités sont déjà prises : tu peux en changer dans ton profil.' : '')),
            proposition: (deja || pleines) ? null : propositionPriorite(e)
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
        r.exercices.forEach(function (x) { if (!sansVolume(ficheDe(cat, x.exercise_slug))) total += x.n; });
      });
      var verifs = [], constats = [];
      // Le lourd en premier : dans chaque routine, la première barre (ou variante à la barre) avant toute isolation.
      var barreQuelquePart = false, lourdOk = true;
      routines.forEach(function (r) {
        var ex = r.exercices.filter(function (x) {
          var f = ficheDe(cat, x.exercise_slug);
          return !sansVolume(f) && !estTronc(f);
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
        var ex = r.exercices.filter(function (x) { return !sansVolume(ficheDe(cat, x.exercise_slug)); });
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
          if (estTirage(ficheDe(cat, x.exercise_slug))) tirage += x.n;
          if (estPoussee(x.exercise_slug, cat)) pousse += x.n;
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

  // ══ LE GÉNÉRATEUR V2 : LE PROGRAMME DÉDUIT COMPLÉTÉ (66C, QUESTIONNAIRE-COACH-V2 §5 quater.3) ══════════════════
  //
  // Une fonction pure, `completer(entree)`, sous la garde (`GARDEES`). Elle ne calcule AUCUN fait, elle les reçoit :
  //   · `deduit`    — le programme déduit (`faits.programmeDeduit`) : `[{ nom, fois, derniere, cochee, exercices }]` ;
  //   · `volume`    — le fait du coach par muscle (`{ muscle: { seuil, max, … } | null }`), lu jusqu'à la semaine de
  //                   la dernière séance comprise ;
  //   · `habitudes` — `faits.habitudes` ; `fois` — `faits.historiqueDesExercices` (sur la même fenêtre) ;
  //   · `catalogue` (dont `habilete`, v2_071 : absente, elle vaut `false`), `profil` (`phase`), `priorites`.
  //   · 66D — `refus: { muscles, reprises, tirage }` (les « Retirer » de l'aperçu) et `ecartes` (« Je n'en veux pas »).
  // Elle lit les définitions existantes : les poids 1 / ½ / ¼ (`Semaine.musclesPonderes`), la zone d'un muscle
  // (`Semaine.zoneDuMuscle`), la barre lourde, le tirage et la poussée de la relecture (ci-dessus), `MUSCLES` et
  // `PAR_SEANCE` de la relecture.
  //
  // La référence est `tests/unit/fixtures/gen66c.py` (Claude.ai, 10/10/2026) ; ses quinze cas,
  // `cas-66c-generateur.json`, sont rejoués à l'identique par `tests/unit/v2-completer.test.js`.
  //
  // Les marques des règles (FICHE-REGLES-GENERATEUR-V2) : S la science (méta-analyses), s un préprint, C la pratique
  // des coachs, K une convention de l'app.
  var ECART = 1;                         // G4 : « sous son habitude » = plus d'une série sous sa cible (K)
  var SERIES_MAX = 5;                    // G4 : une série de plus seulement sous 5 séries (K, D8)
  // G4 : ~11 séries fractionnaires d'un muscle par séance (Remmert, Pelland et al. 2025, préprint) (s) — `PAR_SEANCE`.
  var MARGE_SEANCE = 2;                  // G4 : au plus la taille habituelle d'une séance + 2 séries (K)
  var NOUVEAU_MIN = 2, NOUVEAU_MAX = 3;  // G4 : un exercice ajouté prend ses séries habituelles, bornées à 2-3 (K)
  var TOURS = 200;                       // le garde-fou des boucles (jamais atteint sur les cas)
  // L'ÉTAGE d'un muscle (C) : un exercice ajouté va dans une séance du même étage ; le tronc va partout. Les zones sont
  // celles du radar (`Semaine.ZONES`) ; le bas du dos va avec le bas du corps (la chaîne postérieure), pas avec le dos.
  var ETAGE_DES_ZONES = { poitrine: 'haut', dos: 'haut', epaules: 'haut', bras: 'haut', jambes: 'bas', tronc: null };
  var BAS_DU_DOS = 'bas_du_dos';
  var MESURES_COMBLABLES = ['charge_reps', 'reps'];

  function etageDe(muscle) {
    if (muscle === BAS_DU_DOS) return 'bas';
    var z = racine.THSemaine.zoneDuMuscle(muscle);
    return z && possede(ETAGE_DES_ZONES, z.cle) ? ETAGE_DES_ZONES[z.cle] : undefined;
  }

  // Un exercice qu'on peut ajouter ou charger d'une série : jamais une habileté (C), jamais une barre lourde (C),
  // seulement mesuré en charge × reps ou en reps.
  function comblable(slug, cat) {
    var f = ficheDu(cat, slug) || {};
    return !f.habilete && !estBarreLourde(slug, cat) && contient(MESURES_COMBLABLES, f.mesure);
  }

  function completer(entree) {
    var Semaine = racine.THSemaine;
    var e = entree || {}, cat = e.catalogue || {}, vol = e.volume || {}, hab = e.habitudes || {}, fois = e.fois || {};
    var seche = (e.profil || {}).phase === 'seche';
    var prio = liste(e.priorites);
    // 66D — les changements que la personne a RETIRÉS dans l'aperçu : retirer ne remplace rien (§5 quater.5).
    // `muscles` : rien n'est ajouté pour eux (G4) ; `reprises` : ces séances ne reviennent pas, et aucune autre ne vient
    // à leur place ; `tirage` : G5 ne joue pas. `ecartes` (« Je n'en veux pas ») : jamais ajoutés. Absents : 66C.
    var refus = e.refus || {};
    var refusMuscles = liste(refus.muscles), refusReprises = liste(refus.reprises), ecartes = liste(e.ecartes);
    var journal = [];
    var ponderes = function (slug) { return Semaine.musclesPonderes(ficheDu(cat, slug) || {}); };
    var copieRoutine = function (r) {
      return { nom: r.nom, derniere: r.derniere, exercices: liste(r.exercices).map(function (x) { return Object.assign({}, x); }) };
    };

    // G3 — les séances : les cochées, puis les décochées les plus récentes tant qu'il en manque.
    var deduit = liste(e.deduit);
    var rs = deduit.filter(function (r) { return r.cochee; }).map(copieRoutine);
    var restantes = trier(deduit.filter(function (r) { return !r.cochee; }), function (a, b) {
      return a.derniere < b.derniere ? 1 : (a.derniere > b.derniere ? -1 : 0);
    });
    var sautees = 0;
    for (var i0 = 0; i0 < restantes.length; i0++) {
      if (rs.length + sautees >= hab.seances_par_semaine) break;
      if (contient(refusReprises, restantes[i0].nom)) { sautees += 1; continue; }   // retirée : sa place reste vide
      rs.push(copieRoutine(restantes[i0]));
      journal.push({ type: 'reprise', routine: restantes[i0].nom });
    }

    var volumeSemaine = function () {
      var v = {};
      MUSCLES.forEach(function (m) { v[m] = 0; });
      rs.forEach(function (r) {
        r.exercices.forEach(function (x) {
          ponderes(x.exercise_slug).forEach(function (p) { v[p.muscle] = (v[p.muscle] || 0) + p.poids * x.series; });
        });
      });
      return v;
    };
    var dansSeance = function (r, m) {
      var t = 0;
      r.exercices.forEach(function (x) {
        ponderes(x.exercise_slug).forEach(function (p) { if (p.muscle === m) t += p.poids * x.series; });
      });
      return t;
    };
    var taille = function (r) { return r.exercices.reduce(function (t, x) { return t + x.series; }, 0); };
    var primaires = function (slug) { return liste((ficheDu(cat, slug) || {}).muscles_primaires); };

    // G2 — la cible : le 3e quartile ; un muscle d'une zone prioritaire, hors sèche : le plus haut.
    var cible = {}, cibles = [];
    MUSCLES.forEach(function (m) {
      var f = vol[m];
      if (!f || contient(refusMuscles, m)) return;
      var z = Semaine.zoneDuMuscle(m);
      cible[m] = (z && contient(prio, z.cle) && !seche) ? f.max : f.seuil;
      cibles.push(m);
    });

    // Ajouter `n` séries de `slug` dans `r` : aucun muscle au-dessus de son plus haut volume (S + K), ni de ~11 dans
    // la séance (s) ; la séance au plus sa taille habituelle + 2 (K).
    var permis = function (slug, n, v, r) {
      var p = ponderes(slug);
      for (var k = 0; k < p.length; k++) {
        var f = vol[p[k].muscle];
        if (f && (v[p[k].muscle] || 0) + p[k].poids * n > f.max + 1e-9) return false;
        if (dansSeance(r, p[k].muscle) + p[k].poids * n > PAR_SEANCE + 1e-9) return false;
      }
      return taille(r) + n <= hab.taille_de_seance + MARGE_SEANCE;
    };

    // Une série de plus là où `m` est principal (moins de 5 séries) : la ligne la moins chargée, puis la première
    // routine, puis le premier exercice.
    var uneSerie = function (m, v, motif) {
      var meilleur = null;
      rs.forEach(function (r) {
        r.exercices.forEach(function (x) {
          var s = x.exercise_slug;
          if (!contient(primaires(s), m)) return;
          if (x.series >= SERIES_MAX || !comblable(s, cat) || !permis(s, 1, v, r)) return;
          if (!meilleur || x.series < meilleur.x.series) meilleur = { r: r, x: x };
        });
      });
      if (!meilleur) return false;
      journal.push({ type: 'serie', motif: motif, muscle: m, routine: meilleur.r.nom,
                     exercise_slug: meilleur.x.exercise_slug, de: meilleur.x.series, a: meilleur.x.series + 1 });
      meilleur.x.series += 1;
      return true;
    };

    // Son exercice le plus fait pour `m` (principal), absent du programme, dans une séance du même étage, la moins
    // longue puis la première ; ses séries habituelles (2 à 3 ; 2 s'il ne reste que la place) et ses reps habituelles.
    var unExercice = function (m, v, motif) {
      var dedans = {};
      rs.forEach(function (r) { r.exercices.forEach(function (x) { dedans[x.exercise_slug] = true; }); });
      var cands = Object.keys(fois).filter(function (s) {
        return !dedans[s] && !contient(ecartes, s) && possede(cat, s) && comblable(s, cat) && contient(primaires(s), m);
      }).sort(function (a, b) { return (fois[b] - fois[a]) || (a < b ? -1 : (a > b ? 1 : 0)); });
      var seriesHab = hab.series || {}, repsHab = hab.reps || {};
      for (var c = 0; c < cands.length; c++) {
        var s = cands[c];
        var voulu = Math.min(NOUVEAU_MAX, Math.max(NOUVEAU_MIN, possede(seriesHab, s) ? seriesHab[s] : NOUVEAU_MAX));
        var place = null;
        for (var i = 0; i < rs.length; i++) {
          var r = rs[i], n = null;
          for (var k = voulu; k >= NOUVEAU_MIN; k--) if (permis(s, k, v, r)) { n = k; break; }
          if (n === null) continue;
          var etage = etageDe(m);
          var meme = etage === null || r.exercices.some(function (x) {
            return primaires(x.exercise_slug).some(function (mm) { return etageDe(mm) === etage; });
          });
          if (meme && (!place || taille(r) < place.taille)) place = { taille: taille(r), n: n, r: r };
        }
        if (!place) continue;
        var reps = possede(repsHab, s) ? repsHab[s] : null;
        place.r.exercices.push({ exercise_slug: s, series: place.n, reps: reps, chauffes: 0 });
        journal.push({ type: 'exercice', motif: motif, muscle: m, routine: place.r.nom, exercise_slug: s,
                       series: place.n, reps: reps });
        return true;
      }
      return false;
    };

    // G4 — combler les muscles sous leur cible, le plus grand écart d'abord (à égalité : l'ordre de `MUSCLES`).
    var bloques = {};
    for (var t = 0; t < TOURS; t++) {
      var v = volumeSemaine();
      var manque = cibles.filter(function (m) { return !bloques[m] && v[m] < cible[m] - ECART; });
      if (!manque.length) break;
      manque = trier(manque, function (a, b) {
        var ea = -(cible[a] - v[a]), eb = -(cible[b] - v[b]);
        return ea < eb ? -1 : (ea > eb ? 1 : MUSCLES.indexOf(a) - MUSCLES.indexOf(b));
      });
      var m0 = manque[0];
      if (!(uneSerie(m0, v, 'habitude') || unExercice(m0, v, 'habitude'))) bloques[m0] = true;
    }

    // G5 — au moins autant de tirage que de poussée (séries directes, les définitions de la relecture), par les mêmes
    // gestes, pour le grand dorsal puis le haut du dos (C).
    var tiragePoussee = function () {
      var tp = { tirage: 0, poussee: 0 };
      rs.forEach(function (r) {
        r.exercices.forEach(function (x) {
          if (estTirage(ficheDu(cat, x.exercise_slug))) tp.tirage += x.series;
          if (estPoussee(x.exercise_slug, cat)) tp.poussee += x.series;
        });
      });
      return tp;
    };
    for (var u = 0; u < (refus.tirage ? 0 : TOURS); u++) {
      var tp = tiragePoussee();
      if (tp.tirage >= tp.poussee) break;
      var v2 = volumeSemaine();
      if (!TIRAGE.some(function (m) { return uneSerie(m, v2, 'tirage') || unExercice(m, v2, 'tirage'); })) break;
    }

    var vf = volumeSemaine(), tpf = tiragePoussee();
    return {
      routines: rs.map(function (r) { return { nom: r.nom, exercices: r.exercices }; }),
      journal: journal,
      // Un muscle retiré n'a pas de cible : il n'y est pas (66D).
      sous_habitude: MUSCLES.filter(function (m) { return possede(cible, m) && vf[m] < cible[m] - ECART; }),
      tirage: tpf.tirage,
      poussee: tpf.poussee
    };
  }

  // LES INVARIANTS DU COMPLÉMENT (§5 quater.3) : V1 rien n'est retiré ; V2 aucune habileté ajoutée ; V3 aucune barre
  // lourde ajoutée ; V4 aucune séance au-delà de sa taille habituelle + 2 (sauf si elle l'était déjà) ; V5 aucun muscle
  // poussé au-dessus de son plus haut volume par un ajout. Rend la liste des fautes (vide : le complément tient).
  function verifierComplement(entree, sortie) {
    var Semaine = racine.THSemaine;
    var e = entree || {}, s = sortie || {}, cat = e.catalogue || {}, vol = e.volume || {}, hab = e.habitudes || {};
    var fautes = [];
    var ponderes = function (slug) { return Semaine.musclesPonderes(ficheDu(cat, slug) || {}); };
    var avant = {};
    liste(e.deduit).forEach(function (r) {
      var a = {};
      liste(r.exercices).forEach(function (x) { a[x.exercise_slug] = x.series; });
      avant[r.nom] = a;
    });
    liste(s.routines).forEach(function (r) {
      var a = possede(avant, r.nom) ? avant[r.nom] : {};
      liste(r.exercices).forEach(function (x) {
        var deja = possede(a, x.exercise_slug);
        if (deja && x.series < a[x.exercise_slug]) fautes.push('V1 une série retirée');
        if (!deja && (ficheDu(cat, x.exercise_slug) || {}).habilete) fautes.push('V2 une habileté ajoutée');
        if (!deja && estBarreLourde(x.exercise_slug, cat)) fautes.push('V3 une barre lourde ajoutée');
      });
      var total = liste(r.exercices).reduce(function (t, x) { return t + x.series; }, 0);
      var avantTotal = Object.keys(a).reduce(function (t, k) { return t + a[k]; }, 0);
      if (total > Math.max(avantTotal, hab.taille_de_seance + MARGE_SEANCE)) fautes.push('V4 une séance au-delà de sa taille + 2');
    });
    var tot = {}, tot0 = {};
    MUSCLES.forEach(function (m) { tot[m] = 0; tot0[m] = 0; });
    liste(s.routines).forEach(function (r) {
      liste(r.exercices).forEach(function (x) {
        ponderes(x.exercise_slug).forEach(function (p) { tot[p.muscle] = (tot[p.muscle] || 0) + p.poids * x.series; });
      });
    });
    liste(e.deduit).forEach(function (r) {
      var reprise = liste(s.journal).some(function (j) { return j.type === 'reprise' && j.routine === r.nom; });
      if (!r.cochee && !reprise) return;
      liste(r.exercices).forEach(function (x) {
        ponderes(x.exercise_slug).forEach(function (p) { tot0[p.muscle] = (tot0[p.muscle] || 0) + p.poids * x.series; });
      });
    });
    MUSCLES.forEach(function (m) {
      var f = vol[m];
      if (f && tot[m] > Math.max(f.max, tot0[m]) + 1e-9) fautes.push('V5 ' + m + ' au-dessus de son plus haut volume');
    });
    return fautes;
  }

  // ══ LA FIN DU GÉNÉRATEUR (66D, QUESTIONNAIRE-COACH-V2 §5 quater.4-5) ══════════════════════════════════════════
  //
  // Trois fonctions pures à la suite de `completer`, sous la garde (`GARDEES`) : `ranger` (G6, l'ordre), `associer`
  // (G7, les supersets) et `habiller` (une ligne déduite devient une place de l'aperçu) ; puis `changementsDeLApercu`,
  // les lignes de « Ce que j'ai changé ». La référence est `tests/unit/fixtures/gen66d.py` (Claude.ai, 10/10/2026) ;
  // ses seize cas, `cas-66d-generateur.json`, sont rejoués à l'identique par `tests/unit/v2-generateur-fin.test.js`.
  // Elles lisent les définitions existantes : le polyarticulaire et la sortie (`Moteur.estPolyarticulaire`,
  // `Moteur.aDesMuscles`), la durée (`Moteur.dureeEstimee`, le repos du superset `Moteur.DUREE_PAR_DEFAUT`), la barre
  // lourde, le tirage et la poussée (ci-dessus), le motif (`motifDe`), le nom d'un muscle (`Semaine.libelleMuscle`).

  // G6 — LE RANG d'un exercice (NSCA, C) : sa place dans `ROLES` — une barre lourde 0 (P), un polyarticulaire 1 (S),
  // une isolation 2 (I), le tronc 3 (T : seul principal, les abdominaux) ; une sortie (cardio) n'a pas de rang (`null`).
  function rangDe(slug, cat) {
    var Moteur = racine.THMoteur, f = ficheDu(cat, slug) || {};
    var prim = liste(f.muscles_primaires);
    var s = { prim: prim, sec: liste(f.muscles_secondaires), stab: liste(f.muscles_stabilisateurs) };
    if (!Moteur.aDesMuscles(s)) return null;
    if (estBarreLourde(slug, cat)) return ROLES.indexOf('P');
    if (prim.length === 1 && prim[0] === TRONC) return ROLES.indexOf('T');
    return ROLES.indexOf(Moteur.estPolyarticulaire(s) ? 'S' : 'I');
  }

  // `ranger(entree)` — `{ routines, journal, catalogue }`. On ne réordonne pas les séances d'une personne : seul un
  // exercice AJOUTÉ (journal `exercice`, dans l'ordre du journal) se place avant le premier exercice, à partir du 2e,
  // de rang strictement plus grand que le sien (une sortie, à partir du 2e, compte comme la fin) ; aucun : à la fin.
  // Le premier exercice de la séance reste le premier. Rend les routines `[{ nom, exercices }]`.
  function ranger(entree) {
    var e = entree || {}, cat = e.catalogue || {};
    var rs = liste(e.routines).map(function (r) {
      return { nom: r.nom, exercices: liste(r.exercices).map(function (x) { return Object.assign({}, x); }) };
    });
    liste(e.journal).forEach(function (j) {
      if (j.type !== 'exercice') return;
      var r = rs.filter(function (x) { return x.nom === j.routine; })[0];
      if (!r) return;
      var k0 = -1;
      for (var k = 0; k < r.exercices.length && k0 < 0; k++) if (r.exercices[k].exercise_slug === j.exercise_slug) k0 = k;
      if (k0 < 0) return;
      var l = r.exercices.splice(k0, 1)[0];
      var mien = rangDe(l.exercise_slug, cat);
      var pos = r.exercices.length;
      for (var k2 = 1; k2 < r.exercices.length; k2++) {
        var autre = rangDe(r.exercices[k2].exercise_slug, cat);
        if (autre === null || autre > mien) { pos = k2; break; }
      }
      r.exercices.splice(pos, 0, l);
    });
    return rs;
  }

  // G7 — LES PAIRES ANTAGONISTES (Zhang, Weakley et al. 2025, S ; les paires du même muscle font baisser le volume) :
  // tirage et poussée (les définitions de la relecture), biceps et triceps, quadriceps et ischio-jambiers, au premier
  // principal.
  var PAIRES = [['tirage', 'poussee'], ['biceps', 'triceps'], ['quadriceps', 'ischios']];
  var ISCHIOS = 'ischio_jambiers', QUADRICEPS = 'quadriceps';

  function familleAntagoniste(slug, cat) {
    var f = ficheDu(cat, slug) || {}, prim = liste(f.muscles_primaires);
    if (estTirage(f)) return 'tirage';
    if (estPoussee(slug, cat)) return 'poussee';
    if (contient(prim, 'biceps')) return 'biceps';
    if (contient(prim, 'triceps')) return 'triceps';
    if (contient(prim, QUADRICEPS) && !contient(prim, ISCHIOS)) return 'quadriceps';
    if (contient(prim, ISCHIOS) && !contient(prim, QUADRICEPS)) return 'ischios';
    return null;
  }
  function antagonistes(a, b) {
    return PAIRES.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); });
  }

  // `associer(entree)` — `{ routines, structures, cible_min, catalogue, refus_paires: [[séance, a, b]] }`. Les
  // `structures` sont celles que l'app calcule pour la routine telle qu'elle sera créée : elles se LISENT. Seulement
  // quand le temps manque (`cible_min` non nulle) : tant que l'estimation d'une séance dépasse la cible, la paire
  // permise qui économise le plus (le premier membre perd son repos, `séries × (repos − repos du superset)`), à
  // égalité la plus proche, puis la plus haute ; le second membre remonte juste après le premier. Permise : deux
  // antagonistes de même classe, ni le premier exercice ni le premier polyarticulaire de la séance (son repos de
  // 180 s), ni une barre lourde, ni une habileté, ni une sortie, mesurés en charge × reps ou en reps, chacun dans une
  // seule paire, aucun des deux dans une paire retirée (dans SA séance). Aucune : la séance reste telle quelle (le
  // raccourci joue ensuite, inchangé). Rend `{ routines (chaque ligne avec `groupe_superset`), journal }`.
  function associer(entree) {
    var Moteur = racine.THMoteur;
    var REPOS_SUPERSET = Moteur.DUREE_PAR_DEFAUT.reposSuperset;
    var e = entree || {}, cat = e.catalogue || {}, cible = e.cible_min;
    var sansCible = cible === null || cible === undefined;
    var refuse = {};
    liste(e.refus_paires).forEach(function (p) { liste(p).slice(1).forEach(function (s) { refuse[p[0] + '\u0000' + s] = true; }); });
    var structures = liste(e.structures);
    var sortie = [], journal = [];
    liste(e.routines).forEach(function (r, ir) {
      var lignes = liste(r.exercices).map(function (x) { return Object.assign({}, x, { groupe_superset: null }); });
      var S = liste(structures[ir]).map(function (x) { return Object.assign({}, x); });
      if (sansCible) { sortie.push({ nom: r.nom, exercices: lignes }); return; }
      var premier = null;
      for (var p0 = 0; p0 < S.length && premier === null; p0++) if (Moteur.estPolyarticulaire(S[p0])) premier = S[p0].slug;
      var groupe = 0, avant = Moteur.dureeEstimee(S), aJoue = false;
      var apte = function (k) {
        var x = lignes[k], s = x.exercise_slug, f = ficheDu(cat, s) || {};
        return k !== 0 && s !== premier && !refuse[r.nom + '\u0000' + s] && x.groupe_superset === null &&
          !estBarreLourde(s, cat) && !f.habilete && contient(MESURES_COMBLABLES, f.mesure) && Moteur.aDesMuscles(S[k]) &&
          familleAntagoniste(s, cat) !== null && S[k].repos !== null && S[k].repos !== undefined;
      };
      while (Moteur.dureeEstimee(S) > cible * 60) {
        var meilleur = null;
        for (var i = 0; i < lignes.length; i++) {
          if (!apte(i)) continue;
          for (var j = i + 1; j < lignes.length; j++) {
            if (!apte(j)) continue;
            if (!antagonistes(familleAntagoniste(lignes[i].exercise_slug, cat), familleAntagoniste(lignes[j].exercise_slug, cat))) continue;
            if (Moteur.estPolyarticulaire(S[i]) !== Moteur.estPolyarticulaire(S[j])) continue;
            var gain = (S[i].tr || 0) * (S[i].repos - REPOS_SUPERSET);
            if (gain <= 0) continue;
            // La plus grosse économie, à égalité la plus proche, puis la plus haute.
            if (!meilleur || gain > meilleur.gain || (gain === meilleur.gain &&
                (j - i < meilleur.j - meilleur.i || (j - i === meilleur.j - meilleur.i && i < meilleur.i)))) {
              meilleur = { i: i, j: j, gain: gain };
            }
          }
        }
        if (!meilleur) break;
        var a = meilleur.i, b = meilleur.j;
        groupe += 1;
        var lb = lignes.splice(b, 1)[0], sb = S.splice(b, 1)[0];
        lignes.splice(a + 1, 0, lb); S.splice(a + 1, 0, sb);
        lignes[a].groupe_superset = lignes[a + 1].groupe_superset = groupe;
        S[a].repos = null;
        aJoue = true;
        journal.push({ type: 'superset', routine: r.nom, a: lignes[a].exercise_slug, b: lignes[a + 1].exercise_slug,
                       gain_s: meilleur.gain });
      }
      if (aJoue) journal.push({ type: 'duree', routine: r.nom, de_s: avant, a_s: Moteur.dureeEstimee(S) });
      sortie.push({ nom: r.nom, exercices: lignes });
    });
    return { routines: sortie, journal: journal };
  }

  // LES INVARIANTS DES SUPERSETS (§5 quater.4 bis) : V6 aucune ligne changée (exercice, séries, reps) ; V7 une paire
  // est de deux exercices contigus, et aucune sans cible ; V8 jamais une barre lourde ; V9 toujours deux antagonistes.
  function verifierAssociation(entree, sortie) {
    var e = entree || {}, s = sortie || {}, cat = e.catalogue || {};
    var fautes = [];
    var cles = function (r) {
      return liste(r && r.exercices).map(function (x) { return JSON.stringify([x.exercise_slug, x.series, x.reps]); }).sort();
    };
    var avant = liste(e.routines), apres = liste(s.routines);
    for (var ir = 0; ir < Math.min(avant.length, apres.length); ir++) {
      var r = apres[ir];
      if (JSON.stringify(cles(avant[ir])) !== JSON.stringify(cles(r))) fautes.push('V6 une ligne changée');
      var g = {}, ordre = [];
      liste(r.exercices).forEach(function (x, k) {
        var gs = x.groupe_superset;
        if (gs === null || gs === undefined) return;
        if (!possede(g, gs)) { g[gs] = []; ordre.push(gs); }
        g[gs].push(k);
      });
      ordre.forEach(function (gs) {
        var ks = g[gs];
        if (ks.length !== 2 || ks[1] !== ks[0] + 1) { fautes.push('V7 une paire non contiguë'); return; }
        var a = r.exercices[ks[0]].exercise_slug, b = r.exercices[ks[1]].exercise_slug;
        if (estBarreLourde(a, cat) || estBarreLourde(b, cat)) fautes.push('V8 une barre lourde en superset');
        if (!antagonistes(familleAntagoniste(a, cat), familleAntagoniste(b, cat))) fautes.push('V9 une paire non antagoniste');
      });
      if ((e.cible_min === null || e.cible_min === undefined) && ordre.length) fautes.push('V7 un superset sans manque de temps');
    }
    return fautes;
  }

  // `habiller(catalogue, ligne, entree)` — une ligne du programme déduit devient une place de l'aperçu (§5 quater.5),
  // comme celles du gabarit (`ligne()`) : `motif` = `motifDe`, `role` d'après le rang (une sortie : `null`), `menage` et
  // `barre_fixe`, les reps d'une ligne ménagée au moins celles d'un secondaire, la charnière bornée — par les MÊMES
  // définitions que `ligne()`. Ses séries et ses chauffes habituelles restent les siennes. Rien n'est modifié en place.
  function habiller(catalogue, l, entree) {
    var p = entree || {}, x = l || {}, slug = x.exercise_slug;
    var motif = motifDe(slug), rang = rangDe(slug, catalogue || {});
    var menage = estMenagee(motif, p.menager);
    return { exercise_slug: slug, motif: motif, role: rang === null ? null : ROLES.charAt(rang), series: x.series,
             reps: repsDeLaPlace(x.reps, motif, menage, p.objectif), prioritaire: contient(liste(p.priorites), slug),
             menage: menage, barre_fixe: demandeUneBarreFixe(slug, (catalogue || {})[slug]), chauffes: x.chauffes || 0 };
  }

  // « CE QUE J'AI CHANGÉ » (§5 quater.5) — des faits, sans « parce que » (VOIX). `journalCompl` : celui de
  // `completer` ; `journalAssoc` : celui d'`associer` ; `refus` : `{ muscles, reprises, tirage, paires: [[séance, a,
  // b]] }` ; `nommer(slug)`. Rend `[{ cle, texte, retire }]` : les changements dans l'ordre des journaux (les séries de
  // plus d'un même exercice, pour une même clé et une même séance, en une ligne : `de` le premier, `a` le dernier),
  // puis chaque clé refusée en une ligne `retire` — muscles, reprises, tirage, paires. Clés : `muscle:<muscle>`,
  // `tirage`, `reprise:<séance>`, `paire:<séance>:<a>:<b>`. Le second nom d'une phrase prend sa minuscule (maquette v2).
  //
  // 66D bis — `cartes` : les routines que montrent les cartes (après le raccourci de la durée et les voisins fondus).
  // LES NOMBRES D'UNE LIGNE SONT CEUX DE LA CARTE (VOIX : un libellé ne contredit jamais son chiffre) : un ajout dit
  // ses séries restantes, une série de plus `{de} → {séries restantes}` ; un changement que le raccourci a entièrement
  // repris (l'ajout absent de la carte, plus aucune série au-delà de `de`) ne se dit pas, et une paire dont un membre
  // n'est plus dans le même superset de la carte non plus. Sans `cartes`, les nombres du journal.
  function changementsDeLApercu(journalCompl, journalAssoc, refus, nommer, cartes) {
    var Semaine = racine.THSemaine;
    var rf = refus || {}, nom = nommer || function (s) { return s; };
    var avecCartes = cartes !== undefined && cartes !== null;
    var carteDe = function (seance) { return liste(cartes).filter(function (r) { return r && r.nom === seance; })[0] || null; };
    // Les séries d'un exercice dans la carte de sa séance (0 : il n'y est plus).
    var seriesDansLaCarte = function (seance, slug) {
      return liste((carteDe(seance) || {}).exercices).reduce(function (t, x) {
        return t + (x.exercise_slug === slug ? (Number(x.series) || 0) : 0);
      }, 0);
    };
    var groupeDansLaCarte = function (seance, slug) {
      var x = liste((carteDe(seance) || {}).exercices).filter(function (y) { return y.exercise_slug === slug; })[0];
      return x && x.groupe_superset !== null && x.groupe_superset !== undefined ? x.groupe_superset : null;
    };
    var bas = function (t) { t = String(t); return t.charAt(0).toLowerCase() + t.slice(1); };
    var cleDe = function (j) { return j.motif === 'tirage' ? 'tirage' : 'muscle:' + j.muscle; };
    var lignes = [], series = {};
    liste(journalCompl).forEach(function (j) {
      if (j.type === 'reprise') {
        lignes.push({ cle: 'reprise:' + j.routine, texte: j.routine + ' revient.', retire: false });
      } else if (j.type === 'serie') {
        var id = JSON.stringify([cleDe(j), j.routine, j.exercise_slug]);
        if (possede(series, id)) { series[id].a = j.a; return; }
        series[id] = { cle: cleDe(j), j: j, de: j.de, a: j.a };
        lignes.push(series[id]);
      } else if (j.type === 'exercice') {
        var n = avecCartes ? seriesDansLaCarte(j.routine, j.exercise_slug) : j.series;
        if (n <= 0) return;                                  // le raccourci l'a repris : rien à dire, rien à retirer
        var combien = j.reps === null || j.reps === undefined ? n + ' séries' : n + ' × ' + j.reps;
        lignes.push({ cle: cleDe(j), texte: nom(j.exercise_slug) + ' ' + combien + ' dans ' + j.routine + '.', retire: false });
      }
    });
    lignes = lignes.filter(function (l) {
      if (!l.j || !avecCartes) return true;
      l.a = seriesDansLaCarte(l.j.routine, l.j.exercise_slug);
      return l.a > l.de;                                      // plus aucune série au-delà de `de` : rien à dire
    }).map(function (l) {
      if (!l.j) return l;
      return { cle: l.cle, texte: nom(l.j.exercise_slug) + ' : ' + l.de + ' → ' + l.a + ' séries dans ' + l.j.routine + '.',
               retire: false };
    });
    liste(journalAssoc).forEach(function (j) {
      if (j.type !== 'superset') return;
      if (avecCartes) {
        var ga = groupeDansLaCarte(j.routine, j.a);
        if (ga === null || ga !== groupeDansLaCarte(j.routine, j.b)) return;   // ce n'est plus une paire
      }
      lignes.push({ cle: 'paire:' + j.routine + ':' + j.a + ':' + j.b,
                    texte: nom(j.a) + ' et ' + bas(nom(j.b)) + ' en superset dans ' + j.routine + ' : ≈ ' +
                      Math.round(j.gain_s / 60) + ' min de moins.', retire: false });
    });
    liste(rf.muscles).forEach(function (m) {
      lignes.push({ cle: 'muscle:' + m, texte: Semaine.libelleMuscle(m) + ' : rien d\u2019ajouté.', retire: true });
    });
    liste(rf.reprises).forEach(function (n) {
      lignes.push({ cle: 'reprise:' + n, texte: n + ' ne revient pas.', retire: true });
    });
    if (rf.tirage) lignes.push({ cle: 'tirage', texte: 'Tirage : rien d\u2019ajouté.', retire: true });
    liste(rf.paires).forEach(function (p) {
      lignes.push({ cle: 'paire:' + p[0] + ':' + p[1] + ':' + p[2],
                    texte: nom(p[1]) + ' et ' + bas(nom(p[2])) + ' en séries classiques.', retire: true });
    });
    return lignes;
  }

  var api = {
    // 188-1 — tirage et poussée : UNE définition, lue par les cartes d'équilibre de la semaine (`equilibres.js`).
    estTirage: estTirage,
    estPoussee: estPoussee,
    familleDeBarre: familleDeBarre,
    MOTIFS: MOTIFS,
    GABARITS: GABARITS,
    FAMILLES: FAMILLES,
    familleApplicable: familleApplicable,
    VOISIN: VOISIN,
    demandeUneBarreFixe: demandeUneBarreFixe,
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
    lieesDe: lieesDe,
    remplacePar: remplacePar,
    pourquoi: pourquoi,
    mentionsDeLigne: mentionsDeLigne,
    zonesQueChargeLExercice: zonesQueChargeLExercice,
    placerLesJambesLourdes: placerLesJambesLourdes, phrasesHybrides: phrasesHybrides, NOMS_DES_JOURS: NOMS_DES_JOURS,
    phrasesDeLApercu: phrasesDeLApercu,
    exemptsDuRaccourci: exemptsDuRaccourci,
    exemptsDesPriorites: exemptsDesPriorites,
    carteCycles: carteCycles,
    // 66A — la relecture de la semaine (QUESTIONNAIRE-COACH-V2 §5 ter)
    BARRES: BARRES,
    // 108 (MOTEUR §10 bis) — la barre lourde, lue par « Ma salle » : une barre olympique n'est pas une barre fixe.
    estBarreLourde: estBarreLourde,
    SECHE_DEPASSEMENT: SECHE_DEPASSEMENT,
    PAR_SEANCE: PAR_SEANCE,
    PEU_TRAVAILLE: PEU_TRAVAILLE,
    MUSCLES_SUIVIS: MUSCLES_SUIVIS,
    MUSCLES: MUSCLES,
    relireSemaine: relireSemaine,
    verifierRelecture: verifierRelecture,
    // 66C — le programme déduit complété (QUESTIONNAIRE-COACH-V2 §5 quater.3)
    ECART: ECART,
    SERIES_MAX: SERIES_MAX,
    MARGE_SEANCE: MARGE_SEANCE,
    completer: completer,
    verifierComplement: verifierComplement,
    // 66D — la fin : l'ordre, les supersets, l'aperçu (QUESTIONNAIRE-COACH-V2 §5 quater.4-5)
    ranger: ranger,
    associer: associer,
    verifierAssociation: verifierAssociation,
    habiller: habiller,
    changementsDeLApercu: changementsDeLApercu
  };

  racine.THGenerateur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
