// v2/js/profil.js — les règles du profil, de l'inscription et du pseudo.
//
// Module PUR : aucune dépendance au DOM, au réseau, à Supabase. Les référentiels
// (discipline, matériel, ancienneté…), la phrase du bandeau, le verdict d'un
// pseudo et la liste des champs qu'on a le droit d'écrire vivent ici, et se
// testent sans navigateur.
//
// ⚠️ LES LISTES SONT CELLES DE LA BASE, RELEVÉES SUR LES CONTRAINTES — pas
// supposées. `profiles_mode_ok`, `profiles_materiel_ok`, `profiles_anciennete_ok`,
// `profiles_niveau_ok`, `profiles_sexe_ok`, `profiles_unites_ok`,
// `profiles_intention_ok` : une valeur hors liste est refusée par Postgres, donc
// une faute de frappe ici devient un 23514 à l'écriture, pas un défaut visible.
//
// UN SEUL CRITÈRE GOUVERNE CHAQUE CHAMP (ECRAN-PROFIL-V1) : quelque chose le
// lit, ou le lira au chantier 1. Rien n'est demandé « au cas où ». C'est
// pourquoi on ne trouvera ici ni score articulaire, ni objectif de barre, ni
// style de coaching — la v1 les collectait, et personne ne sait ce qu'ils valent.

(function (racine) {
  'use strict';

  // ── Référentiels ─────────────────────────────────────────────────────────

  // ⚠️ `bien_etre` EST ACCEPTÉ PAR LA BASE ET N'EST PAS PROPOSÉ (§2.3).
  // « Bien-être n'est pas une discipline » : quelqu'un qui s'entraîne pour se
  // maintenir fait la même musculation, il ne veut simplement pas qu'on le
  // pousse — et c'est l'INTENTION qui le dit. On garde quand même son libellé :
  // une ligne qui le porte déjà doit s'afficher, pas se vider.
  var DISCIPLINES = [
    { cle: 'musculation', libelle: 'Musculation' },
    { cle: 'powerbuilding', libelle: 'Powerbuilding' },
    { cle: 'powerlifting', libelle: 'Powerlifting' },
    { cle: 'calisthenics', libelle: 'Calisthénie' }
  ];
  var DISCIPLINES_CONNUES = DISCIPLINES.concat([
    { cle: 'bien_etre', libelle: 'Bien-être' }
  ]);

  var MATERIELS = [
    { cle: 'salle_complete', libelle: 'Salle complète', sous: 'Barres, machines, poulies' },
    { cle: 'salle_basique', libelle: 'Salle basique', sous: 'Barres et haltères, peu de machines' },
    { cle: 'maison_equipee', libelle: 'Maison équipée', sous: 'Barre, rack, haltères' },
    { cle: 'maison_minimal', libelle: 'Maison, minimum', sous: 'Haltères ou élastiques' },
    { cle: 'poids_du_corps', libelle: 'Poids du corps', sous: 'Rien d’autre' }
  ];

  // EN FOURCHETTE, PAS UNE DATE (§2.2). « Depuis quand régulièrement » — on peut
  // s'entraîner depuis cinq ans et rester débutant, et une date exacte
  // demanderait une précision que personne n'a.
  var ANCIENNETES = [
    { cle: 'moins_1_an', libelle: 'Moins d’un an' },
    { cle: '1_a_3_ans', libelle: '1 à 3 ans' },
    { cle: '3_a_5_ans', libelle: '3 à 5 ans' },
    { cle: 'plus_5_ans', libelle: 'Plus de 5 ans' }
  ];

  var NIVEAUX = [
    { cle: 'debutant', libelle: 'Débutant' },
    { cle: 'intermediaire', libelle: 'Intermédiaire' },
    { cle: 'avance', libelle: 'Avancé' },
    { cle: 'expert', libelle: 'Expert' }
  ];

  var SEXES = [
    { cle: 'homme', libelle: 'Homme' },
    { cle: 'femme', libelle: 'Femme' },
    { cle: 'non_precise', libelle: 'Non précisé' }
  ];

  var UNITES = [
    { cle: 'kg', libelle: 'Kilogrammes' },
    { cle: 'lb', libelle: 'Livres' }
  ];

  // DEUX CRANS, ET C'EST UNE INTENTION (§2.3). En Entretenir, la double
  // progression n'a rien à dire : le moteur se tait sur la charge et garde le
  // repos, la structure, le suivi.
  //
  // 60-1 (QUESTIONNAIRE-COACH-V2 §4) — « JUSTE UN CARNET » est le nom, à
  // l'écran, d'Entretenir RENDU SILENCIEUX : la valeur en base reste
  // `entretien` (la contrainte `profiles_intention_ok` n'en connaît pas
  // d'autre), et le plan ne dit plus rien — ni charge, ni dégressive, ni
  // bandeau (I13, `sansCoach`). Le nom d'un EXERCICE en Entretenir (sa feuille
  // de zone) ne change pas : ce n'est pas le choix du profil.
  var INTENTIONS = [
    { cle: 'progresser', libelle: 'Progresser' },
    { cle: 'entretien', libelle: 'Juste un carnet' }
  ];

  // La section « POURQUOI » en entier, au même endroit que « Ton rythme » : la
  // phrase dépend du choix, et l'écran n'en écrit aucune. ⚠️ « Tes séries
  // restent pré-remplies » dit ce que fait la cascade du fantôme
  // (`Seance.fantome`) sans consigne : la charge de la dernière séance, les
  // reps de la routine d'abord, puis celles de la dernière séance. « Avec ta
  // dernière séance » seul serait faux pour les reps d'une routine qui en vise.
  // `ecrire` reçoit l'objet COMPLET : le nom de la colonne vit ici.
  function sectionIntention(profil, ecrire) {
    var intention = (profil && profil.intention) === 'entretien' ? 'entretien' : 'progresser';
    return {
      titre: 'POURQUOI',
      segment: {
        options: INTENTIONS,
        valeur: intention,
        surChoix: function (v) { ecrire({ intention: v }); }
      },
      note: intention === 'entretien'
        ? { fort: 'Je me tais :',
            reste: 'aucune proposition, aucune phrase. Tes séries restent pré-remplies avec ta routine et ta dernière séance.' }
        : { fort: 'Je propose des charges',
            reste: 'en mode Progresser. Avec « Juste un carnet », je me tais.' }
    };
  }

  // ── MOTEUR §9.8 — LE RÉGLAGE DE RYTHME ───────────────────────────────────
  //
  // Clés, libellés et PHRASES au même endroit : l'écran n'en écrit aucune, il
  // lit cette table. Une phrase recopiée dans `app.js` finirait par dire autre
  // chose que la spec, et personne ne verrait laquelle des deux a raison.
  //
  // Les CLÉS sont celles de la contrainte de `profiles.rythme_progression`
  // (`v2_046`) : une valeur hors liste est refusée par Postgres.
  //
  // ⚠️ LES PHRASES NE DISENT JAMAIS QU'UN RÉGLAGE EST MEILLEUR. Mesuré au banc
  // M11 : les montées tiennent 79 à 81 fois sur 100 quel que soit le réglage —
  // « Prudent est plus lent, pas plus sûr » est un fait pour qui conçoit le
  // moteur, jamais un argument à l'écran (CADRAGE §2 terdecies). Chaque phrase
  // dit CE QUE FAIT le réglage, et rien d'autre.
  var RYTHMES = [
    { cle: 'prudent', libelle: 'Prudent',
      phrase: 'Monte quand toutes tes séries touchent le haut de ta zone, ' +
              'deux séances de suite.' },
    { cle: 'normal', libelle: 'Normal',
      phrase: 'Monte quand tes deux premières séries touchent le haut de ta zone.' },
    { cle: 'franc', libelle: 'Franc',
      phrase: 'Dès qu\u2019une série touche le haut de ta zone, la charge monte, ' +
              'et deux crans d\u2019un coup quand tu dépasses nettement.' }
  ];

  // Le défaut de la colonne en base, répété ici parce que l'écran doit pouvoir
  // afficher un choix AVANT toute écriture : un profil créé avant `v2_046`, ou
  // relu d'un cache d'alors, n'a pas la valeur.
  var RYTHME_DEFAUT = 'normal';

  // Le rythme EFFECTIF : celui du profil, ou le défaut. Un seul endroit décide,
  // parce que l'écran s'en sert DEUX fois — pour marquer le bouton actif et
  // pour choisir la phrase — et que deux lectures divergentes afficheraient
  // « Normal » sous un bouton « Franc ».
  function rythmeDe(profil) {
    var cle = profil && profil.rythme_progression;
    for (var i = 0; i < RYTHMES.length; i++) if (RYTHMES[i].cle === cle) return cle;
    return RYTHME_DEFAUT;
  }

  // La phrase du rythme affiché. Une clé inconnue retombe sur celle du défaut :
  // l'écran ne reste jamais muet sous son propre sélecteur.
  function phraseRythme(cle) {
    for (var i = 0; i < RYTHMES.length; i++) if (RYTHMES[i].cle === cle) return RYTHMES[i].phrase;
    return phraseRythme(RYTHME_DEFAUT);
  }

  // ── LA SECTION « TON RYTHME », EN ENTIER ET AU MÊME ENDROIT ──────────────
  //
  // ⚠️ ELLE VIT ICI, PAS DANS `app.js`, ET LE BANC DE MUTATION L'A IMPOSÉ.
  //
  // Le test de l'écran ne rend pas `rendreProfilEcran` — il ne peut pas : cette
  // fonction referme sur la moitié d'`app.js`. Il REPRODUIT la déclaration des
  // sections, et son en-tête le dit depuis le chantier 46. Tant que la
  // déclaration ne portait que des libellés, la copie coûtait peu. Le rythme y
  // met une RÈGLE — la section n'existe pas en Entretenir — et une COLONNE
  // écrite : mutées dans `app.js`, ni l'une ni l'autre ne faisait tomber un
  // test, parce qu'aucun test ne lisait `app.js`.
  //
  // Déplacée ici, la règle est exercée par les tests ET par l'écran, qui
  // appellent la même fonction. `app.js` ne garde que le branchement.
  //
  // ⚠️ EN ENTRETENIR, LA SECTION N'EXISTE PAS — elle ne se grise pas. Le moteur
  // s'y tait sur la charge : un réglage de vitesse de montée n'y a rien à
  // régler, et l'afficher inerte promettrait un effet qu'il n'aurait pas.
  // Zones et consignes disparaissent pour la même raison (ECRAN-PROFIL §2.3).
  //
  // ⚠️ L'ABSENCE D'INTENTION VAUT « progresser », comme partout ailleurs sur cet
  // écran : un compte neuf voit son rythme, il n'a pas à choisir d'abord.
  //
  // `ecrire` reçoit l'objet COMPLET — c'est ici que le nom de la colonne est
  // connu, avec les clés et le défaut, et nulle part ailleurs.
  function sectionRythme(profil, ecrire) {
    var intention = (profil && profil.intention) || 'progresser';
    if (intention === 'entretien') return null;
    var cle = rythmeDe(profil);
    return {
      titre: 'TON RYTHME',
      segment: {
        options: RYTHMES,
        valeur: cle,
        surChoix: function (v) { ecrire({ rythme_progression: v }); }
      },
      note: { fort: phraseRythme(cle),
              reste: 'La prochaine consigne en tient compte.' }
    };
  }

  // ── MOTEUR §9.16 — LA PHASE (49-U11, 30/09/2026) ─────────────────────────
  //
  // Les CLÉS sont celles de la contrainte `profiles_phase_valeurs`
  // (`v2_051_profil_phase`) : `prise_de_masse`, `maintien`, `seche`, ou vide.
  // « Je ne sais pas » écrit le VIDE, et le vide se lit « maintien » : c'est
  // `phaseDe` qui le dit, une fois, pour l'écran comme pour le plan.
  var PHASES = [
    { cle: 'prise_de_masse', libelle: 'Prise de masse' },
    { cle: 'maintien', libelle: 'Maintien ou recomposition' },
    { cle: 'seche', libelle: 'Sèche' },
    { cle: 'inconnue', libelle: 'Je ne sais pas' }
  ];
  var PHASES_EN_BASE = ['prise_de_masse', 'maintien', 'seche'];
  var PHASE_DEFAUT = 'maintien';

  // La phase EFFECTIVE d'un profil : sa valeur si elle est connue, sinon
  // « maintien » (MOTEUR §9.16 : vide = maintien). Jamais vide.
  function phaseDe(profil) {
    var v = profil && profil.phase;
    return PHASES_EN_BASE.indexOf(v) >= 0 ? v : PHASE_DEFAUT;
  }

  // « Depuis le 29 sept. » : la date de la dernière déclaration, au format de
  // la voix (`THModele.quand` sans référence : toujours la date, jamais
  // « mardi » — la ligne se relit des semaines plus tard).
  function depuisPhase(profil) {
    var d = profil && profil.phase_depuis;
    if (!d || !racine.THModele) return null;
    var q = racine.THModele.quand(d);
    return q ? 'Depuis ' + q : null;
  }

  // LE GEL (MOTEUR §9.16) : la phase d'une séance se lit UNE fois et ne bouge
  // plus. `gel` : `{ seanceId, phase }`, le gel en cours ou `null` ; `sauvee` :
  // la phase gelée relue du disque pour cette séance (rechargement), ou `null`.
  // Même séance : le gel reste, quoi que dise le profil. Autre séance : la
  // phase sauvée, sinon celle du profil maintenant.
  function phaseGelee(gel, seanceId, sauvee, profil) {
    if (gel && gel.seanceId === seanceId) return gel;
    return { seanceId: seanceId, phase: PHASES_EN_BASE.indexOf(sauvee) >= 0 ? sauvee : phaseDe(profil) };
  }

  // ── LA SECTION « TA PHASE », À CÔTÉ DU RYTHME ────────────────────────────
  //
  // Le même composant et la même écriture que « Ton rythme » (`ecrire` =
  // `ecrireProfil`, local d'abord puis la file du profil). Elle existe aussi
  // en Entretenir : la phase est un fait sur l'utilisateur, pas un réglage du
  // moteur de charge. Choisir écrit `phase` ET `phase_depuis` (maintenant).
  // `maintenant` : l'horloge, passée pour les tests.
  function sectionPhase(profil, ecrire, maintenant) {
    var p = profil || {};
    var valeur = PHASES_EN_BASE.indexOf(p.phase) >= 0 ? p.phase : 'inconnue';
    return {
      titre: 'TA PHASE',
      aide: 'Ce que tu vises en ce moment. Je l’enregistre avec chaque séance.',
      segment: {
        options: PHASES,
        valeur: valeur,
        deuxColonnes: true,
        surChoix: function (v) {
          var quand = typeof maintenant === 'function' ? maintenant() : new Date();
          ecrire({ phase: v === 'inconnue' ? null : v, phase_depuis: quand.toISOString() });
        }
      },
      pied: depuisPhase(p)
    };
  }

  // Lundi en tête : la semaine de l'app commence le lundi (THSemaine), et les
  // deux listes doivent se lire dans le même ordre.
  var JOURS = [
    { cle: 'lun', libelle: 'Lundi', court: 'Lu' },
    { cle: 'mar', libelle: 'Mardi', court: 'Ma' },
    { cle: 'mer', libelle: 'Mercredi', court: 'Me' },
    { cle: 'jeu', libelle: 'Jeudi', court: 'Je' },
    { cle: 'ven', libelle: 'Vendredi', court: 'Ve' },
    { cle: 'sam', libelle: 'Samedi', court: 'Sa' },
    { cle: 'dim', libelle: 'Dimanche', court: 'Di' }
  ];

  // `profiles_rythme_borne` : 1 à 14 séances, 10 à 300 minutes. Les durées
  // proposées sont un sous-ensemble sensé de l'intervalle — une durée VISÉE ne
  // se règle pas à la minute.
  var SEANCES_MIN = 1, SEANCES_MAX = 14;
  var DUREES = [30, 45, 60, 75, 90, 105, 120, 150, 180];
  var TAILLE_MIN = 100, TAILLE_MAX = 250;

  function libelleDe(liste, cle) {
    if (cle === null || cle === undefined || cle === '') return null;
    for (var i = 0; i < liste.length; i++) if (liste[i].cle === cle) return liste[i].libelle;
    return null;
  }

  // ── L'identité affichée ──────────────────────────────────────────────────

  function initiale(pseudo) {
    var s = String(pseudo === null || pseudo === undefined ? '' : pseudo).trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }

  // L'âge en années révolues. `aujourdhui` est passé, jamais lu d'une horloge
  // interne : un module pur ne connaît pas l'heure, et c'est ce qui le rend
  // testable.
  function age(dateNaissance, aujourdhui) {
    if (!dateNaissance) return null;
    var d = dateNaissance instanceof Date ? dateNaissance : new Date(String(dateNaissance) + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var ref = aujourdhui instanceof Date ? aujourdhui : new Date(aujourdhui);
    if (isNaN(ref.getTime())) return null;
    var n = ref.getFullYear() - d.getFullYear();
    var m = ref.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) n--;
    return n >= 0 && n < 130 ? n : null;
  }

  // « 98 kg · 182 cm · 28 ans » — et ce qui manque ne laisse pas de trou.
  // Un profil neuf rend une chaîne VIDE plutôt qu'une suite de tirets : un champ
  // vide est un état, pas une erreur, et le bandeau n'a pas à l'annoncer trois
  // fois de suite.
  function sousTitre(profil, poidsKg, aujourdhui) {
    var p = profil || {};
    var bouts = [];
    if (poidsKg !== null && poidsKg !== undefined && isFinite(poidsKg)) {
      bouts.push(racine.THModele.nombreSigne(poidsKg) + ' kg');
    }
    if (p.taille_cm) bouts.push(p.taille_cm + ' cm');
    var a = age(p.date_naissance, aujourdhui);
    if (a !== null) bouts.push(a + ' ans');
    return bouts.join(' · ');
  }

  // ── Les trois chiffres du bandeau ────────────────────────────────────────
  //
  // Séances, séries, années d'historique. Comptés sur ce qu'on a en local, donc
  // exacts hors ligne — et « années » se compte de la PREMIÈRE séance à
  // aujourd'hui, pas sur le calendrier : quelqu'un qui a commencé en décembre
  // 2023 n'a pas « 3 ans » en janvier 2026.
  // PR 6 de la consolidation (décision du 02/10/2026) — `series` : les
  // SÉRIES DE TRAVAIL, sur la règle unique (`THSemaine.compteSeriesTravail`,
  // `exercices` = le catalogue). Le KPI comptait toutes les lignes, chauffes
  // comprises : un chiffre que le reste de l'app calcule autrement. `lignes` :
  // toutes les lignes, pour ce qui dit ce qui sera EFFACÉ (la suppression du
  // compte) — une autre question.
  function statsDe(seances, series, aujourdhui, exercices) {
    var liste = seances || [];
    var plusAncienne = null;
    liste.forEach(function (s) {
      if (!s || !s.debut) return;
      var d = new Date(s.debut);
      if (isNaN(d.getTime())) return;
      if (!plusAncienne || d < plusAncienne) plusAncienne = d;
    });
    var annees = null;
    if (plusAncienne) {
      var ref = aujourdhui instanceof Date ? aujourdhui : new Date(aujourdhui);
      if (!isNaN(ref.getTime())) {
        var jours = (ref - plusAncienne) / 86400000;
        annees = jours > 0 ? jours / 365.25 : 0;
      }
    }
    return { seances: liste.length, series: racine.THSemaine.compteSeriesTravail(series || [], exercices),
             lignes: (series || []).length, annees: annees, depuis: plusAncienne };
  }

  // « 3 ans », « 8 mois », « 1 mois ». Sous l'année, les mois disent quelque
  // chose ; au-delà, ils n'ajoutent rien.
  function libelleAnciennete(annees) {
    if (annees === null || annees === undefined || !isFinite(annees)) return '—';
    if (annees < 1) {
      var mois = Math.max(0, Math.round(annees * 12));
      return mois <= 1 ? '1 mois' : mois + ' mois';
    }
    var n = Math.floor(annees);
    return n + ' an' + (n > 1 ? 's' : '');
  }

  // ── Ce qui reste à renseigner ────────────────────────────────────────────
  //
  // ⚠️ CE N'EST PAS UNE VALIDATION. Aucun de ces champs n'est obligatoire, et
  // aucun écran ne se bloque dessus : « un profil incomplet n'est pas une
  // erreur, c'est un état » (§4). La liste sert à DIRE combien il en reste,
  // une fois, sur l'écran d'accueil d'un compte neuf.
  //
  // `sexe`, `mode_entrainement`, `unites` et `intention` sont NOT NULL avec un
  // défaut en base : ils ne peuvent pas manquer, donc ils n'y figurent pas.
  var A_RENSEIGNER = ['materiel', 'anciennete', 'niveau_declare', 'taille_cm',
                      'date_naissance', 'seances_par_semaine', 'duree_seance_min'];

  function vide(v) {
    if (v === null || v === undefined || v === '') return true;
    return Array.isArray(v) && v.length === 0;
  }

  // ── L'onboarding est une règle de ROUTAGE (§4) ───────────────────────────
  //
  // ⚠️ `=== false`, PAS « pas vrai ». Trois valeurs, pas deux :
  //   `false`     → la base dit que ce profil n'a jamais été vu → on l'ouvre ;
  //   `true`      → il a été vu → on ouvre ce que l'URL demande ;
  //   ABSENT      → on ne sait pas — profil pas encore chargé, cache vide,
  //                 premier démarrage hors ligne, ou ligne partielle écrite
  //                 sans réseau. **On n'ouvre pas un formulaire de bienvenue
  //                 sur une supposition.**
  //
  // Une lecture lâche (`!profil.onboarding_completed`) confondrait le troisième
  // cas avec le premier, et un compte qui a trois ans d'historique rouvrirait
  // sur son profil à chaque démarrage hors ligne.
  function doitOuvrirProfil(profil) {
    return !!profil && profil.onboarding_completed === false;
  }

  function manquants(profil) {
    var p = profil || {};
    return A_RENSEIGNER.filter(function (c) { return vide(p[c]); });
  }

  // ── Ce qu'on a le DROIT d'écrire ─────────────────────────────────────────
  //
  // ⚠️ LISTE BLANCHE, PAS LISTE NOIRE. `profiles` porte `is_admin`, `tier` et
  // `tier_awarded_at`, qu'un trigger SECURITY DEFINER
  // (`protect_privileged_profile_columns`) remet à leur valeur d'avant pour un
  // non-admin. Les envoyer ne casserait rien — elles seraient silencieusement
  // ignorées — mais envoyer une colonne qu'on sait refusée est une écriture qui
  // ment sur son effet. Elle porte aussi `xp_high_water_mark`, `friend_code` et
  // les six réglages de visibilité : c'est du social, et rien ici ne les touche.
  var CHAMPS_ECRITS = ['username', 'bio', 'sexe', 'taille_cm', 'date_naissance',
                       'mode_entrainement', 'unites', 'anciennete', 'intention',
                       'rythme_progression', 'phase', 'phase_depuis', 'lest_reponse', 'lest_reponse_le',
                       'materiel', 'niveau_declare',
                       'seances_par_semaine', 'jours_vises', 'duree_seance_min',
                       'onboarding_completed'];

  function champsEcrits(champs) {
    var src = champs || {}, sortie = {};
    CHAMPS_ECRITS.forEach(function (c) {
      if (Object.prototype.hasOwnProperty.call(src, c)) sortie[c] = src[c];
    });
    return sortie;
  }

  // ── Bornes de saisie ─────────────────────────────────────────────────────
  //
  // Elles DOUBLENT les CHECK de la base, et ce n'est pas une duplication de
  // règle : un refus côté serveur arrive en 23514, un code que la file classe
  // DÉFINITIF (attente.js) — la ligne partirait et ne reviendrait jamais. On
  // refuse donc AVANT, avec une phrase, plutôt qu'après, avec un blocage.
  function tailleValide(v) {
    var n = Number(v);
    return isFinite(n) && n >= TAILLE_MIN && n <= TAILLE_MAX ? Math.round(n) : null;
  }

  // Une date de naissance dans le futur, ou d'il y a 200 ans, n'en est pas une.
  function naissanceValide(txt, aujourdhui) {
    if (!txt) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(txt))) return null;
    var a = age(txt, aujourdhui);
    return a !== null && a >= 10 && a <= 120 ? String(txt) : null;
  }

  function joursValides(liste) {
    var vus = {}, sortie = [];
    (liste || []).forEach(function (j) {
      if (vus[j]) return;
      for (var i = 0; i < JOURS.length; i++) {
        if (JOURS[i].cle === j) { vus[j] = true; sortie.push(j); return; }
      }
    });
    // Rendus dans l'ordre de la semaine, quel que soit l'ordre des clics :
    // « Lu · Ma · Je » se lit, « Je · Lu · Ma » ne se lit pas.
    return JOURS.map(function (j) { return j.cle; }).filter(function (c) { return vus[c]; });
  }

  function libelleJours(liste) {
    var choisis = joursValides(liste);
    if (!choisis.length) return null;
    return JOURS.filter(function (j) { return choisis.indexOf(j.cle) >= 0; })
      .map(function (j) { return j.court; }).join(' · ');
  }

  // ══ LE PSEUDO ════════════════════════════════════════════════════════════

  var PSEUDO_MIN = 3, PSEUDO_MAX = 20;

  // Les accents partent, les espaces deviennent des tirets bas, le reste tombe.
  // Un pseudo sert d'identifiant lisible PARTOUT (§3.1) — dans une URL, dans un
  // code ami, dans une notification — donc il vit dans un alphabet qui traverse
  // tout sans se faire réécrire en chemin.
  var ACCENTS = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
  var SANS = 'aaaaaaceeeeiiiinooooouuuuyy';

  function sansAccent(s) {
    var sortie = '';
    for (var i = 0; i < s.length; i++) {
      var k = ACCENTS.indexOf(s.charAt(i));
      sortie += k >= 0 ? SANS.charAt(k) : s.charAt(i);
    }
    return sortie;
  }

  function normaliserPseudo(brut) {
    var s = sansAccent(String(brut === null || brut === undefined ? '' : brut).trim().toLowerCase());
    s = s.replace(/[^a-z0-9_]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+/, '');
    return s.slice(0, PSEUDO_MAX).replace(/_+$/, '');
  }

  // ── Les deux alternatives (§3.1) ─────────────────────────────────────────
  //
  // « Le refus PROPOSE DEUX ALTERNATIVES — sinon on tâtonne. »
  //
  // ⚠️ LA MAQUETTE MONTRE « melodie » ET « mel_d » POUR « mel », et ces deux-là
  // ne se devinent pas d'un pseudo seul : « melodie » est une EXPANSION. Elles
  // se dérivent en revanche exactement de l'ADRESSE E-MAIL, qui est saisie sur
  // le même écran — `melodie.dupont@…` donne « melodie » par sa première partie
  // et « mel_d » par l'initiale de la seconde. C'est donc l'e-mail qu'on lit, et
  // les suffixes numériques ne servent que de repli.
  //
  // Rien n'est proposé qui soit invalide, déjà pris, ou égal à ce qui vient
  // d'être refusé.
  function alternatives(brut, contexte) {
    var ctx = contexte || {};
    var base = normaliserPseudo(brut);
    var pris = {};
    (ctx.pris || []).forEach(function (n) { pris[normaliserPseudo(n)] = true; });

    var bouts = [];
    var local = String(ctx.email || '').split('@')[0];
    if (local) {
      bouts = normaliserPseudo(local).split('_').filter(Boolean);
    }

    var candidats = [], i;
    // 1. La PREMIÈRE partie de l'e-mail : « melodie.dupont@… » donne « melodie ».
    if (bouts.length) candidats.push(bouts[0]);
    // 2. Ce qui a été tapé, plus l'initiale de la partie suivante : « mel_d ».
    if (base && bouts.length > 1) {
      for (i = 1; i < bouts.length; i++) candidats.push(base + '_' + bouts[i].charAt(0));
    }
    // 3. L'e-mail EN ENTIER, en dernier recours seulement. « melodie_dupont »
    //    est un identifiant lisible PARTOUT — donc un nom de famille exposé à
    //    tout le monde. On ne le propose pas d'emblée, on le garde pour le cas
    //    où les deux formes courtes sont prises.
    if (bouts.length > 1) candidats.push(bouts.join('_'));
    // 4. Repli pur : des suffixes. Sans e-mail exploitable, c'est tout ce qu'on
    //    a — et deux suggestions valent mieux qu'un refus sec.
    if (base) {
      for (i = 2; i <= 9; i++) candidats.push(base + i);
      for (i = 1; i <= 9; i++) candidats.push(base + '_' + i);
    }

    var sortie = [], vus = {};
    vus[base] = true;
    candidats.forEach(function (c) {
      if (sortie.length >= 2) return;
      var p = normaliserPseudo(c);
      if (!p || vus[p] || pris[p]) return;
      if (p.length < PSEUDO_MIN || p.length > PSEUDO_MAX) return;
      vus[p] = true;
      sortie.push(p);
    });
    return sortie;
  }

  // ── Le verdict ───────────────────────────────────────────────────────────
  //
  // ⚠️ TROIS ÉTATS, PAS DEUX. `pris` vaut `true`, `false`, ou `null` quand la
  // question n'a pas pu être posée — hors réseau, ou parce que la base ne sait
  // pas répondre. `null` rend « inconnu », et l'écran se TAIT : annoncer
  // « libre » sur une question sans réponse serait une affirmation fausse, et
  // c'est précisément le genre de chiffre inventé que ce projet refuse.
  function verdictPseudo(brut, pris, contexte) {
    var p = normaliserPseudo(brut);
    if (!p) return { code: 'vide', pseudo: '', message: null, alternatives: [] };
    if (p.length < PSEUDO_MIN) {
      return { code: 'court', pseudo: p, alternatives: [],
               message: PSEUDO_MIN + ' caractères minimum.' };
    }
    if (!/^[a-z]/.test(p)) {
      return { code: 'invalide', pseudo: p, alternatives: [],
               message: 'Commence par une lettre.' };
    }
    if (pris === true) {
      var alts = alternatives(p, contexte);
      var msg = 'Déjà pris';
      if (alts.length === 2) msg += ' — essaie « ' + alts[0] + ' » ou « ' + alts[1] + ' ».';
      else if (alts.length === 1) msg += ' — essaie « ' + alts[0] + ' ».';
      else msg += '.';
      return { code: 'pris', pseudo: p, alternatives: alts, message: msg };
    }
    if (pris === false) return { code: 'libre', pseudo: p, alternatives: [], message: null };
    return { code: 'inconnu', pseudo: p, alternatives: [], message: null };
  }

  // Un mot de passe trop court part en 422 côté Supabase, qui répond en
  // anglais. On refuse avant, en français, sur la même borne.
  var MDP_MIN = 8;
  function mdpValide(v) { return String(v || '').length >= MDP_MIN; }

  // ── L'inscription peut-elle partir ? ─────────────────────────────────────
  //
  // Le bouton est ÉTEINT tant que les trois champs ne tiennent pas — c'est ce
  // que montre la maquette (`.pri.off`). Un pseudo dont on ne sait pas s'il est
  // pris ne bloque PAS : on ne retient personne sur une question sans réponse.
  function inscriptionPrete(etat) {
    var e = etat || {};
    var v = verdictPseudo(e.pseudo, e.pseudoPris, e);
    if (v.code !== 'libre' && v.code !== 'inconnu') return false;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e.email || '').trim())) return false;
    return mdpValide(e.mdp);
  }

  var api = {
    DISCIPLINES: DISCIPLINES, DISCIPLINES_CONNUES: DISCIPLINES_CONNUES,
    MATERIELS: MATERIELS, ANCIENNETES: ANCIENNETES, NIVEAUX: NIVEAUX,
    SEXES: SEXES, UNITES: UNITES, INTENTIONS: INTENTIONS, JOURS: JOURS,
    sectionIntention: sectionIntention,
    RYTHMES: RYTHMES, RYTHME_DEFAUT: RYTHME_DEFAUT,
    rythmeDe: rythmeDe, phraseRythme: phraseRythme, sectionRythme: sectionRythme,
    PHASES: PHASES, PHASE_DEFAUT: PHASE_DEFAUT, phaseDe: phaseDe, phaseGelee: phaseGelee, sectionPhase: sectionPhase,
    DUREES: DUREES, SEANCES_MIN: SEANCES_MIN, SEANCES_MAX: SEANCES_MAX,
    TAILLE_MIN: TAILLE_MIN, TAILLE_MAX: TAILLE_MAX,
    PSEUDO_MIN: PSEUDO_MIN, PSEUDO_MAX: PSEUDO_MAX, MDP_MIN: MDP_MIN,
    CHAMPS_ECRITS: CHAMPS_ECRITS, A_RENSEIGNER: A_RENSEIGNER,
    libelleDe: libelleDe,
    initiale: initiale,
    age: age,
    sousTitre: sousTitre,
    statsDe: statsDe,
    libelleAnciennete: libelleAnciennete,
    manquants: manquants,
    doitOuvrirProfil: doitOuvrirProfil,
    champsEcrits: champsEcrits,
    tailleValide: tailleValide,
    naissanceValide: naissanceValide,
    joursValides: joursValides,
    libelleJours: libelleJours,
    normaliserPseudo: normaliserPseudo,
    alternatives: alternatives,
    verdictPseudo: verdictPseudo,
    mdpValide: mdpValide,
    inscriptionPrete: inscriptionPrete
  };

  racine.THProfil = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
