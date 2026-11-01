// v2/js/app.js — amorçage et orchestration.
//
// Principe : les données vivent sur le téléphone, le réseau ne sert qu'à les
// mettre à jour. On affiche TOUJOURS ce qu'on a d'abord, puis on rafraîchit en
// arrière-plan. Aucun écran d'attente quand quelque chose peut déjà être montré.
//
// L'app ÉCRIT désormais, mais pour les routines seulement, et EN DIRECT — pas
// par le cache. Voir `chargerRoutines` pour le pourquoi. Le corpus importé
// (séances, séries) reste lu depuis le cache et n'est jamais modifié.

(function (racine) {
  'use strict';

  var doc = racine.document;
  var Rendu = racine.THRendu, Modele = racine.THModele;
  var Donnees = racine.THDonnees, Auth = racine.THAuth;
  var Cache = racine.THCache, Sync = racine.THSync, Semaine = racine.THSemaine;
  var Routeur = racine.THRouteur, Sortie = racine.THSortie;
  var Calendrier = racine.THCalendrier;
  var Periode = racine.THPeriode, Poids = racine.THPoids, Courbe = racine.THCourbe;
  var Palier = racine.THPalier, Routines = racine.THRoutines;
  var Seance = racine.THSeance, Attente = racine.THAttente;
  var Profil = racine.THProfil, Moteur = racine.THMoteur, Plan = racine.THPlan;
  // 160 — « Demander au coach » : le contexte d'une ligne, les garde-fous locaux, l'appel (la conversation vit en mémoire).
  var Assistant = racine.THAssistant;
  var Questionnaire = racine.THQuestionnaire;
  var Import = racine.THImportHevy;
  var Generateur = racine.THGenerateur;
  var Rejeu = racine.THRejeu, Bilan = racine.THBilan;
  // 64B — le jeu (JEU-V1 §9) : l'écran le LIT, il ne le refait pas ; le coach ne le lit jamais.
  var Jeu = racine.THJeu;
  // 87 — le social (SOCIAL-V1) : les règles dans `social.js`, les lectures par les fonctions de la base.
  var Social = racine.THSocial;
  // 75 — « Ton parcours » : l'écran lit le parcours par `faits.parcoursDe` ; d'ici, seuls les noms courts des barres.
  var Parcours = racine.THParcours;
  // 78 — la question de réserve : le plan la décide ; d'ici, l'entrée figée (le passé de chaque exercice).
  var Reserve = racine.THReserve;
  // 99 — la semaine qui déraille (MOTEUR §9.24) : la règle dans `deraille.js` ; d'ici, son entrée et ses gestes.
  var Deraille = racine.THDeraille;
  var Equilibres = racine.THEquilibres;
  // 109 (MOTEUR §9.25) — l'objectif posé par la personne, à l'essai.
  var Objectif = racine.THObjectif;
  // 59-2 — « Quitter » : la fenêtre des séances pas encore envoyées, et ce qu'on efface.
  var Quitter = racine.THQuitter;
  // 58-1 — LE MODULE DES FAITS : l'assemblage des faits (séances et séries,
  // records, semaine, exercices faits) vit dans `faits.js`, avec ses mémos.
  // L'écran lui passe son corpus (`corpus()`) et lit.
  var faits = racine.THFaits.creer();

  var vues = {};
  var local = { semaineChoix: [], seances: [], series: [], exercices: [], alias: [], pesees: [], zones: [], modes: [],
                predictions: [], sousConsigne: {}, parisLegers: [], escalier: [], parSeance: null,
                blocs: [], programme: [], records: [], connues: {},
                objectifs: [], objectifsDispo: null, parisObjectif: [] };
  var etat = { code: 'vide', libelle: '', local: false };
  var syncEnCours = false;
  // 117 (audit du 16/10, 06 #1) — le nombre d'envois de séries confirmés depuis l'ouverture. Le rapprochement des
  // séries ne conclut rien si une série est montée PENDANT la synchronisation (elle n'était pas dans ce qu'on a lu).
  var envoisDeSeries = 0;
  // ⚠️ 59-5 — LA GÉNÉRATION DE L'APPAREIL. « Quitter » (et « Supprimer mon
  // compte », qui passe par lui) l'incrémente AVANT de vider quoi que ce soit.
  // Tout écrivain asynchrone — une synchronisation, le journal des records,
  // son remplissage, la vidange de la file, le profil — note la génération au
  // départ et abandonne sans écrire dès qu'elle a changé : sinon, la synchro
  // lancée au retour du réseau reprenait après « Quitter » et réécrivait les
  // séries et les records du compte parti dans le cache qu'on venait de vider
  // (banc séquentiel, Q59 : 493 séries et 344 records restés sur l'appareil).
  var generation = 0;
  function generationValide(g) { return g === generation; }
  // Le cache va être vidé : ce qui était en vol n'écrira plus, et les verrous
  // des tâches en vol sont libérés pour le compte qui suit.
  function nouvelleGeneration() {
    generation++;
    syncEnCours = false;
    vidangeEnCours = false;
    vidangeARelancer = false;
    // 107 — les gestes sociaux confirmés et le refus à dire appartiennent au compte qui part.
    social.confirmes = []; social.refus = null; social.aRafraichir = null;
    // 160 — le nombre de questions qui restent aujourd'hui appartient au compte qui part.
    if (Assistant) Assistant.oublier();
  }
  var lundiAffiche = null;   // le lundi de la semaine à l'écran
  var gardes = [];           // vues qui peuvent refuser la sortie (§ écran de saisie)
  var sortie = null;         // mécanisme du bouton retour (v2/js/sortie.js)
  var sessionActive = null;  // sans elle, aucune vue authentifiée n'est rendue
  var zoneOuverte = null;    // une seule zone dépliée à la fois (§7 bis.10)
  var moisCalendrier = null; // le mois affiché par le calendrier
  var gardeSuspendue = 0, planNonVerifie = null;   // 183 — voir `suspendreGarde`
  var gardeOverlay = null;   // la garde qui rend le retour d'Android fermant
  var periodeRadar = Periode.PERIODE_DEFAUT;   // fenêtre comparée du radar
  var periodePoids = Poids.PERIODE_DEFAUT;     // fenêtre de la courbe de poids
  var etatsExercices = {};   // §5.2 : « monte » / « ne monte pas », par exercice

  // ── Routines ─────────────────────────────────────────────────────────────
  //
  // ⚠️ ELLES NE PASSENT PAS PAR LE CACHE, et c'est un choix.
  //
  // Le cache local est un MIROIR EN LECTURE d'un corpus qu'on ne modifie pas,
  // avec tout l'appareillage que ça demande : curseur incrémental, compte de
  // contrôle, cliquet de complétude. Il répond à une seule question — « ai-je
  // tout reçu ». Y verser une table qu'on écrit y ajouterait la question
  // inverse — « ai-je tout envoyé » — pour laquelle il n'a AUCUNE FILE
  // D'ATTENTE ni aucun suivi de ce qui reste à pousser. À moitié fait, on
  // obtiendrait le pire : une bibliothèque locale qui diverge en silence de ce
  // qui est en base.
  //
  // ⚠️ Corrigé le 12/09 : ce commentaire ajoutait « ni identité locale, ni
  // résolution de conflit ». C'est FAUX, et `SCHEMA-REEL.md` le dit —
  // `sessions.id` et `sets.id` ont `gen_random_uuid()` en défaut, donc l'app
  // peut fabriquer les identifiants elle-même et la synchronisation devient une
  // réécriture IDEMPOTENTE : la même ligne envoyée deux fois écrase la même
  // ligne. L'identité et le conflit sont donc réglés d'avance. Ce qui manque
  // vraiment, c'est la file d'attente — et c'est elle le chantier suivant.
  //
  // Une routine se crée au calme, avec du réseau ; une SÉANCE se saisit à la
  // salle, où le réseau tombe. L'écriture hors ligne est le vrai problème, et
  // il se posera au commit suivant, avec la séance en cours — entier, pas
  // entamé de travers ici.
  //
  // La contrepartie est assumée et visible à l'écran : sans réseau, la
  // bibliothèque le DIT au lieu de faire semblant.
  var routines = [];
  var etatRoutines = { code: 'jamais', message: '' };
  var brouillon = null;      // la routine en cours d'édition, en mémoire
  var enregistrementEnCours = false;

  // ── LA SÉANCE EN COURS ───────────────────────────────────────────────────
  //
  // Trois états, et il faut les distinguer :
  //
  //   `seance`   la séance en cours, en MÉMOIRE. Réécrite sur disque après
  //              chaque geste — c'est ce qui la fait survivre à une app tuée.
  //   `attente`  la file d'écriture, sur disque elle aussi. Elle survit au
  //              redémarrage, sinon une séance saisie hors ligne ne monterait
  //              jamais.
  //   `vidange`  un verrou. Deux vidanges simultanées enverraient deux fois.
  //
  // La règle qui commande tout : ÉCRITURE LOCALE D'ABORD, TOUJOURS. Aucun geste
  // de saisie n'attend le réseau, aucun n'échoue parce qu'il est absent.
  var seance = null;
  var attente = [];
  var vidangeEnCours = false;
  // 107 — une vidange DEMANDÉE pendant qu'une autre tourne (le réseau revient pendant qu'un envoi échoue encore) n'est
  // pas perdue : elle se relance à la fin de celle en cours. Sans elle, un geste fait à cet instant attendait le
  // déclencheur suivant (un autre geste, la prochaine ouverture de l'app).
  var vidangeARelancer = false;
  var chrono = null;         // { depuis, cible, sonne, exo } — le repos en cours
  var minuteur = null;       // l'intervalle d'affichage du chronomètre
  var dureeTimer = null;     // le réveil de la durée de la barre de séance (62) — un SEUL, voir `armerDuree`
  var sourdine = false;      // le son du repos, coupé et retenu (§3 bis.8)
  var audio = null;          // le contexte Web Audio, né au premier geste
  var modeRPE = false;       // la bascule effort, retenue d'une fois sur l'autre
  var feuille = null;        // la feuille ouverte : { quoi, iExo, iSerie }
  // §7 octies.2 — la saisie sert à CORRIGER quand son brouillon porte une
  // séance DÉJÀ terminée. L'état se LIT sur la séance, il ne se retient pas à
  // côté : une app tuée au milieu d'une correction la rouvre en correction, et
  // il n'y a pas de drapeau à désynchroniser.
  function enEdition() { return !!seance && seance.statut === Seance.TERMINEE; }

  // L'identifiant est fabriqué ICI, côté client. C'est lui qui rend l'envoi
  // idempotent : la même ligne envoyée deux fois écrase la même ligne, donc
  // rejouer la file après une coupure ne crée pas de doublon.
  // `crypto.randomUUID` n'existe pas partout ; le repli tire les mêmes 122 bits
  // d'aléa de `getRandomValues`, et `Math.random` ne sert que si rien d'autre
  // n'existe — cas où l'app a d'autres soucis.
  function uuid() {
    var c = racine.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var o = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(o);
    else for (var i = 0; i < 16; i++) o[i] = Math.floor(Math.random() * 256);
    o[6] = (o[6] & 0x0f) | 0x40;
    o[8] = (o[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(o, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
           h.slice(16, 20) + '-' + h.slice(20);
  }

  function $(id) { return doc.getElementById(id); }

  var ecranCourant = null;

  // Une vue visible à la fois, et la barre d'onglets suit : elle disparaît sur
  // la connexion, où il n'y a rien à naviguer.
  function montrer(nom, vue) {
    // ⚠️ LE MODE RÉORGANISER NE TRAVERSE PAS LES ÉCRANS (§7 vicies, ch. 46).
    // Il porte un ordre NON ENREGISTRÉ : le laisser ouvert emporterait des
    // déplacements en attente sur un écran qui ne sait pas les enregistrer.
    // Une seule porte, donc une seule remise à zéro — et elle règle au passage
    // un défaut plus ancien : le mode ne se refermait JAMAIS, pas même en
    // terminant une séance.
    if (ecranCourant !== nom) fermerReorganisation();
    // ⚠️ LE QUESTIONNAIRE NE SURVIT PAS À SA VUE (60-2a). Un autre écran posé par-dessus
    // — le bouton « Rafraîchir », une session perdue, n'importe quel rendu — le laissait
    // « ouvert » sans qu'on le voie : « Le terminer » devenait inerte (`ouvrirQuestionnaire`
    // sort si l'état existe), le retour d'Android s'y adressait encore. Une seule porte,
    // comme `fermerReorganisation` : changer d'écran le ferme, ce qui est validé est déjà écrit.
    if (nom !== 'questionnaire' && questionnaire) fermerQuestionnaire();
    // 66B — LA RELECTURE NE SURVIT PAS À SA VUE : les cartes repliées valent pour CETTE ouverture.
    if (nom !== 'relecture') relecture = null;
    // 70 — « Mot de passe changé. » ne vaut que sous les yeux : quitter le profil l'efface.
    if (nom !== 'profil') { noteProfil = null; bandeauMotDePasse = false; }
    // 116 (03 #6) — « Pas enregistré : … » se dit une fois, sur le Profil : vue, elle s'efface en le quittant.
    if (nom !== 'profil' && refusProfil && refusProfil.vu) refusProfil = null;
    var onglet = Routeur.ongletDe(vue || nom);
    // 136 (audit du 16/10, 03 #18) — quitter le profil n'écrit plus rien (`onboarding_completed`, « vu », retiré : le
    // bandeau de bienvenue n'existe plus depuis 60-2a, et plus rien ne lisait la colonne).
    ecranCourant = nom;
    // ⚠️ LA DURÉE DE LA BARRE N'A DE SENS QUE SOUS LES YEUX (62). Une seule porte,
    // comme pour le mode Réorganiser : quitter l'écran de séance — par un onglet,
    // par « Terminer », par « Annuler » — coupe le réveil, et `rendreSeance` le
    // réarme au retour. Rien à penser à arrêter à chaque sortie.
    if (nom !== 'seance') arreterDuree();
    Object.keys(vues).forEach(function (k) { vues[k].hidden = (k !== nom); });
    var barre = $('onglets');
    if (barre) barre.hidden = !onglet;
    appliquerJeu();
    Rendu.rendreOnglets(barre, onglet);
    // Une séance en cours se voit depuis N'IMPORTE QUEL écran. Une PWA qui
    // rouvre sur `/` la cacherait sinon, et « je ne la retrouve pas » est une
    // perte comme une autre. Un point, pas une alarme.
    var saisie = doc.querySelector('.onglet[data-vue="' + Routeur.SAISIE + '"]');
    if (saisie) saisie.classList.toggle('en-cours', !!seance);
    montrerBandeauMaj();
    // La barre d'onglets vient d'apparaître ou de disparaître : sa hauteur est
    // ce sur quoi toute la réserve du bas se règle. On mesure ici plutôt qu'au
    // seul démarrage — au démarrage elle est encore cachée, et la mesure
    // vaudrait zéro.
    mesurerBarres();
  }

  function texteErreur(e) {
    if (!e) return 'Erreur inconnue.';
    var m = e.message || String(e);
    if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) return 'Pas de réseau.';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    return m;
  }

  // ── Index des séries par séance, construit une fois par chargement ───────
  function indexerParSeance() {
    var index = new Map();
    local.series.forEach(function (s) {
      var l = index.get(s.session_id);
      if (l) l.push(s); else index.set(s.session_id, [s]);
    });
    local.parSeance = index;
  }
  function seriesDe(sessionId) { return (local.parSeance && local.parSeance.get(sessionId)) || []; }

  // LE CORPUS que lit le module des faits (58-1) : le cache de lecture, l'index
  // des séries par séance et le catalogue indexé — l'état de l'écran, passé en
  // argument plutôt que lu par fermeture.
  function corpus() {
    return { seances: local.seances, series: local.series, exercices: local.exercices,
             seriesDe: seriesDe, catalogue: catalogueIndexe, journal: local.records };
  }

  // ── §9.1.1 — LES CORRECTIONS DE ZONE ─────────────────────────────────────
  //
  // Un historique en ajout seul : chaque choix ajoute une ligne, la plus
  // récente fait foi, une zone vide ramène à la déduction. Rien ne se modifie,
  // rien ne s'efface — donc la fusion est une UNION par identifiant, et la
  // ligne du serveur l'emporte sur sa copie locale (elle a traversé les
  // contraintes de la base).
  // MOTEUR §9.22 (53-2) — LES BLOCS SE FONDENT PAR `id`, le plus récent par
  // `modifie_a` l'emporte : un statut changé ici (terminé, arrêté), pas encore
  // monté, ne revient pas à « en cours » parce que le serveur ne le sait pas.
  function fondreBlocs(locaux, distants) {
    var par = {};
    (locaux || []).forEach(function (b) { if (b && b.id) par[b.id] = b; });
    (distants || []).forEach(function (b) {
      if (!b || !b.id) return;
      var l = par[b.id];
      var tb = Date.parse(b.modifie_a || '') || 0, tl = Date.parse((l && l.modifie_a) || '') || 0;
      if (!l || tb >= tl) par[b.id] = b;
    });
    return Object.keys(par).map(function (k) { return par[k]; });
  }

  function fondreZones(locales, distantes) {
    var par = {};
    (locales || []).forEach(function (l) { if (l && l.id) par[l.id] = l; });
    (distantes || []).forEach(function (l) { if (l && l.id) par[l.id] = l; });
    return Object.keys(par).map(function (k) { return par[k]; });
  }

  // La zone en vigueur d'un exercice. Le CALCUL vit dans le moteur (§9.1.1) —
  // l'app lui passe les lignes, elle ne les trie pas elle-même.
  // §9.22 (53-2) — À L'INSTANT : une ligne de bloc datée de lundi n'est pas
  // encore en vigueur aujourd'hui.
  function zoneDe(slug) { return Moteur.zoneEnVigueur(zonesLues(), slug, new Date().toISOString()); }
  // §9.10 (53-2 bis, D1) — la ligne en vigueur QUAND elle commence un bloc
  // (sinon `null`) : elle fait dire « Nouveau bloc » et « · bloc ». La ligne
  // d'un arrêt porte l'origine « bloc » sans être un début de bloc (53-2 ter).
  function ligneDeZoneDe(slug) {
    return Moteur.ligneDeDebutDeBloc(Moteur.ligneDeZoneAu(zonesLues(), slug, new Date().toISOString(), true), local.blocs || []);
  }
  // §9.22 (53-2 bis, 53-2 ter) — LA SEULE LECTURE DES ZONES de l'app (le plan,
  // le compteur, le report, l'étiquette, le rejeu) : les lignes d'un bloc
  // datées après son arrêt sont IGNORÉES, comme absentes — jamais lues comme
  // « sans zone ».
  function zonesLues() { return Moteur.lignesDeZoneValides(local.zones || [], local.blocs || []); }

  // ⚠️ L'APPAREIL D'ABORD, LE RÉSEAU ENSUITE. Le choix s'affiche tout de suite,
  // même sans réseau, et part par la file. `user_id` et `corrigee_a` sont posés
  // ICI, à l'instant du geste : laissés au défaut du serveur, deux choix faits
  // hors ligne remonteraient dans l'ordre du réseau, pas dans celui des gestes,
  // et le dernier choisi ne serait pas le dernier gardé.
  //
  // `zone` nulle veut dire « Revenir à celle d'après tes séances » : on AJOUTE
  // une ligne vide, on n'efface pas l'historique.
  async function poserZone(slug, zone) {
    var id = uuid();
    var ligne = {
      id: id,
      user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
      exercise_slug: slug,
      zone: zone || null,
      corrigee_a: new Date().toISOString()
    };
    local.zones = local.zones.concat([ligne]);
    // La seule exception au gel de la consigne (§9.13 bis, 49-U1) :
    // l'utilisateur corrige LUI-MÊME la zone de CET exercice. Il se recalcule,
    // lui seul ; ses séries validées restent figées par leurs paris.
    if (consignes && consignes.parSlug) {
      delete consignes.parSlug[slug];
      versionConsignes++;
      sauverConsignes();
    }
    await Cache.ecrireLot('zones', [ligne]).catch(function () {});
    await poser({ table: Attente.ZONES, op: Attente.UPSERT, id: id, donnees: ligne });
  }

  // ══ MOTEUR §9.22 (53-2) — LES PROGRAMMES À CYCLES ════════════════════════
  //
  // « Un programme fixe la zone de tes barres, la durée du bloc et sa
  // décharge. » L'app écrit et lit ; chaque décision vient du moteur
  // (`semaineDuBloc`, `zonesPosees`, `blocSuivant`, `bilanDuBloc`…). Un bloc
  // part par la file (`blocs`), ses lignes de zone ensuite, qui en dépendent.
  var VERSION_PROGRAMME = '1';
  var programmeEnCours = null;   // la feuille « Faire de ce dossier un programme »

  function jourDuJour() { return Moteur.jourCivil(new Date().toISOString()); }
  function instantDuJour() { return new Date().toISOString(); }
  function idUtilisateur() { return (sessionActive && sessionActive.user && sessionActive.user.id) || null; }
  // Le lundi qui suit (strictement), au jour civil local.
  function lundiQuiSuit(jour) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return Moteur.jourCivil(d.toISOString());
  }
  function finsAllegeesConnues() {
    return Moteur.cartesDesParis(parisEscalierConnus()).filter(function (c) {
      return c.reponse === 'acceptee' && c.fin;
    }).map(function (c) { return c.fin; });
  }

  async function poserBloc(bloc) {
    local.blocs = (local.blocs || []).filter(function (b) { return b && b.id !== bloc.id; }).concat([bloc]);
    await Cache.ecrireBrouillon(CLE_BLOCS, local.blocs).catch(function () {});
    await poser({ table: Attente.BLOCS, op: Attente.UPSERT, id: bloc.id, donnees: bloc });
  }

  // Des lignes de zone posées par un bloc (ou à son arrêt) : sur l'appareil
  // d'abord, puis par la file, APRÈS leur bloc (`depend`). Une ligne déjà en
  // vigueur recalcule la consigne de son exercice, comme `poserZone`.
  async function poserLignesDeZone(lignes, depend) {
    if (!lignes.length) return;
    local.zones = local.zones.concat(lignes);
    var maintenant = Date.now();
    if (consignes && consignes.parSlug) {
      lignes.forEach(function (l) {
        if (Date.parse(l.corrigee_a) <= maintenant) delete consignes.parSlug[l.exercise_slug];
      });
      versionConsignes++;
      sauverConsignes();
    }
    await Cache.ecrireLot('zones', lignes).catch(function () {});
    for (var i = 0; i < lignes.length; i++) {
      await poser({ table: Attente.ZONES, op: Attente.UPSERT, id: lignes[i].id, depend: depend || null, donnees: lignes[i] });
    }
  }

  // Les exercices des routines d'un dossier, dans l'ordre, sans doublon.
  function exercicesDuDossier(dossier) {
    var vus = {}, sortie = [];
    Routines.visibles(routines).filter(function (r) { return Routines.dossierPropre(r.dossier) === dossier; })
      .forEach(function (r) {
        (r.exercices || []).forEach(function (e) {
          var s = e && e.exercise_slug;
          if (s && !vus[s]) { vus[s] = true; sortie.push(s); }
        });
      });
    return sortie;
  }
  function nomsDuCatalogue() {
    var noms = {}, index = catalogueIndexe();
    Object.keys(index).forEach(function (s) { if (index[s] && index[s].nom) noms[s] = index[s].nom; });
    return noms;
  }

  // Les paris de CONSIGNE connus (serveur et appareil, l'appareil l'emporte),
  // observés : `[{ date, exercice, predite, observee }]` pour le bilan.
  function parisDeConsigneConnus() {
    var debutDe = {};
    (local.seances || []).forEach(function (x) { if (x && x.id) debutDe[x.id] = x.debut; });
    var parId = {};
    (local.parisLegers || []).forEach(function (l) { if (l && l.id) parId[l.id] = { l: l, seance: l.session_id }; });
    (local.predictions || []).forEach(function (l) {
      if (l && l.id) parId[l.id] = { l: l, seance: l.fondement ? l.fondement.seance : null };
    });
    return Object.keys(parId).map(function (k) { return parId[k]; }).filter(function (x) {
      return x.l.module === Moteur.MODULE_CONSIGNE && x.l.valeur_observee !== null && x.l.valeur_observee !== undefined &&
        x.seance && debutDe[x.seance];
    }).map(function (x) {
      return { date: debutDe[x.seance], seance: x.seance, exercice: x.l.exercise_slug,
               predite: Number(x.l.valeur_predite), observee: Number(x.l.valeur_observee) };
    });
  }

  // LE BILAN D'UN BLOC : les charges de travail de chacun de ses exercices
  // (la consigne les lit ainsi) et les paris de consigne — le moteur décide.
  function bilanDe(bloc) {
    var index = catalogueIndexe();
    var instantBilan = instantDuCalcul();
    var parSlug = {};
    (bloc.exercices || []).forEach(function (slug) {
      parSlug[slug] = Moteur.chargesDeTravailDe(faits.seancesDeLExercice(corpus(), slug), etatsExercices[slug],
        optionsDeConsigne(slug, index[slug], instantBilan));
    });
    return Moteur.bilanDuBloc(bloc, parSlug, parisDeConsigneConnus());
  }

  // Les paris de programme connus (serveur et appareil), et celui d'un bloc.
  function parisDeProgrammeConnus() {
    var parId = {};
    (local.programme || []).forEach(function (l) { if (l && l.id) parId[l.id] = l; });
    (local.predictions || []).forEach(function (l) {
      if (l && l.id && l.module === Moteur.MODULE_PROGRAMME) parId[l.id] = l;
    });
    return Object.keys(parId).map(function (k) { return parId[k]; });
  }
  function pariDuBloc(bloc) {
    return parisDeProgrammeConnus().filter(function (l) { return l.fondement && l.fondement.bloc === bloc.id; })[0] || null;
  }

  // Ce que la bibliothèque montre d'un dossier : le badge, la carte de fin de
  // bloc, ou « Faire de ce dossier un programme ». Rien n'est écrit ici.
  function programmeDuDossier(dossier) {
    var vue = programmeDuDossierCalcule(dossier);
    // Hors production, I13 se vérifie sur ce que la bibliothèque va montrer (la
    // garde du coach, comme pour chaque plan) ; en production, rien.
    garde.verifierProgramme(profil && profil.intention, dossier, vue);
    return vue;
  }

  function programmeDuDossierCalcule(dossier) {
    if (dossier === null) return null;
    // 60-2a (MOTEUR I13, précisé le 07/10/2026) — « JUSTE UN CARNET » : ni le
    // badge ni la carte de fin de bloc d'un programme en cours. Ce sont des
    // faits du programme ENTIER : l'Entretenir d'un seul exercice n'y touche
    // pas. Le MÊME fait que le plan lit (`Moteur.coachSeTait`) ; rien n'est
    // écrit, et le retour en Progresser les ramène (le bloc, lui, n'a pas bougé).
    // 60-2b (précisé le 08/10/2026) — et PAS DE RANGÉE « Faire de ce dossier un programme » :
    // un bloc créé en carnet serait invisible (pas de badge) et impossible à arrêter. La
    // porte vient donc AVANT la rangée, que la personne retrouve en repassant en Progresser.
    if (Moteur.coachSeTait(profil && profil.intention)) return {};
    var jour = jourDuJour();
    var b = Moteur.blocEnCours(local.blocs, dossier);
    if (!b) return { creer: exercicesDuDossier(dossier).length > 0 };
    var phases = Moteur.blocAPhases(b, routines);       // 193-2 : « Phase », jamais « Bloc Lourd » pour un programme de force
    var badge = Moteur.badgeDuBloc(b, jour, phases);
    if (!Moteur.blocTermine(b, jour)) return { badge: badge };
    var bilan = bilanDe(b);
    var pari = pariDuBloc(b);
    var fin = Moteur.carteFinDeBloc(b, bilan, nomsDuCatalogue(),
      pari ? { predite: pari.valeur_predite, observee: Moteur.progresDuBilan(bilan) } : null, phases);
    // 193-4 — la proposition de la semaine de test, à la fin de la 2ᵉ phase (la chaîne `precedent` des phases du dossier).
    if (fin && phases) {
      var prop = proposerSemaineDeTestDuProgramme(b);
      if (prop.propose) fin.test = { phrase: Moteur.phraseProposeTest(prop), faire: 'Faire la semaine de test' };
    }
    return { badge: badge, fin: fin };
  }
  function proposerSemaineDeTestDuProgramme(b) {
    var n = 0, manque = false, cur = b, vus = {};
    while (cur && !vus[cur.id]) {
      vus[cur.id] = true; n += 1;
      if (!cur.precedent) break;
      var prec = (local.blocs || []).filter(function (x) { return x && x.id === cur.precedent; })[0];
      if (!prec) { manque = true; break; }
      cur = prec;
    }
    var T = reponsesDesCartes().test;
    return Moteur.testProposable({ programme: true, phasesFaites: n, maillonManquant: manque,
                                   allegeeTerminee: b.decharge === true && Moteur.blocTermine(b, jourDuJour()), deja: !!(T && T.bloc === b.id) });
  }

  // 118 (audit du 16/10, 03 #5) — les dossiers qui portent un bloc en cours, dans l'ordre des blocs : la
  // bibliothèque montre celui qui n'a plus de routine (sinon le programme tournait sans badge ni « Arrêter »).
  function dossiersDeProgramme() {
    if (Moteur.coachSeTait(profil && profil.intention)) return [];
    return (local.blocs || []).filter(function (b) {
      return b && b.dossier && Moteur.blocEnCours(local.blocs, b.dossier) === b;
    }).map(function (b) { return b.dossier; });
  }

  // LA FEUILLE « FAIRE DE CE DOSSIER UN PROGRAMME » — ou celle qui AJUSTE le
  // bloc suivant (`depuis` : le bloc fini). Les exercices du bloc : par
  // défaut les barres polyarticulaires des routines du dossier, plus les
  // exercices prioritaires du questionnaire qui s'y trouvent (60-2b) ; décochables.
  function ouvrirProgramme(dossier, depuis) {
    var slugs = exercicesDuDossier(dossier);
    var suivant = depuis ? Moteur.blocSuivant(depuis) : null;
    var coches = suivant ? suivant.exercices
      : Moteur.exercicesParDefaut(slugs, catalogueIndexe(), Profil.prioritesDe(profil));
    coches.forEach(function (s) { if (slugs.indexOf(s) < 0) slugs.push(s); });
    var c = {};
    coches.forEach(function (s) { c[s] = true; });
    // MOTEUR §9.22 (60-2b) : le PREMIER bloc propose la zone de l'objectif (Force, Les deux :
    // Lourd ; sinon Mix), lu en direct dans le profil — hors séance, rien à geler. Le bloc
    // suivant garde sa règle fixe. Toujours modifiable dans la feuille.
    programmeEnCours = { dossier: dossier, precedent: depuis || null,
      zone: suivant ? suivant.zone : Moteur.zoneDuPremierBloc(profil && profil.objectif),
      semaines: suivant ? suivant.semaines : Moteur.SEMAINES_BLOC_DEFAUT, decharge: suivant ? suivant.decharge : true,
      debut: depuis ? 'aujourdhui' : 'lundi', slugs: slugs, coches: c, erreur: '' };
    rendreFeuilleProgramme();
    ouvrirVoile($('feuille-seance'));
  }

  function rendreFeuilleProgramme() {
    var p = programmeEnCours;
    if (!p) return;
    var noms = nomsDuCatalogue();
    var lundi = lundiQuiSuit(jourDuJour());
    var maj = function (champ) { return function (v) { p[champ] = v; p.erreur = ''; rendreFeuilleProgramme(); }; };
    Rendu.rendreFeuilleProgramme($('feuille-contenu'), {
      dossier: p.dossier, suite: !!p.precedent, zone: p.zone, semaines: p.semaines, decharge: p.decharge, debut: p.debut,
      zones: Moteur.ZONES_DE_BLOC.map(function (z) { return { cle: z, texte: Moteur.libelleZoneDeBloc(z, true) }; }),
      zoneCourte: Moteur.libelleZoneDeBloc(p.zone),
      bornesSemaines: Moteur.SEMAINES_BLOC_MIN + ' à ' + Moteur.SEMAINES_BLOC_MAX,
      semainesPossibles: [3, 4, 5, 6].filter(function (n) {
        return n >= Moteur.SEMAINES_BLOC_MIN && n <= Moteur.SEMAINES_BLOC_MAX;
      }),
      debuts: [{ cle: 'lundi', texte: Modele.jourNomme(lundi) }, { cle: 'aujourdhui', texte: 'aujourd’hui' }],
      exercices: p.slugs.map(function (s) { return { slug: s, nom: noms[s] || s, coche: !!p.coches[s] }; }),
      erreur: p.erreur,
      surZone: maj('zone'), surSemaines: maj('semaines'), surDecharge: maj('decharge'), surDebut: maj('debut'),
      surCocher: function (slug) { p.coches[slug] = !p.coches[slug]; p.erreur = ''; rendreFeuilleProgramme(); },
      surValider: validerProgramme,
      surAnnuler: function () { programmeEnCours = null; fermerVoile(); }
    });
  }

  async function validerProgramme() {
    var p = programmeEnCours;
    if (!p) return;
    var exercices = p.slugs.filter(function (s) { return p.coches[s]; });
    if (!exercices.length) { p.erreur = 'Coche au moins un exercice.'; return rendreFeuilleProgramme(); }
    programmeEnCours = null;
    fermerVoile();
    await creerBloc({ dossier: p.dossier, zone: p.zone, semaines: p.semaines, decharge: p.decharge,
      debut: p.debut === 'aujourdhui' ? jourDuJour() : lundiQuiSuit(jourDuJour()),
      exercices: exercices, precedent: p.precedent });
    rendreSaisie();
  }

  // UN BLOC NAÎT : le précédent se termine d'abord (un seul bloc en cours par
  // dossier, l'index de la base), puis le bloc, ses lignes de zone, et — pour
  // le bloc proposé, commencé TEL QUEL (`o.telQuel`, « Commencer le bloc
  // Lourd ») — son pari (§9.22). Un bloc ajusté n'en porte pas : le coach ne
  // parie pas sur ce qu'il n'a pas proposé (53-2 bis, D3).
  async function creerBloc(o) {
    var t = instantDuJour();
    if (o.precedent) await terminerBloc(o.precedent, 'termine', true);
    var bloc = { id: uuid(), user_id: idUtilisateur(), dossier: o.dossier, zone: o.zone, debut: o.debut,
                 semaines: o.semaines, decharge: !!o.decharge, exercices: o.exercices.slice(), statut: 'en_cours',
                 precedent: o.precedent ? o.precedent.id : null, created_at: t, modifie_a: t };
    await poserBloc(bloc);
    // 193-2 — une PHASE (`sansZones`) n'écrit aucune ligne de zone : ses zones sont celles des routines (`routine_exercises.zone`).
    if (!o.sansZones) await poserLignesDeZone(Moteur.zonesPosees(bloc, uuid, idUtilisateur()), bloc.id);
    if (o.precedent && o.telQuel === true) await poserPariDeProgramme(bloc, o.precedent);
    return bloc;
  }

  // Le bloc qui finit (`termine`) ou qu'on arrête (`arrete`). Fini, son pari
  // de programme s'observe : combien de ses exercices ont progressé.
  async function terminerBloc(bloc, statut, fini) {
    if (fini) await observerPariDeProgramme(bloc);
    await poserBloc(Object.assign({}, bloc, { statut: statut, modifie_a: instantDuJour() }));
  }

  async function poserPariDeProgramme(bloc, precedent) {
    var pari = {
      id: uuid(), user_id: idUtilisateur(), module: Moteur.MODULE_PROGRAMME, module_version: VERSION_PROGRAMME,
      emise_a: instantDuJour(), exercise_slug: null, grandeur: Moteur.GRANDEUR_PROGRAMME,
      horizon_jours: 7 * bloc.semaines, valeur_predite: bloc.exercices.length, borne_basse: null, borne_haute: null,
      fondement: { bloc: bloc.id, precedent: precedent.id, dossier: bloc.dossier, zone: bloc.zone, debut: bloc.debut,
                   semaines: bloc.semaines, exercices: bloc.exercices.slice() },
      valeur_observee: null, observee_a: null, set_observe: null
    };
    local.predictions = (local.predictions || []).concat([pari]);
    await Cache.ecrireLot('predictions', [pari]).catch(function () {});
    await poser({ table: Attente.PREDICTIONS, op: Attente.UPSERT, id: pari.id, depend: pari.id, donnees: pari });
  }

  async function observerPariDeProgramme(bloc) {
    var pari = pariDuBloc(bloc);
    if (!pari || (pari.valeur_observee !== null && pari.valeur_observee !== undefined)) return;
    var ligne = Object.assign({}, pari, { valeur_observee: Moteur.progresDuBilan(bilanDe(bloc)),
                                          observee_a: instantDuJour(), set_observe: null });
    var trouve = false;
    local.predictions = (local.predictions || []).map(function (l) {
      if (!l || l.id !== ligne.id) return l;
      trouve = true;
      return ligne;
    });
    if (!trouve) local.predictions = local.predictions.concat([ligne]);
    await Cache.ecrireLot('predictions', [ligne]).catch(function () {});
    await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: ligne.id, depend: ligne.id, alaFin: true,
                  donnees: { valeur_observee: ligne.valeur_observee, observee_a: ligne.observee_a, set_observe: null } });
  }

  // Les trois gestes de la fin du bloc, et l'arrêt en plein bloc.
  async function commencerBlocSuivant(dossier) {
    var b = Moteur.blocEnCours(local.blocs, dossier);
    var s = b ? Moteur.blocSuivant(b, Moteur.blocAPhases(b, routines)) : null;
    if (!s) return;
    await creerBloc({ dossier: dossier, zone: s.zone, semaines: s.semaines, decharge: s.decharge, debut: jourDuJour(),
                      exercices: s.exercices, precedent: b, telQuel: true, sansZones: s.sansZones === true });
    rendreSaisie();
  }
  // L'ARRÊT (§9.22, delta 53-2 ter) rend à chaque exercice du bloc LA ZONE
  // D'AVANT LE PROGRAMME (celle d'avant le début de son premier bloc), dans une
  // ligne datée de l'arrêt, origine « bloc » — sauf un exercice que la personne
  // a corrigé pendant le programme. Avant le début, rien ne s'écrit : les
  // lignes du bloc sont inertes (`zonesLues`). Tout est dans `lignesDArret`.
  async function arreterProgramme(dossier) {
    var b = Moteur.blocEnCours(local.blocs, dossier);
    if (!b) return;
    var fini = Moteur.blocTermine(b, jourDuJour());
    await terminerBloc(b, fini ? 'termine' : 'arrete', fini);
    var arrete = (local.blocs || []).filter(function (x) { return x && x.id === b.id; })[0] || b;
    var lignes = Moteur.lignesDArret(arrete, local.blocs || [], local.zones || [], instantDuJour(), uuid, idUtilisateur());
    await poserLignesDeZone(lignes, b.id);
    rendreSaisie();
  }
  function ouvrirBlocEnCours(dossier) {
    var b = Moteur.blocEnCours(local.blocs, dossier);
    if (!b) return;
    Rendu.rendreFeuilleBlocEnCours($('feuille-contenu'), {
      dossier: dossier, badge: Moteur.badgeDuBloc(b, jourDuJour(), Moteur.blocAPhases(b, routines)),
      exercices: (b.exercices || []).map(function (s) { return nomsDuCatalogue()[s] || s; }),
      surArreter: function () { fermerVoile(); arreterProgramme(dossier); },
      surFermer: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ── §9.17 — LE MODE DE CHAQUE EXERCICE ───────────────────────────────────
  //
  // « Progresser » ou « Entretenir », choisi sur l'étiquette de l'exercice. Le
  // MÊME patron que les zones, ligne pour ligne : un historique en ajout seul,
  // la plus récente fait foi, fondu par `id`, posé sur l'appareil d'abord puis
  // envoyé par la file. Le calcul de « quel est le mode en vigueur » vit dans le
  // moteur (`modeEnVigueur`) ; l'app lui passe les lignes.
  function fondreModes(locales, distantes) { return fondreZones(locales, distantes); }
  function modeDe(slug) { return Moteur.modeEnVigueur(local.modes, slug); }

  // L'intention qu'un exercice reçoit du plan : celle du profil est
  // l'interrupteur général, puis le choix de l'exercice (`intentionDe`). Un seul
  // endroit la compose — la consigne, le plan, les écrans la lisent d'ici.
  function intentionDeLExercice(slug) {
    return Moteur.intentionDe(profil && profil.intention, modeDe(slug));
  }

  // §9.17 — la réponse à la carte du lest, lue au profil : `oui`, `non`, ou
  // `null`. UNE réponse pour tout le profil (« Pas de lest » vaut pour toutes
  // les tractions et tous les dips), datée par `lest_reponse_le`.
  function lestReponseDe() {
    var v = profil && profil.lest_reponse;
    return v === 'oui' || v === 'non' ? v : null;
  }
  // 175 (MOTEUR §9.17 bis) — LA VARIANTE SANS MATÉRIEL de la marche lestée d'un exercice (`Modele.marcheSuivante`, la seule
  // définition), `{ slug, nom }`, ou `null`. La carte du lest la propose avec le lest.
  function varianteDe(index, slug) {
    var m = index && slug ? Modele.marcheSuivante(index, slug) : null;
    if (!m || m.type !== 'lest' || !m.variante || !index[m.variante]) return null;
    return { slug: m.variante, nom: index[m.variante].nom || m.variante };
  }
  // 175 — LA RÉPONSE AU LEST D'UN EXERCICE : celle du profil ; sinon, sur un exercice dont la carte du lest proposait aussi
  // la variante, une réponse à cette carte (`marche_reponses[slug]` : la variante ajoutée, ou « Rester aux … ») vaut « pas de
  // lest » pour lui seul — la carte du lest ne revient pas, et les reps continuent. Le profil, lui, n'est pas touché.
  function lestReponseDeLExercice(slug) {
    var g = lestReponseDe();
    if (g !== null) return g;
    var r = slug ? marcheReponsesDe()[slug] : null;
    if (r && typeof r === 'object' && (r.r === 'oui' || r.r === 'non') && varianteDe(catalogueIndexe(), slug)) return 'non';
    return null;
  }

  // MOTEUR §9.17 bis (127) — les réponses à la carte « marche suivante », lues au profil (`marche_reponses`, v2_099) :
  // `{ [slug de départ]: { r, le, aide } }`, ou `{}` (pas de réponse, colonne absente). La démonstration (`demoMarche`)
  // garde les siennes EN MÉMOIRE, par-dessus.
  var demoMarche = null;
  function marcheReponsesDe() {
    var v = profil && profil.marche_reponses;
    var lues = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    return demoEscalier() && demoMarche ? Object.assign({}, lues, demoMarche) : lues;
  }

  // 60-2a — LA PESÉE du questionnaire (écran « Toi »). Sur l'appareil d'abord :
  // la courbe, le profil et le rapport au poids la voient tout de suite ; puis
  // par la file. UN identifiant par jour — deux pesées le même jour se
  // compressent en une (la dernière gagne), et la base fusionne sur
  // (`user_id`, `date`). La ligne locale REMPLACE celle du serveur pour ce jour,
  // en mémoire comme au cache : sinon la courbe porterait deux points.
  async function poserPesee(pesee) {
    var id = 'pesee-' + pesee.date;
    var ligne = { id: id, date: pesee.date, poids_kg: pesee.poids_kg, source: 'app' };
    var remplacees = (local.pesees || []).filter(function (l) {
      return l && l.date === pesee.date && l.id !== id;
    }).map(function (l) { return l.id; });
    local.pesees = (local.pesees || []).filter(function (l) {
      return l && l.date !== pesee.date;
    }).concat([ligne]);
    if (remplacees.length) await Cache.supprimer('pesees', remplacees).catch(function () {});
    await Cache.ecrireLot('pesees', [ligne]).catch(function () {});
    await poser({ table: Attente.PESEES, op: Attente.UPSERT, id: id,
                  donnees: { user_id: idUtilisateur(), date: pesee.date, poids_kg: pesee.poids_kg, source: 'app' } });
  }

  async function poserMode(slug, mode) {
    var id = uuid();
    var ligne = {
      id: id,
      user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
      exercise_slug: slug,
      mode: mode,
      choisi_a: new Date().toISOString()
    };
    local.modes = local.modes.concat([ligne]);
    // Même exception au gel de la consigne que la zone (§9.13 bis, 49-U1) :
    // l'utilisateur change LUI-MÊME le mode de CET exercice. Il se recalcule,
    // lui seul ; ses séries validées restent figées par leurs paris.
    if (consignes && consignes.parSlug) {
      delete consignes.parSlug[slug];
      versionConsignes++;
      sauverConsignes();
    }
    await Cache.ecrireLot('modes', [ligne]).catch(function () {});
    await poser({ table: Attente.MODES, op: Attente.UPSERT, id: id, donnees: ligne });
  }

  // ── Cache ────────────────────────────────────────────────────────────────
  async function chargerCache() {
    local.seances = await Cache.lireTout('seances');
    local.series = await Cache.lireTout('series');
    local.exercices = await Cache.lireTout('exercices');
    // 126 (ES §7 quindecies.11) — les noms alternatifs communs, avec le catalogue : la recherche les cherche hors
    // ligne. Un magasin vide (cache d'avant, première ouverture) : la recherche cherche le nom seul, en attendant.
    try { local.alias = await Cache.lireTout('alias'); } catch (e) { local.alias = []; }
    local.pesees = await Cache.lireTout('pesees');
    // §9.1.1 — les corrections de zone. Elles sont LUES AU DÉMARRAGE comme le
    // reste : une zone choisie hier doit tenir avant même que le réseau
    // réponde, sinon la première consigne de la séance serait celle d'avant la
    // correction, puis changerait sous les yeux.
    local.zones = await Cache.lireTout('zones');
    // §9.17 — le mode de chaque exercice, lu au démarrage pour la même raison.
    local.modes = await Cache.lireTout('modes');
    // 99 (MOTEUR §9.24) — les choix de la semaine qui déraille, gardés sur l'appareil pour le hors-ligne.
    try { local.semaineChoix = (await Cache.lireBrouillon(CLE_SEMAINE)) || []; } catch (e) { local.semaineChoix = []; }
    // §9.11 (48c) — ce que le moteur a DÉJÀ noté. Lu au démarrage, parce que
    // c'est ce qui l'empêche de réécrire : fermer l'app au milieu d'une séance
    // et la rouvrir rejouerait sinon toutes les consignes de cette séance.
    local.predictions = await Cache.lireTout('predictions');
    // §12.9 (49-U13) — les séances SOUS CONSIGNE vues par le serveur (tous
    // appareils), relues à la dernière synchronisation : le compteur de
    // stagnation tient hors ligne.
    try { local.sousConsigne = (await Cache.lireBrouillon(CLE_SOUS_CONSIGNE)) || {}; }
    catch (e) { local.sousConsigne = {}; }
    // MOTEUR §14.4 (49-U14) — les compteurs figés dans les paris (tous
    // appareils) et les paris de l'escalier, relus à la dernière
    // synchronisation : la carte et la semaine allégée tiennent hors ligne.
    try { local.parisLegers = (await Cache.lireBrouillon(CLE_PARIS_LEGERS)) || []; }
    catch (e) { local.parisLegers = []; }
    try { local.escalier = (await Cache.lireBrouillon(CLE_PARIS_ESCALIER)) || []; }
    catch (e) { local.escalier = []; }
    // MOTEUR §9.22 (53-2) — les blocs des programmes et leurs paris, relus à la
    // dernière synchronisation (et posés ici) : le badge, la décharge
    // planifiée et la fin du bloc tiennent hors ligne.
    try { local.blocs = (await Cache.lireBrouillon(CLE_BLOCS)) || []; }
    catch (e) { local.blocs = []; }
    try { local.programme = (await Cache.lireBrouillon(CLE_PARIS_PROGRAMME)) || []; }
    catch (e) { local.programme = []; }
    // 83 — les séries que cet appareil connaît, par séance (`connaitre`).
    try { local.connues = (await Cache.lireBrouillon(CLE_CONNUES)) || {}; }
    catch (e) { local.connues = {}; }
    // 109 (MOTEUR §9.25) — les objectifs (et si la table existe : sans la migration v2_089, pas de carte) et leurs
    // paris, relus à la dernière synchronisation : la page d'exercice les montre hors ligne.
    try {
      var objs = (await Cache.lireBrouillon(CLE_OBJECTIFS)) || null;
      local.objectifs = (objs && objs.lignes) || [];
      local.objectifsDispo = objs && typeof objs.dispo === 'boolean' ? objs.dispo : null;
    } catch (e) { local.objectifs = []; local.objectifsDispo = null; }
    try { local.parisObjectif = (await Cache.lireBrouillon(CLE_PARIS_OBJECTIF)) || []; }
    catch (e) { local.parisObjectif = []; }
    // 58-2 — le journal des records, et où en est son remplissage.
    try { local.records = await Cache.lireTout('records'); }
    catch (e) { local.records = []; }
    try { journalDecide = !!(await Cache.lireMeta(CLE_JOURNAL)); }
    catch (e) { journalDecide = false; }
    // 185 — ce que la saisie vérifiée a appris (deux « Oui » au même genre, sur le même exercice : plus de question).
    try { reponsesDeSaisie = (await Cache.lireMeta(CLE_REPONSES_SAISIE)) || {}; }
    catch (e) { reponsesDeSaisie = {}; }
    // 106 — les messages du groupe écrits hors ligne, gardés sur le téléphone : ils partiront au retour du réseau.
    try { grp.file = Social.fileDeMessages(await Cache.lireBrouillon(CLE_FILE_GROUPE)); }
    catch (e) { grp.file = []; }
    // 121 (05 #5) — ce que l'appareil a déjà fait partir de mes nombres de guilde (comparé au démarrage).
    try { scoresGuildeConnus = (await Cache.lireMeta(CLE_SCORES_GUILDE)) || null; }
    catch (e) { scoresGuildeConnus = null; }
    // 121 (05 #12) — les traces « Faite en groupe avec … » : le détail d'une séance les montre hors ligne.
    try { grp.traces = Social.tracesDuGroupe(await Cache.lireBrouillon(CLE_TRACES_GROUPE)); }
    catch (e) { grp.traces = {}; }
    rangerSeances();
    indexerParSeance();
    recalculerEtats();
  }

  // INVARIANT : `local.seances` ne contient QUE des séances terminées, de la
  // plus récente à la plus ancienne.
  //
  // ⚠️ LE FILTRE EST ICI, ET NULLE PART AILLEURS DANS LA LECTURE.
  //
  // Cette fonction est appelée aux TROIS seuls endroits où `local.seances`
  // change — le cache, la synchronisation, l'adoption d'une séance terminée.
  // C'est donc un goulot : une séance en cours ne PEUT PAS entrer dans
  // `local.seances`, quel que soit le chemin, y compris un chemin qu'on
  // ajouterait demain sans y penser.
  //
  // L'alternative — filtrer à chaque point de lecture — demandait de traiter
  // les SEPT lectures qui dérivent de `local.seances` (semaine, sommaire de
  // progression, période, relevé par muscle, calendrier, détail d'une séance,
  // colonne « précédent ») et d'y penser à la huitième. C'est exactement ainsi
  // que le défaut est né.
  //
  // La règle elle-même vit dans `sync.js`, module pur : c'est là qu'elle se
  // teste. Ici il ne reste que le goulot.
  function rangerSeances() {
    local.seances = Sync.ranger(local.seances);
  }

  // §5.2 — « monte en charge » est une propriété MESURÉE sur tout l'historique,
  // pas devinée séance par séance. Elle se recalcule quand le corpus change,
  // jamais à chaque rendu : c'est un balayage des 28 000 séries.
  //
  // ⚠️ Elle lit donc TOUT l'historique, y compris les séances postérieures à
  // celle qu'on affiche. Le banc Python fait pareil, et c'est sans conséquence
  // ici — l'état décrit une habitude de l'exercice, pas un état à une date.
  // Ça deviendra une vraie question au chantier suivant, quand le moteur
  // prescrira : une consigne ne doit rien lire de l'avenir.
  function recalculerEtats() {
    // Le corpus a changé, donc les dernières dates par exercice aussi. Elles se
    // recalculent à la prochaine ouverture de la liste, pas ici : cet écran
    // n'est presque jamais celui qu'on regarde pendant une synchronisation.
    faits.oublierDates();
    // ⚠️ PLUS `consignes = null` (49-U1, D7) : la consigne est figée pour la
    // séance ; ce qui arrive en arrière-plan sert à la séance suivante.
    constats = null;
    try {
      etatsExercices = Palier.etatsExercices(Palier.seanceExercices(local.series));
    } catch (e) {
      etatsExercices = {};
      console.warn('États d\u2019exercice indisponibles :', texteErreur(e));
    }
  }

  // ⚠️ 118 (suite de 117) — CE QUI ATTEND HORS DE LA FILE appartient aussi à son compte : la réponse de profil pas
  // encore envoyée (`CLE_PROFIL_ENVOI`, avec la ligne en cache qu'elle complète — sans elle, l'envoi ne part pas) et
  // les messages du groupe écrits hors ligne (`CLE_FILE_GROUPE`). Un autre compte qui entrait les effaçait ; ils sont
  // désormais gardés sous l'identifiant du compte qui part, et rendus quand il revient. Rien n'est gardé quand rien
  // n'attend : la ligne de profil seule n'est pas une attente.
  function gardesDuCompte() {
    return [{ magasin: 'meta', cle: CLE_PROFIL_ENVOI }, { magasin: 'meta', cle: CLE_PROFIL },
            { magasin: 'brouillon', cle: CLE_FILE_GROUPE }];
  }
  function preparerGardesDuCompte(v) {
    var envoi = Profil.lireEnAttente(v['meta:' + CLE_PROFIL_ENVOI]);
    var out = {};
    out['meta:' + CLE_PROFIL_ENVOI] = envoi || null;
    out['meta:' + CLE_PROFIL] = envoi ? (v['meta:' + CLE_PROFIL] || null) : null;
    out['brouillon:' + CLE_FILE_GROUPE] = Social.fileDeMessages(v['brouillon:' + CLE_FILE_GROUPE]);
    return out;
  }

  // Le cache appartient à un compte et à un seul. Un cache qui survivrait à un
  // changement de compte montrerait les séances de quelqu'un d'autre.
  async function garantirProprietaire(userId) {
    var meta = await Cache.lireMeta('proprietaire');
    if (Sync.cacheAppartientA(meta, userId)) return;
    // 59-5 — un autre compte entre : ce qui était en vol pour le précédent
    // n'écrira plus (même règle que « Quitter »).
    nouvelleGeneration();
    // 117 (audit du 16/10, 06 #6) — tout est vidé SAUF la file du compte qui part, gardée sous son identifiant ; et
    // la file gardée pour le compte qui entre lui est rendue (relue juste après, `chargerSeanceLocale`). Seul
    // « Quitter » explicite vide une file, après sa fenêtre.
    // 118 — et ce qui attend HORS de la file (la réponse de profil, les messages du groupe) : gardé de même, rendu de
    // même (relu juste après, `chargerCache` et `chargerProfilLocal`).
    var changement = await Cache.changerDeCompte(meta && meta.userId, userId, gardesDuCompte(), preparerGardesDuCompte);
    if (changement && changement.rendue && changement.rendue.length) {
      console.warn('File d\u2019envoi rendue à ce compte : ' + changement.rendue.length + ' envoi(s) gardé(s) depuis sa dernière visite.');
    }
    // Les routines ne sont pas dans le cache, mais elles appartiennent au
    // compte précédent : les laisser en mémoire montrerait la bibliothèque de
    // quelqu'un d'autre le temps d'une requête.
    routines = []; generationRoutines++; brouillon = null; etatRoutines = { code: 'jamais', message: '' }; derniereLectureRoutines = 0;
    // La séance en cours et la file appartiennent au compte précédent. Le
    // changement de compte ci-dessus a vidé leurs magasins (la file, gardée à
    // part pour lui) ; on remet la mémoire d'accord avec le disque.
    seance = null; attente = []; chrono = null;
    oublierSuppressionDifferee();
    // §12.9 (49-U13) — les séances sous consigne aussi (le brouillon qui les
    // porte vient d'être effacé avec le reste).
    local.sousConsigne = {};
    local.parisLegers = [];
    local.escalier = [];
    local.blocs = [];
    local.programme = [];
    local.connues = {};
    // 106 — le groupe et ses messages gardés appartiennent au compte précédent (leur brouillon vient d'être vidé).
    oublierGroupe();
    // 121 (05 #13) — le social aussi : ses liens, son badge, sa guilde, ce qu'il a publié.
    oublierSocial();

    // 109 — les objectifs et leurs paris appartiennent au compte précédent.
    local.objectifs = []; local.objectifsDispo = null; local.parisObjectif = [];
    // 58-2 — le journal des records aussi (son magasin vient d'être vidé), et
    // son remplissage : il se décidera pour le compte qui arrive.
    local.records = [];
    // 59-2 — les paris du compte précédent : leur magasin est désormais vidé
    // avec les autres (`MAGASINS`), la mémoire le suit.
    local.predictions = [];
    journalDecide = false;
    remplissage = null;
    // Le profil aussi appartient au compte précédent — et son envoi en attente
    // avec lui. Le rejouer sur le compte suivant écrirait la taille de
    // quelqu'un d'autre dans sa ligne `profiles`.
    // ⚠️ MAIS PAS LE PSEUDO À INSCRIRE (60-2c). Il n'est pas l'état du compte précédent : c'est celui du
    // compte QUI ENTRE, posé par `soumettreEntree` juste avant `signUp` — et un compte neuf n'est jamais
    // propriétaire du cache, donc cette branche s'exécute à CHAQUE inscription. Le remettre à zéro ici
    // faisait naître la ligne de profil sans pseudo. Il tombe ailleurs : « Quitter » (`deconnecter`),
    // l'échec d'une inscription, une connexion (`soumettreEntree`) et la création de la ligne (`chargerProfil`).
    profil = null; profilAEnvoyer = false; refusProfil = null;
    fermerQuestionnaire(); envoiProfil = null; versionProfil = 0; ligneACreer = false;
    faits.oublierDates();
    await Cache.ecrireMeta('proprietaire', { userId: userId });
  }

  // Un cache construit par une version défaillante est incomplet ET se croit à
  // jour : son curseur est au maximum, l'incrémental ne redemandera rien. On
  // efface donc le curseur UNE FOIS — le cache, lui, reste en place, pour que
  // l'app s'ouvre sur ce qu'elle a pendant que le reste revient.
  //
  // La version n'est écrite qu'APRÈS une synchronisation réussie : marquer
  // avant laisserait un cache toujours incomplet réputé à jour, c'est-à-dire
  // exactement le défaut qu'on corrige.
  async function armerResynchronisation() {
    var marque = await Cache.lireMeta('formeSync');
    var attendu = await Cache.lireMeta('attendu');
    var enMagasin = await compteSur(function () { return Cache.compterMagasin('series'); });
    // Deux raisons de reprendre une passe complète : la forme a changé, ou le
    // magasin est plus court que ce qu'on y a mis. La seconde est le filet —
    // elle casse le cliquet même pour un cas qu'on n'aurait pas prévu.
    if (!Sync.doitReprendre(marque, enMagasin, attendu)) return false;
    await Cache.ecrireMeta('curseurSeries', null);
    return true;
  }

  // ── Synchronisation ──────────────────────────────────────────────────────
  async function synchroniser() {
    if (syncEnCours) return;
    syncEnCours = true;
    gestesEnVol = {};   // 148 — avant toute lecture : seuls les gestes posés PENDANT cette synchronisation comptent
    var g = generation;
    var envoisAuDepart = envoisDeSeries;
    var fileAuDepart = Attente.seancesEnAttente(attente);
    try {
      var resync = await armerResynchronisation();
      var curseur = await Cache.lireMeta('curseurSeries');

      // ⚠️ LE COMPTE D'ABORD, LA LISTE ENSUITE (PR 8 de la consolidation).
      // Le serveur annonce ce qu'il a. C'est ce qui autorise la purge, et
      // c'est ce qui permet de dire qu'il manque quelque chose au lieu de
      // l'ignorer. Les deux lectures ne sont pas atomiques, et la vidange de
      // la file tourne EN MÊME TEMPS (au retour du réseau, l'entrée
      // synchronise pendant que la file envoie). Lu APRÈS la liste, le compte
      // voyait la série montée entre les deux : « 1 série manquante » à
      // tort, jusqu'à la synchronisation suivante (2 bancs complets sur 4).
      // Lu AVANT, il est un plancher : ce qu'il compte est dans la liste, et
      // ce qui arrive entre les deux n'est qu'un surplus, que la décision de
      // complétude accepte (`Sync.verifierCompletude`).
      //
      // ⚠️ ET UN COMPTE QUI ÉCHOUE FAIT ÉCHOUER LA SYNCHRONISATION. Lus en
      // premier, les comptes sont la première requête : hors ligne, avaler
      // leur échec (`compteSur`) laissait la synchronisation tenter encore
      // deux requêtes avant de renoncer — trois fois plus long, et l'écran
      // des routines n'annonçait plus « Réessayer » à temps (banc des
      // routines, section 9). Un serveur qui ne renvoie pas de compte rend
      // `null` sans exception : ce cas-là reste « non vérifiable ».
      var compteSeances = await Donnees.compterSeances();
      var compteSeries = await Donnees.compterSeries();

      // sessions : complet (545 Ko, aucune colonne de modification, capte aussi
      // les suppressions). sets : incrémental (15 Mo, 28× plus lourd).
      var seances = await Donnees.toutesLesSeances();
      var nouvellesSeries = await Donnees.seriesDepuis(curseur);
      var exercices = await Donnees.tousLesExercices();
      // 126 (ES §7 quindecies.11) — LES NOMS ALTERNATIFS COMMUNS (`exercise_alias`), au même moment que le catalogue
      // et rangés comme lui (vider-puis-écrire, plus bas). ACCESSOIRES comme les pesées : une lecture qui échoue
      // n'emporte pas la synchronisation, et le cache garde ce qu'il avait (la recherche trouve toujours par nom).
      var alias = await essayer(Donnees.aliasCommuns);
      // Les pesées sont ACCESSOIRES : 116 lignes, une page, aucun curseur. Une
      // lecture qui échoue ne doit pas emporter la synchronisation des séries —
      // c'est le gros du travail et le cœur de l'app. `null` veut dire « on
      // n'a rien reçu », et le cache garde ce qu'il avait.
      var pesees = await essayer(Donnees.toutesLesPesees);
      // Les corrections de zone sont ACCESSOIRES au même titre que les pesées :
      // une lecture qui échoue ne doit pas emporter la synchronisation des
      // séries. `null` veut dire « on n'a rien reçu », et le cache garde ce
      // qu'il avait — donc les choix faits ici tiennent.
      var zones = await essayer(Donnees.mesZones);
      var modes = await essayer(Donnees.mesModes);
      // 99 (MOTEUR §9.24) — les choix des semaines qui déraillent (les deux dernières semaines suffisent).
      var choixSemaine = await essayer(function () {
        return Donnees.mesChoixDeSemaine(Deraille.lundiDe(Moteur.jourCivil(new Date(Date.now() - 7 * 864e5))));
      });

      // §12.9 (49-U13) — les paris du compte, EN LECTURE SEULE, pour une seule
      // chose : savoir quelles séances ont reçu une consigne (« sous
      // consigne »). Trois colonnes (`Donnees.seancesAvecPari`). Accessoire
      // comme les zones : un échec garde ce qu'on avait. Ils n'entrent PAS dans
      // `local.predictions` (le circuit des paris et des observations de la
      // séance en cours n'en dépend pas, et n'en change pas). En mémoire TOUT
      // DE SUITE : une consigne qui se fige pendant les écritures qui suivent
      // doit déjà les voir.
      //
      var parisDuCompte = await essayer(Donnees.seancesAvecPari);
      if (!generationValide(g)) return;
      if (parisDuCompte) {
        local.sousConsigne = seancesAvecPari(parisDuCompte);
        // §14.4 (49-U14) — et le compteur figé dans chacun (`compteur`).
        local.parisLegers = parisDuCompte;
      }
      // MOTEUR §14.4 (49-U14) — LES PARIS DE L'ESCALIER, en entier : peu de
      // lignes (une par carte), lues à part. Accessoires comme les autres.
      var escalierDuCompte = await essayer(Donnees.parisEscalier);
      if (!generationValide(g)) return;
      if (escalierDuCompte) {
        local.escalier = escalierDuCompte.filter(function (l) { return l && l.module === Moteur.MODULE_ESCALIER; });
      }
      // MOTEUR §9.22 (53-2) — les blocs des programmes, et leurs paris.
      // Accessoires comme les autres ; FONDUS, jamais remplacés : un bloc posé
      // hors ligne n'est pas encore chez le serveur.
      var blocsDuCompte = await essayer(Donnees.mesBlocs);
      if (!generationValide(g)) return;
      if (blocsDuCompte) local.blocs = fondreBlocs(local.blocs, blocsDuCompte);
      var programmeDuCompte = await essayer(Donnees.parisProgramme);
      if (!generationValide(g)) return;
      if (programmeDuCompte) local.programme = fondreZones(local.programme, programmeDuCompte);
      // 109 (MOTEUR §9.25) — les objectifs et leurs paris. Accessoires comme les autres ; une table absente
      // (migration v2_089 pas lancée) le DIT : la carte ne s'affiche pas, et rien ne part vers elle.
      var versionObjectifsALaLecture = versionObjectifs;   // 139 — voir la garde à l'application
      var objectifsEnFileALaLecture = objectifsEnFile();
      var objectifsDuCompte = await lireObjectifs();
      if (!generationValide(g)) return;
      var parisObjectifDuCompte = objectifsDuCompte && objectifsDuCompte.lignes ? await essayer(Donnees.parisObjectif) : null;
      if (!generationValide(g)) return;

      // ⚠️ La liste du serveur ne contient PAS ce qui n'y est pas encore monté.
      // Sans cette garde, la première synchronisation réussie effacerait une
      // séance saisie hors ligne — au moment précis où le réseau revient.
      local.seances = Sync.remplacer(seances, {
        conserver: Attente.seancesEnAttente(attente),
        existants: local.seances
      });
      // Le compte de contrôle porte sur ce que le SERVEUR a envoyé, pas sur la
      // liste augmentée des séances locales : celles-ci ne sont pas encore
      // comptées côté serveur, et les inclure ferait croire à un surplus.
      var listeComplete = Sync.verifierCompletude(seances.length, compteSeances).complet;
      var fusionnees = Sync.fusionner(local.series, nouvellesSeries);
      // ⚠️ LA PURGE PASSE AVANT LE RANGEMENT, ET L'ORDRE COMPTE.
      //
      // Elle répond à « cette séance existe-t-elle encore ? », pas à « est-elle
      // terminée ? ». Rangée d'abord, la liste ne contiendrait plus la séance
      // en cours, et la purge effacerait ses séries montées — que
      // `compterSeries` compte toujours côté serveur. Le curseur cesserait
      // d'avancer, « N séries manquantes » s'afficherait, et 15 Mo
      // redescendraient à chaque synchronisation, pendant toute la séance.
      local.series = Sync.purgerSeriesOrphelines(fusionnees, local.seances, listeComplete);
      // 117 (audit du 16/10, 06 #1) — et les séries effacées AILLEURS (une correction sur un autre appareil), que
      // l'incrémental ne voit jamais : rapprochées par séance, seulement quand le compte dit qu'il y en a.
      if (listeComplete) {
        local.series = await rapprocherSeriesDuServeur(local.series, seances, compteSeries, fileAuDepart, envoisAuDepart, g);
        if (!generationValide(g)) return;
      }
      local.exercices = Sync.remplacer(exercices);
      if (alias) local.alias = Sync.remplacer(alias);
      // Et MAINTENANT le corpus de lecture : la séance en cours sort ici, une
      // ligne avant que le cache ne soit écrit — donc elle n'y entre pas non
      // plus.
      rangerSeances();
      indexerParSeance();
      recalculerEtats();

      // Séances et exercices : petits, rafraîchis en entier, vider-puis-écrire
      // dans UNE transaction. Séries : on n'efface plus rien d'abord — `put`
      // est un upsert, et ce que la purge a retiré se supprime explicitement.
      if (!generationValide(g)) return;
      await Cache.remplacerTout('seances', local.seances);
      if (!generationValide(g)) return;
      await Cache.remplacerTout('exercices', local.exercices);
      if (!generationValide(g)) return;
      if (alias) {
        await Cache.remplacerTout('alias', local.alias);
        if (!generationValide(g)) return;
      }
      if (pesees) {
        // 60-2a — une pesée posée hors ligne n'est pas encore chez le serveur :
        // la liste qu'il envoie ne la contient pas. On la garde, par-dessus
        // celle du serveur pour le même jour.
        local.pesees = Poids.fondreEnAttente(pesees, local.pesees, protegeesEtEnVol(Attente.PESEES));
        await Cache.remplacerTout('pesees', local.pesees);
        if (!generationValide(g)) return;
      }
      // ⚠️ FUSION, JAMAIS REMPLACEMENT. Une correction posée hors ligne n'est
      // pas encore chez le serveur : la liste qu'il envoie ne la contient pas,
      // et l'écraser avec elle effacerait le choix au moment précis où le
      // réseau revient — le défaut que `Sync.remplacer` évite déjà pour les
      // séances. On fond par `id`, et `ecrireLot` upserte ligne à ligne.
      if (zones) {
        local.zones = fondreZones(local.zones, zones);
        await Cache.ecrireLot('zones', local.zones);
        if (!generationValide(g)) return;
      }
      if (modes) {
        local.modes = fondreModes(local.modes, modes);
        await Cache.ecrireLot('modes', local.modes);
        if (!generationValide(g)) return;
      }
      if (choixSemaine) {
        // 178 — lu AVANT la fusion : ce que l'appareil a et que le serveur n'a pas repart dans la file.
        var absents = Deraille.choixAReposer(local.semaineChoix, choixSemaine, protegeesEtEnVol(Attente.SEMAINE_CHOIX),
          Deraille.lundiDe(Moteur.jourCivil(new Date(Date.now() - 7 * 864e5))), idUtilisateur());
        local.semaineChoix = fondreChoix(local.semaineChoix, choixSemaine);
        await Cache.ecrireBrouillon(CLE_SEMAINE, local.semaineChoix).catch(function () {});
        if (!generationValide(g)) return;
        for (var ia = 0; ia < absents.length; ia++) {
          await poser({ table: Attente.SEMAINE_CHOIX, op: Attente.UPSERT, id: cleDuChoix(absents[ia]), donnees: absents[ia] });
        }
      }
      if (parisDuCompte) {
        await Cache.ecrireBrouillon(CLE_SOUS_CONSIGNE, local.sousConsigne).catch(function () {});
        await Cache.ecrireBrouillon(CLE_PARIS_LEGERS, local.parisLegers).catch(function () {});
      }
      if (escalierDuCompte) {
        await Cache.ecrireBrouillon(CLE_PARIS_ESCALIER, local.escalier).catch(function () {});
      }
      // 139 — une lecture partie AVANT un geste ne le remplace pas (comme `versionProfil`). L'objectif changé ou
      // retiré pendant la lecture a pu monter et sortir de la file entre-temps : `fondreObjectifs` ne protège que
      // ce qui y est encore, et la lecture périmée écrasait le geste (150 revenait à la place de 155), en mémoire et
      // dans le brouillon. La version a bougé : on n'adopte rien ; la synchronisation suivante relira la base.
      // …et un geste déjà dans la file À LA LECTURE, dont l'envoi est arrivé en base APRÈS elle puis a vidé la file
      // avant l'application : `fondreObjectifs` ne le voit plus, la lecture ne l'a jamais eu — on garde la ligne de
      // l'appareil (relevé au banc, pages ralenties ×4 : 155 × 1 reparti en 150 × 1, version inchangée).
      if (objectifsDuCompte && versionObjectifsALaLecture === versionObjectifs) {
        local.objectifsDispo = objectifsDuCompte.dispo;
        local.objectifs = objectifsDuCompte.dispo
          ? gardeLesGestesEnVol(fondreObjectifs(objectifsDuCompte.lignes), objectifsEnFileALaLecture) : [];
        await Cache.ecrireBrouillon(CLE_OBJECTIFS, { dispo: local.objectifsDispo, lignes: local.objectifs }).catch(function () {});
        if (!generationValide(g)) return;
      }
      if (parisObjectifDuCompte) {
        local.parisObjectif = fondreParisObjectif(parisObjectifDuCompte);
        await Cache.ecrireBrouillon(CLE_PARIS_OBJECTIF, local.parisObjectif).catch(function () {});
        if (!generationValide(g)) return;
      }
      if (blocsDuCompte) await Cache.ecrireBrouillon(CLE_BLOCS, local.blocs).catch(function () {});
      if (programmeDuCompte) await Cache.ecrireBrouillon(CLE_PARIS_PROGRAMME, local.programme).catch(function () {});
      if (!generationValide(g)) return;
      await Cache.supprimer('series', idsRetires(fusionnees, local.series));
      if (!generationValide(g)) return;
      await Cache.ecrireLot('series', local.series);

      // LE COMPTE AUTORISE. On relit le MAGASIN — une variable en mémoire ne
      // prouve rien sur ce qui a été persisté. Sans preuve de complétude, le
      // curseur reste vide : la synchro suivante recommence au lieu de se
      // croire finie, et le cache ne peut plus se figer amputé.
      var enMagasin = await Cache.compterMagasin('series');
      if (!generationValide(g)) return;
      var commit = Sync.decisionDeCommit(enMagasin, compteSeries);
      if (commit.autorise) {
        var avance = Sync.curseurDe(nouvellesSeries);
        if (avance) await Cache.ecrireMeta('curseurSeries', avance);
        if (resync) await Cache.ecrireMeta('formeSync', { version: Sync.VERSION_SYNC });
        if (commit.attendu !== null) await Cache.ecrireMeta('attendu', { series: commit.attendu });
      }

      // 58-2 — le journal des records : accessoire, il n'emporte rien s'il échoue.
      await synchroniserJournal(listeComplete);
      if (!generationValide(g)) return;

      etat = Sync.deciderEtat({
        syncOk: true, aDesDonnees: true, manquantes: commit.manquantes
      });
      // §14.4 (49-U14) — une semaine allégée acceptée se tranche ici aussi.
      observerEscalier().catch(function () {});
      // 109 — un objectif atteint dans une séance importée, ou sur un autre appareil, s'observe ici aussi.
      observerObjectifs().catch(function () {});
    } catch (e) {
      // Une synchronisation ratée n'est jamais bloquante : on garde ce qu'on a.
      etat = Sync.deciderEtat({ syncOk: false, aDesDonnees: local.seances.length > 0 });
      console.warn('Synchronisation impossible :', texteErreur(e));
    } finally {
      // Une synchro d'une génération passée ne libère pas le verrou d'une
      // synchro d'aujourd'hui (`deconnecter` l'a déjà libéré).
      if (generationValide(g)) syncEnCours = false;
    }
  }

  // 117 (audit du 16/10, 06 #1) — LE RAPPROCHEMENT DES SÉRIES (`Sync.surplusDeSeries`, `Sync.rapprocherSeries`).
  // Le surplus se calcule hors de ce qui attend dans la file — au départ de la synchronisation ET maintenant : une
  // séance posée entre-temps est protégée aussi. Un surplus au compte lu AVANT la liste se vérifie au compte relu
  // APRÈS (une série montée ailleurs entre les deux n'est pas un surplus). Puis les identifiants des séances, par
  // lots, des plus récentes aux plus anciennes, jusqu'à ce que le surplus soit résorbé. Une série montée D'ICI
  // pendant ce temps (`envoisDeSeries`) : on ne conclut rien, la synchronisation suivante reprendra. Une lecture qui
  // échoue n'emporte pas la synchronisation : on garde ce qu'on a.
  async function rapprocherSeriesDuServeur(series, seancesServeur, compteServeur, fileAuDepart, envoisAuDepart, g) {
    var proteger = function () {
      var p = Object.assign({}, fileAuDepart || {});
      Object.keys(Attente.seancesEnAttente(attente)).forEach(function (id) { p[id] = true; });
      return p;
    };
    var surplus = Sync.surplusDeSeries(series, seancesServeur, proteger(), compteServeur);
    if (surplus <= 0) return series;
    try {
      var compteApres = await Donnees.compterSeries();
      if (!generationValide(g)) return series;
      surplus = Sync.surplusDeSeries(series, seancesServeur, proteger(), compteApres);
      if (surplus <= 0) return series;
      var lots = Sync.lotsDeRapprochement(seancesServeur);
      var retirees = 0;
      for (var i = 0; i < lots.length && surplus > 0; i++) {
        if (envoisDeSeries !== envoisAuDepart) break;
        var lignes = await Donnees.seriesDesSeances(lots[i]);
        if (!generationValide(g) || envoisDeSeries !== envoisAuDepart) break;
        var r = Sync.rapprocherSeries(series, lignes, lots[i], proteger());
        series = r.series;
        retirees += r.retirees.length;
        surplus -= r.retirees.length;
      }
      if (retirees) console.warn('Synchronisation : ' + retirees + ' série(s) effacée(s) sur un autre appareil retirée(s) du cache.');
    } catch (e) {
      console.warn('Rapprochement des séries impossible :', texteErreur(e));
    }
    return series;
  }

  // Ce que la purge a retiré doit quitter le magasin : sans `clear()`, une
  // série dont la séance a disparu y resterait.
  function idsRetires(avant, apres) {
    var restants = new Set((apres || []).map(function (s) { return s && s.id; }));
    var retires = [];
    (avant || []).forEach(function (s) { if (s && !restants.has(s.id)) retires.push(s.id); });
    return retires;
  }

  // Un compte indisponible n'est pas un compte à zéro : on rend null, et
  // `verifierCompletude` s'abstient plutôt que d'accuser.
  async function compteSur(lire) {
    try { return await lire(); }
    catch (e) { console.warn('Compte serveur indisponible :', texteErreur(e)); return null; }
  }

  // Même forme, pour une lecture accessoire : `null` plutôt qu'une exception
  // qui ferait tomber la synchronisation entière.
  async function essayer(lire) {
    try { return await lire(); }
    catch (e) { console.warn('Lecture indisponible :', texteErreur(e)); return null; }
  }

  // ── Écrans ───────────────────────────────────────────────────────────────
  // Toute la navigation entre semaines lit le cache. Aucun appel réseau, aucun
  // rechargement de page — et aucune entrée empilée dans l'historique, pour ne
  // pas aggraver le bouton retour d'Android, qui est un chantier à part.
  // Tout ce que les deux onglets lisent de la semaine affichée. Une seule
  // source : passer de Séances à Progression conserve la semaine.
  // 58-1 — l'écran retient la semaine affichée ; ce qu'on en lit est un fait
  // (`faits.semaineDe`).
  function semaineCourante() {
    if (!lundiAffiche) lundiAffiche = Semaine.bornesSemaine(new Date()).lundi;
    return faits.semaineDe(corpus(), lundiAffiche);
  }

  function barrePour(sem, avecSeances) {
    // La barre est IDENTIQUE dans Séances et dans la vue Volume : une seule
    // définition, deux emplacements. « Cette semaine » n'est fourni que si on a
    // quitté la semaine courante — c'est l'absence de la fonction qui fait
    // l'absence du bouton, pas un test dans le rendu.
    var courante = Semaine.memeSemaine(sem.bornes.lundi, new Date());
    return {
      surCetteSemaine: courante ? null : function () {
        var lundi = Semaine.bornesSemaine(new Date()).lundi;
        if (!vues.volume.hidden) { lundiAffiche = lundi; return rendreVolume(); }
        afficherSemaine(lundi);
      },
      libelle: Rendu.libelleSemaine(sem.bornes.lundi, sem.bornes.dimanche),
      sousTitre: (avecSeances ? sem.bilan.nbSeances + ' séance' +
        (sem.bilan.nbSeances > 1 ? 's' : '') + ' · ' : '') +
        sem.bilan.nbSeriesTravail + ' série' + (sem.bilan.nbSeriesTravail > 1 ? 's' : '') +
        ' de travail',
      surPrecedente: function () { naviguer(-1); },
      surSuivante: function () { naviguer(1); },
      surDate: ouvrirCalendrier
    };
  }

  function rendreSemaine(lundi) {
    if (lundi) lundiAffiche = lundi;
    montrer('liste', Routeur.RACINE);
    // ⚠️ L'ÉTAT COMBINÉ, JAMAIS L'ÉTAT DE LECTURE SEUL (chantier 33). Peindre
    // `etat` ici court-circuitait `Attente.deciderEtat` : l'écran Séances —
    // celui sur lequel on retombe après chaque relance — affichait « À jour »
    // pendant qu'une entrée était bloquée en file. Une file bloquée qui se dit
    // à jour EST la perte silencieuse que tout ce mécanisme existe pour
    // empêcher, et c'est ce qui a laissé le défaut du chantier 32 invisible.
    rendreEtatSync();

    var sem = semaineCourante();
    rendreProchaineSeance();
    demanderLesRoutinesDeLAccueil();
    Rendu.rendreBarreSemaine($('barre-seances'), barrePour(sem, true));
    rendreLigneDesEquilibres();
    Rendu.rendreRappel($('rappel-zones'), sem.zones, function () {
      // Un rappel DE VOLUME ouvre le volume, pas le sommaire : passer par une
      // table des matières pour retrouver ce qu'on vient de toucher serait un
      // pas de plus pour rien.
      allerA(Routeur.VOLUME, {});
      rendreVolume();
    });
    Rendu.rendreJours($('liste-seances'), Semaine.joursAvecSeances(sem.jours), function (s) {
      return Modele.resumerSeance(s, seriesDe(s.id), local.exercices, Palier, etatsExercices, meilleurNomme);
    }, afficherDetail, ouvrirMenuSeance);
    // 91 — mes invitations à un groupe, et le groupe qui finit.
    dessinerGroupeAccueil();
    rafraichirGroupe();
  }

  // ── Progression : le sommaire (§7 bis.14) ────────────────────────────────
  //
  // Trois blocs empilés, chacun répondant en deux lignes. L'écran est utile
  // SANS RIEN TOUCHER : ouvrir un bloc approfondit, ça ne révèle pas la réponse.
  function rendreProgression() {
    montrer('progression', Routeur.PROGRESSION);
    var sem = semaineCourante();
    // MOTEUR §9.23 (55-1) — deux blocs en tête : le mois écoulé, et le
    // dernier record. Les blocs existants ne bougent pas.
    var mois = Bilan.moisEcoule(new Date());
    var b = bilanDuMoisDe(mois);
    var dernier = faits.dernierRecord(corpus());
    profilDuParcours = cleDuParcoursDuProfil(profil);
    Rendu.rendreSommaire($('sommaire'), {
      // 98 — le mois écoulé s'ouvre sur SA STORY (BILANS-V1) ; le bloc dit ses tonnes, jamais ses séances.
      mois: {
        titre: nomDuMois(mois, false),
        kg: b.volume_kg,
        // 119 (F8) — les séries de travail du mois (la règle du volume) : un mois au poids du corps en a sans tonnes.
        series: b.series,
        records: faits.recordsDuMois(corpus(), mois).length,
        // 124 (audit du 16/10/2026, 04 #14) — les paris du mois, un seul fil : ceux de la story (`bilan.coach`).
        paris: (function () {
          var co = bilanPeriode(Bilans.periodeDuMois(mois)).coach;
          return co ? { verifies: co.faits, tenus: co.tenus } : { verifies: 0, tenus: 0 };
        })(),
        surChoix: function () { afficherMois(mois); }
      },
      // 98 — la saison écoulée, toute la saison suivante ; hors production, la saison en cours si l'écoulée est vide.
      saison: (function () {
        var cle = saisonDuSommaire();
        return cle ? { titre: titreDeSaison(cle), surChoix: function () { ouvrirBilan(Bilans.periodeDeLaSaison(cle)); } } : null;
      })(),
      // 75 — « Ton parcours », juste après « Le mois écoulé » : sa phrase, il s'ouvre sur la page.
      parcours: {
        phrase: faits.parcoursDe(corpus(), new Date(), profil).phrase,
        surChoix: afficherParcours
      },
      // 95 — « Ton année » : l'année écoulée, toute l'année suivante ; il s'ouvre plein écran.
      annee: (function () {
        var an = anneeDuSommaire();
        return an ? { an: an, surChoix: function () { ouvrirAnnee(an); } } : null;
      })(),
      records: {
        dernier: dernier ? { texte: dernier.nom + ' ' + dernier.mesure, nom: dernier.nom, mesure: dernier.mesure,
                             date: Modele.jourMois(new Date(dernier.debut), new Date().getFullYear()) } : null,
        surChoix: dernier ? function () { afficherRecordsDuMois(Bilan.cleMois(dernier.debut)); } : null
      },
      volume: {
        quand: Rendu.libelleSemaine(sem.bornes.lundi, sem.bornes.dimanche),
        zones: sem.zones,
        surChoix: function () { allerA(Routeur.VOLUME, {}); rendreVolume(); }
      },
      poids: {
        resume: Poids.resume(local.pesees),
        surChoix: function () { allerA(Routeur.POIDS, {}); rendrePoids(); },
        // 173 — « Peser » : la même pesée que la ligne « Poids » du Profil.
        surPeser: ouvrirPeseeProfil
      },
      exercices: sommaireExercices(function (slug) { afficherExercice(slug); },
        // 173 — « Tous mes exercices » : la même destination que la porte du Profil.
        function () { allerA(Routeur.EXERCICES, {}); rendreMesExercices(); })
    });
  }

  // ── 75 — « TON PARCOURS » (ECRAN-SAISIE §7 bis.14 ter, maquette v3) ───────
  //
  // ⚠️ L'ÉCRAN LIT LE PARCOURS, IL NE LE REFAIT PAS : `faits.parcoursDe` (le module des faits, qui l'assemble et le
  // mémorise) rend les verdicts, les rapports, le levier et la phrase. Ce que l'écran ajoute ne décide rien : les
  // libellés des priorités, la phase du profil et le nombre de pesées des huit dernières semaines. Rien n'est écrit.
  var JOURS_DES_PESEES = 56, PESEES_SUFFISANTES = 4;
  // ⚠️ LE PROFIL ARRIVE APRÈS L'ÉCRAN (trouvé par le banc [P75]). « Ton parcours » lit le sexe (les repères) et les
  // priorités (le levier) : affiché avec le profil du cache (ou sans), la phrase perdait son rapport. On retient ce
  // que l'écran a lu ; quand la ligne arrive et qu'il diffère, le sommaire ou la page se repeint — et seulement
  // alors, pour ne pas refermer un groupe qu'on vient d'ouvrir.
  var profilDuParcours = null;
  function cleDuParcoursDuProfil(p) {
    return String(p && p.sexe) + '|' + Profil.prioritesDe(p).join(',');
  }
  function parcoursSuitLeProfil() {
    if (ecranCourant !== 'progression' && ecranCourant !== 'parcours') return;
    if (cleDuParcoursDuProfil(profil) === profilDuParcours) return;
    if (ecranCourant === 'progression') rendreProgression();
    else rendreParcours();
  }
  // ══ 188-1 — « TA SEMAINE ET TES ÉQUILIBRES » (MOTEUR §9.27) ═══════════════════════════════════════════════════
  //
  // ⚠️ L'ÉCRAN NE CALCULE RIEN. `Equilibres.analyser` (pur) lit les séances, leurs gestes (`sessions.gestes`), les routines
  // du programme et les réponses déjà données (`profiles.cartes_semaine`) ; l'app lui passe ces faits, il rend les cartes.
  // Rien ne s'écrit au rendu. Un geste écrit :
  //   · « Pas maintenant » / un « oui » : `profiles.cartes_semaine[cle]` par `poserProfil` (la file, comme `marche_reponses`) ;
  //   · une proposition acceptée : la routine, par `poserRoutineVoulue` (le chemin des routines, la file), puis elle SE VOIT
  //     (« Fait : … ») et S'ANNULE (la routine d'avant, et les réponses d'avant) ;
  //   · « remplacer » et « fusionner » n'ont pas de chemin d'écriture : ils OUVRENT l'éditeur de la routine, rien n'est écrit ;
  //   · « corriger » (le programme du coach, mal construit) rouvre « Refaire mon programme ».
  var faitEquilibre = null;          // { texte, surAnnuler } : la dernière proposition acceptée, jusqu'au prochain rendu
  var memoEquilibres = null;         // { cle, analyse }

  // Les routines du PROGRAMME : le dossier du programme construit par le coach (`programme_construit_dossier`), sinon le
  // dossier de la routine de la dernière séance, sinon toutes les routines visibles. `coach` : le programme vient du coach.
  function routinesDuProgramme() {
    var visibles = Routines.visibles(routines).filter(function (r) { return r && !r.archivee_a; });
    var p = profil || {};
    var dossierCoach = Profil.dossierDuProgrammeValide(p.programme_construit_dossier);
    if (dossierCoach) {
      var rc = visibles.filter(function (r) { return Routines.dossierPropre(r.dossier) === dossierCoach; });
      if (rc.length) return { routines: rc, coach: true };
    }
    var derniere = null, parId = {};
    visibles.forEach(function (r) { parId[r.id] = r; });
    (local.seances || []).forEach(function (s) {
      if (s && s.routine_id && parId[s.routine_id] && s.debut && (!derniere || s.debut > derniere.debut)) derniere = s;
    });
    if (derniere) {
      var d = Routines.dossierPropre(parId[derniere.routine_id].dossier);
      return { routines: visibles.filter(function (r) { return Routines.dossierPropre(r.dossier) === d; }), coach: false };
    }
    return { routines: visibles, coach: false };
  }

  function reponsesDesCartes() {
    var c = profil && profil.cartes_semaine;
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  }

  function entreeDesEquilibres() {
    var maintenant = new Date();
    var prog = routinesDuProgramme();
    var p = profil || {};
    return {
      jour: Moteur.jourCivil(maintenant),
      reglage: Profil.rythmeDe(p),
      intention: p.intention || null,
      catalogue: catalogueIndexe(),
      seances: local.seances, series: local.series,
      routines: prog.routines.map(function (r) { return { id: r.id, nom: r.nom, jours: r.jours, exercices: r.exercices }; }),
      programmeDuCoach: prog.coach,
      // 188-2 — les jours prévus, la durée réglée, les semaines allégées (ni comptées ni jugées).
      seancesParSemaine: p.seances_par_semaine,
      dureeSeanceMin: p.duree_seance_min,
      periodesAllegees: periodesAllegees(),
      programmeRefaitLe: p.programme_construit_le ? Moteur.jourCivil(new Date(p.programme_construit_le)) : null,
      priorites: Profil.prioritesDe(p),
      volume: function () { return volumeDuCoach(maintenant.toISOString()); },
      ecartes: Profil.ecartesDe(p),
      cartes: reponsesDesCartes()
    };
  }

  // L'analyse, gardée tant que rien de ce qu'elle lit n'a changé (les séances, les séries, les routines, le réglage, les
  // priorités, les réponses, le jour).
  function equilibres() {
    var p = profil || {};
    var cle = [(local.seances || []).length, (local.series || []).length, Moteur.jourCivil(new Date()), p.rythme_progression || '',
               p.intention || '', JSON.stringify(Profil.prioritesDe(p)), JSON.stringify(reponsesDesCartes()),
               p.programme_construit_dossier || '', p.programme_construit_le || '', etatRoutines.code, signatureDesRoutines(routines),
               p.seances_par_semaine || '', p.duree_seance_min || ''].join('|');
    if (memoEquilibres && memoEquilibres.cle === cle) return memoEquilibres.analyse;
    var analyse = Equilibres.analyser(entreeDesEquilibres());
    memoEquilibres = { cle: cle, analyse: analyse };
    return analyse;
  }

  async function repondreALaCarte(cle, r) {
    var toutes = Object.assign({}, reponsesDesCartes());
    toutes[cle] = Equilibres.reponse(toutes, cle, r, Moteur.jourCivil(new Date()));
    await poserProfil({ cartes_semaine: toutes });
  }

  function repeindreLesEquilibres() {
    if (!vues.parcours.hidden) rendreParcours();
    if (!vues.liste.hidden) rendreLigneDesEquilibres();
  }

  function pasMaintenantEquilibre(carte) {
    faitEquilibre = null;
    // La carte se tait quand la réponse est posée dans le profil (pas avant : le rendu relirait l'ancienne réponse).
    repondreALaCarte(carte.cle, 'non').catch(function (e) { console.warn('Carte de la semaine non écrite :', texteErreur(e)); })
      .then(function () { repeindreLesEquilibres(); });
  }

  async function accepterUneProposition(carte, p) {
    var rt = routines.filter(function (r) { return r.id === p.routine_id; })[0];
    // Sans chemin d'écriture : l'éditeur s'ouvre sur la bonne routine, rien n'est écrit en silence.
    if (p.type === 'remplacer' || p.type === 'fusionner') {
      if (rt) ouvrirRoutine(rt.id);
      return;
    }
    if (p.type === 'corriger') { ouvrirQuestionnaire({ refaire: true }); return; }
    // 188-2 — « Refaire mon programme sur N jours » : le générateur s'ouvre pré-rempli avec N ; rien n'est remplacé avant la
    // confirmation habituelle (l'aperçu, puis « Créer »), un NOUVEAU dossier, l'ancien reste tel quel.
    if (p.type === 'refaire_jours') { faitEquilibre = null; ouvrirQuestionnaire({ refaire: true, jours: p.jours }); return; }
    if (p.type === 'duree') { await regleLaDureeEquilibre(carte, p); return; }
    if (p.type === 'repartir') { await repartirLesPriorites(carte, p); return; }
    var voulues = null, fait = null;
    if (rt && p.type === 'deplacer') { voulues = Routines.miseEnTete(rt, p.slug, p.avant); fait = 'Fait : ' + Modele.nommer(catalogueIndexe(), p.slug) + ' est plus tôt dans « ' + rt.nom + ' ».'; }
    if (rt && p.type === 'ajouter') { voulues = Routines.ajoutDExercice(rt, p.slug, p.series || 1); fait = 'Fait : ' + Modele.nommer(catalogueIndexe(), p.slug) + ' est dans « ' + rt.nom + ' ».'; }
    if (rt && p.type === 'serie') { voulues = Routines.ajoutDeSerie(rt, p.slug); fait = 'Fait : une série de plus sur ' + Modele.nommer(catalogueIndexe(), p.slug) + ' dans « ' + rt.nom + ' ».'; }
    if (!voulues) {
      // La routine a changé depuis la carte : rien n'est écrit, la carte se recalcule.
      faitEquilibre = { texte: 'Ta routine a changé depuis : je recalcule.', surAnnuler: function () { faitEquilibre = null; repeindreLesEquilibres(); } };
      memoEquilibres = null;
      return repeindreLesEquilibres();
    }
    var avantRoutine = JSON.parse(JSON.stringify(rt.exercices));
    var avantReponses = JSON.parse(JSON.stringify(reponsesDesCartes()));
    var idRoutine = rt.id;
    await poserRoutineVoulue(rt, voulues);
    await repondreALaCarte(carte.cle, 'oui');
    faitEquilibre = {
      texte: fait,
      surAnnuler: async function () {
        var r2 = routines.filter(function (r) { return r.id === idRoutine; })[0];
        faitEquilibre = null;
        if (r2) await poserRoutineVoulue(r2, avantRoutine);
        await poserProfil({ cartes_semaine: avantReponses });
        memoEquilibres = null;
        repeindreLesEquilibres();
      }
    };
    memoEquilibres = null;
    repeindreLesEquilibres();
  }

  // 188-2 — « RÉGLER MES SÉANCES SUR N MIN » : la durée s'écrit par le chemin du Profil (`Profil.preparerChamps`, la même fonction
  // que le Profil et le questionnaire), la carte repart de zéro, et le coach PROPOSE de reconstruire le programme pour cette durée
  // (jamais d'office). Le geste se voit et s'annule : la durée et la réponse de temps d'avant, et les réponses d'avant.
  async function regleLaDureeEquilibre(carte, p) {
    var p0 = profil || {};
    var avantChamps = { duree_seance_min: p0.duree_seance_min === undefined ? null : p0.duree_seance_min,
                        temps_reponse: p0.temps_reponse === undefined ? null : p0.temps_reponse };
    var avantReponses = JSON.parse(JSON.stringify(reponsesDesCartes()));
    var entrees = { duree_seance_min: p.minutes };
    // « Juste la durée » : la réponse de temps ne change que si elle ne dit rien de la durée à tenir.
    if (['max', 'moins', 'varie'].indexOf(p0.temps_reponse) < 0) entrees.temps_reponse = 'moins';
    var champs = Profil.preparerChamps(profil, entrees, new Date());
    if (Object.keys(champs).length) await poserProfil(champs);
    await repondreALaCarte(carte.cle, 'oui');
    faitEquilibre = {
      texte: 'Fait : tes séances sont réglées sur ' + p.minutes + ' min.',
      suite: { libelle: 'Refaire mon programme pour ' + p.minutes + ' min', surClic: function () { faitEquilibre = null; refaireMonProgramme(); } },
      surAnnuler: async function () {
        faitEquilibre = null;
        await poserProfil(avantChamps);
        await poserProfil({ cartes_semaine: avantReponses });
        memoEquilibres = null;
        repeindreLesEquilibres();
      }
    };
    memoEquilibres = null;
    repeindreLesEquilibres();
  }

  // 188-2 — « RÉPARTIR MES PRIORITÉS SUR DEUX JOURS » : chaque priorité en retard gagne son exercice dans une routine qui ne le
  // porte pas encore (le chemin des routines, la file). Se voit, s'annule : chaque routine reprend son état d'avant.
  async function repartirLesPriorites(carte, p) {
    var avant = [];
    var ajoutsFaits = [];
    (p.ajouts || []).forEach(function (a) {
      var rt = routines.filter(function (r) { return r.id === a.routine_id; })[0];
      var voulues = rt ? Routines.ajoutDExercice(rt, a.slug, a.series || 1) : null;
      if (!rt || !voulues) return;
      avant.push({ id: rt.id, exercices: JSON.parse(JSON.stringify(rt.exercices)) });
      ajoutsFaits.push({ rt: rt, voulues: voulues, texte: Modele.nommer(catalogueIndexe(), a.slug) + ' dans « ' + rt.nom + ' »' });
    });
    if (!ajoutsFaits.length) {
      faitEquilibre = { texte: 'Ta routine a changé depuis : je recalcule.', surAnnuler: function () { faitEquilibre = null; repeindreLesEquilibres(); } };
      memoEquilibres = null;
      return repeindreLesEquilibres();
    }
    var avantReponses = JSON.parse(JSON.stringify(reponsesDesCartes()));
    for (var i = 0; i < ajoutsFaits.length; i++) await poserRoutineVoulue(ajoutsFaits[i].rt, ajoutsFaits[i].voulues);
    await repondreALaCarte(carte.cle, 'oui');
    faitEquilibre = {
      texte: 'Fait : ' + ajoutsFaits.map(function (f) { return f.texte; }).join(' · ') + '.',
      surAnnuler: async function () {
        faitEquilibre = null;
        for (var k = 0; k < avant.length; k++) {
          var r2 = routines.filter(function (r) { return r.id === avant[k].id; })[0];
          if (r2) await poserRoutineVoulue(r2, avant[k].exercices);
        }
        await poserProfil({ cartes_semaine: avantReponses });
        memoEquilibres = null;
        repeindreLesEquilibres();
      }
    };
    memoEquilibres = null;
    repeindreLesEquilibres();
  }

  // La vue de « Ta semaine et tes équilibres » pour « Ton parcours » : l'analyse, la dernière proposition acceptée, les gestes.
  function vueDesEquilibres() {
    var a = equilibres();
    if (!a) return null;
    return {
      analyse: a, fait: faitEquilibre,
      surProposition: function (carte, p) {
        accepterUneProposition(carte, p).catch(function (e) { console.warn('Proposition non appliquée :', texteErreur(e)); });
      },
      surPlusTard: pasMaintenantEquilibre
    };
  }

  // 197 (MOTEUR §9.36) — « TA SEMAINE » en Forme et santé : le renforcement et le cardio modéré de la semaine, un fait de `faits.js` (jamais
  // « en retard », jamais l'assiduité reprochée). Seulement en objectif Forme, jamais en « Juste un carnet », cachable
  // (`cartes_semaine.forme_semaine = { masquee: true }`, par la file). Rien n'est écrit au rendu.
  function vueDeLaSemaineForme() {
    if (Profil.objectifDe(profil) !== 'forme' || Moteur.coachSeTait(profil && profil.intention)) return null;
    var r = reponsesDesCartes().forme_semaine;
    if (r && r.masquee === true) return null;
    var f = faits.semaineDeForme(corpus(), new Date());
    var s = f.renforcement.faites, e = f.cardio.equivalent;
    return {
      renforcement: { libelle: 'Renforcement', texte: s + (s > 1 ? ' séances' : ' séance') + ' sur ' + f.renforcement.cible },
      cardio: { libelle: 'Cardio modéré', texte: e + ' min sur ' + f.cardio.cible,
                reste: f.cardio.reste > 0 ? 'Il te reste ' + f.cardio.reste + ' min cette semaine.' : 'Tes ' + f.cardio.cible + ' min de la semaine sont faites.',
                intense: f.cardio.intenses > 0 ? 'Dont ' + f.cardio.intenses + ' min intenses, comptées double.' : null },
      pourquoi: Moteur.FORME_REPERES_PHRASE,
      douleur: Moteur.FORME_DOULEUR_PHRASE,
      surMasquer: function () {
        var toutes = Object.assign({}, reponsesDesCartes());
        toutes.forme_semaine = { masquee: true };
        poserProfil({ cartes_semaine: toutes }).then(rendreParcours).catch(function (x) { console.warn('Carte non masquée :', texteErreur(x)); });
      }
    };
  }

  // La ligne de l'écran Séances : UNE seule, quand une carte d'équilibre parle.
  function rendreLigneDesEquilibres() {
    var noeud = $('ligne-equilibre');
    if (!noeud) return;
    var a = seance ? null : equilibres();
    Rendu.rendreLigneEquilibre(noeud, a && a.ligne ? { texte: a.ligne.texte, surOuvrir: afficherParcours } : null);
  }

  // 189 (MOTEUR §14.11) — le constat de la baisse en « Juste un carnet » : le coach se tait, la ligne se lit.
  function constatDeFatigue() {
    if (!Moteur.coachSeTait(profil && profil.intention)) return null;
    return Moteur.constatDeBaisse(entreeDeLaFatigue(Moteur.jourCivil(new Date())));
  }

  function afficherParcours() {
    allerA(Routeur.PARCOURS, {});
    demanderLesRoutinesDeLAccueil();   // une LECTURE, au montage de la vue, jamais dans le rendu
    rendreParcours();
  }
  function rendreParcours() {
    montrer('parcours', Routeur.PARCOURS);
    var p = faits.parcoursDe(corpus(), new Date(), profil);
    profilDuParcours = cleDuParcoursDuProfil(profil);
    var libelles = {};
    p.zones.forEach(function (z) { libelles[z.zone] = z.libelle.toLowerCase(); });
    var pesees = Poids.filtrer(local.pesees, JOURS_DES_PESEES, new Date()).length;
    Rendu.rendreParcours($('parcours'), {
      parcours: p,
      nomsCourts: Parcours.NOM_COURT,
      priorites: Profil.prioritesDe(profil).filter(function (c) { return libelles[c]; }).map(function (c) { return libelles[c]; }),
      phase: Profil.phraseRappelDePhase(profil) || Profil.LIBELLE_PHASE_VIDE,
      pesees: { nombre: pesees, assez: pesees >= PESEES_SUFFISANTES },
      // 188-1 — « Ta semaine et tes équilibres », en tête.
      equilibres: vueDesEquilibres(),
      // 197 — « Ta semaine » en Forme et santé (renforcement, cardio modéré), cachable.
      forme: vueDeLaSemaineForme(),
      // 189 — « Juste un carnet » : aucune carte, le constat de la baisse se lit ici, en une ligne.
      fatigue: constatDeFatigue(),
      noteDePhase: seriesRevenues ? Moteur.PHRASE_SERIES_REVENUES : null,
      // « Tous tes exercices » : chacun ouvre sa page par la porte commune (§7 quater).
      surExercice: function (slug) { afficherExercice(slug); }
    });
  }

  // ══ 95 — « TON ANNÉE » (BILANS-V1, maquette `maquette-ton-annee-v11.html`) ══════════════════════════════
  //
  // ⚠️ L'ÉCRAN LIT LE BILAN, IL NE LE REFAIT PAS : `faits.bilanDePeriode` (l'entrée assemblée et le bilan mémorisé), le
  // jeu par `Jeu.etatDuJeu` sur `faits.faitsDuJeuDeLaPeriode`. Ce que l'app ajoute ne décide rien : QUAND le bloc
  // et l'annonce paraissent. Rien n'est écrit en base, sauf la période annoncée (104).
  //   · le bloc de Progression : le bilan de l'année écoulée, toute l'année suivante (à partir de 2026, la première) ;
  //     hors production (la garde du coach active), celui de l'année en cours quand l'écoulée n'en a pas ;
  //   · `?bilan=AAAA` (hors production, comme `?rejouer=`) : il s'ouvre au démarrage ;
  //   · l'annonce : en janvier, une fois par personne et par année, mémorisée dans le profil (`bilans_annonces`,
  //     v2_086, depuis 104) et sur l'appareil — elle ne revient pas sur un autre appareil.
  var Bilans = racine.THBilans, Annee = racine.THAnnee;
  var PREMIERE_ANNEE = 2026;
  function bilanDeLAnnee(an) {
    return faits.bilanDePeriode(corpus(), Bilans.periodeDeLAnnee(an), new Date(),
                         { pesees: local.pesees || [], paris: parisDeConsigneConnus() });
  }
  function anneeDuSommaire() {
    var an = new Date().getFullYear() - 1;
    if (an >= PREMIERE_ANNEE && !bilanDeLAnnee(an).vide) return an;
    if (garde.active && !bilanDeLAnnee(an + 1).vide) return an + 1;
    return null;
  }
  function ouvrirAnnee(an) { ouvrirBilan(Bilans.periodeDeLAnnee(an)); }

  // ══ 98 — LA SAISON ET LE MOIS (BILANS-V1, maquette `maquette-saison-mois-v1.html`) ════════════════════════════
  //
  // LE MÊME MOTEUR ET LE MÊME LECTEUR que « Ton année » : seule la fenêtre change. La story du mois REMPLACE l'ancien
  // bilan du mois de Progression (`/progression/mois/AAAA-MM` l'ouvre) et en reprend les records
  // (`faits.recordsDuMois`, tous au toucher : la liste des records du mois) et les paris (`Bilan.phraseParis`, le
  // détail au toucher). Le nom de la saison suit la phase du profil au début de la saison (`Profil.phaseAuJour`).
  // Ce que l'app ajoute ne décide rien : QUAND le bloc et l'annonce paraissent. Rien n'est écrit en base, sauf la période annoncée (104).
  function bilanPeriode(periode) {
    return faits.bilanDePeriode(corpus(), periode, new Date(),
                                { pesees: local.pesees || [], paris: parisDeConsigneConnus() });
  }
  function titreDeSaison(cle) {
    var p = Bilans.periodeDeLaSaison(cle);
    return Bilans.nomDeSaison(p.saison, Profil.phaseAuJour(profil, p.debut)) + ' ' + p.an;
  }
  function ouvrirBilan(periode, options) {
    var o = options || {};
    var jeu = null;
    if (periode.type === 'annee' && jeuAllume()) {
      var fj = faits.faitsDuJeuDeLaPeriode(corpus(), periode, new Date());
      jeu = { debut: Jeu.etatDuJeu(fj.debut), fin: Jeu.etatDuJeu(fj.fin) };
    }
    var vue = {
      bilan: bilanPeriode(periode),
      qui: profil && profil.username ? profil.username : '',
      jeu: jeu,
      surDetail: afficherParcours,
      surFermer: o.surFermer || null,
      surExercice: function (slug) { afficherExercice(slug); }
    };
    if (periode.type === 'saison') vue.nom = Bilans.nomDeSaison(periode.saison, Profil.phaseAuJour(profil, periode.debut));
    if (periode.type === 'mois') {
      var mois = periode.cle;
      vue.records = faits.recordsDuMois(corpus(), mois);
      // 124 (audit du 16/10/2026, 04 #7, #14) — la phrase dit les chiffres de l'écran (`bilan.coach`, la période),
      // tels quels : « 41 vérifiés · 38 tenus » ne se lit plus suivi de « Sur 10 paris vérifiés… ».
      var co = vue.bilan && vue.bilan.coach;
      vue.paris = co ? { phrase: Bilan.phraseParis(co.faits, co.tenus, { telsQuels: true }) } : null;
      vue.surRecords = function () { afficherRecordsDuMois(mois); };
    }
    Annee.ouvrir($('annee'), vue);
  }
  // La saison du bloc de Progression : l'écoulée (non vide), toute la saison suivante ; hors production, la saison
  // en cours quand l'écoulée n'a rien.
  function saisonDuSommaire() {
    var ici = Bilans.saisonDuJour(Moteur.jourCivil(new Date()));
    var avant = Bilans.periodeDeLaSaison(ici).precedente.cle;
    if (!bilanPeriode(Bilans.periodeDeLaSaison(avant)).vide) return avant;
    if (garde.active && !bilanPeriode(Bilans.periodeDeLaSaison(ici)).vide) return ici;
    return null;
  }
  // L'adresse lue AU CHARGEMENT (comme `?rejouer=`) : la navigation la réécrit avant la fin de la synchronisation.
  var rechercheAuChargement = (function () {
    try { return String((racine.location && racine.location.search) || ''); } catch (e) { return ''; }
  })();
  function anneeDemandee() {
    var m = /[?&]bilan=(\d{4})(?:&|$)/.exec(rechercheAuChargement);
    return m && garde.active ? Number(m[1]) : null;
  }
  // 98 — `?bilan=2026-10` (le mois), `?bilan=2026-automne` (la saison) : hors production, comme `?bilan=2026`.
  function periodeDemandee() {
    var m = /[?&]bilan=(\d{4}-(?:0[1-9]|1[0-2]|hiver|printemps|ete|automne))(?:&|$)/.exec(rechercheAuChargement);
    if (!m || !garde.active) return null;
    return /-\d{2}$/.test(m[1]) ? Bilans.periodeDuMois(m[1]) : Bilans.periodeDeLaSaison(m[1]);
  }
  // 98 — L'ANNONCE DE LA SAISON ET DU MOIS : un seul message dans l'app, à l'ouverture, à partir du premier jour de
  // la saison suivante (1er déc., 1er mars, 1er juin, 1er sept.) ou du 1er du mois, et pendant les 7 premiers jours
  // (le jour même seulement manquerait qui n'ouvre pas l'app ce jour-là) ; une fois par personne et par période,
  // mémorisé dans le profil et sur l'appareil (comme l'année, 104). Un même jour, un seul message : l'année, sinon la saison, sinon le mois ;
  // les autres restent dans Progression (et sont notés vus, pour ne pas s'enchaîner les jours suivants).
  // 104 — L'ANNONCE NE REVIENT PAS SUR UN AUTRE APPAREIL (BILANS-V1, décision du 16/10/2026) : une période est
  // annoncée si elle n'est ni dans le profil (`bilans_annonces`, v2_086) ni dans la mémoire de l'appareil. Annoncée,
  // elle s'ajoute aux deux : au profil par son chemin d'écriture (`poserProfil` — local d'abord, la ligne rejouée au
  // retour du réseau), à l'appareil pour le hors-ligne (et tant que la colonne n'existe pas en base).
  var CLE_ANNONCE_BILAN = 'th-v2-annonce-bilan', JOURS_D_ANNONCE = 7;
  var CLE_ANNONCE_ANNEE = 'th-v2-annonce-annee';
  var ATTENTE_PROFIL_ANNONCE_MS = 5000;
  function annoncesDuJour(maintenant) {
    var out = [];
    if (maintenant.getDate() > JOURS_D_ANNONCE) return out;
    var jour = Moteur.jourCivil(maintenant), n = maintenant.getMonth() + 1;
    if (n === 12 || n === 3 || n === 6 || n === 9) {
      var sa = Bilans.periodeDeLaSaison(Bilans.saisonDuJour(jour)).precedente.cle;
      out.push({ periode: Bilans.periodeDeLaSaison(sa), texte: 'Ta saison ' + titreDeSaison(sa) + ' est prête.' });
    }
    var mo = Bilans.periodeDuMois(Bilan.moisEcoule(maintenant));
    out.push({ periode: mo, texte: 'Ton mois ' + (/^[aeiouéè]/i.test(mo.nom) ? 'd’' : 'de ') + mo.nom + ' est prêt.' });
    return out;
  }
  // La clé de l'appareil (inchangée depuis 95 et 98 : ce qu'un appareil a déjà vu le reste).
  function cleAnnonce(uid, p) {
    return p.type === 'annee' ? CLE_ANNONCE_ANNEE + ':' + uid + ':' + p.cle : CLE_ANNONCE_BILAN + ':' + uid + ':' + p.type + ':' + p.cle;
  }
  // Déjà annoncée ? Le profil, puis l'appareil. Une mémoire d'appareil illisible vaut « vue » : jamais d'annonce répétée.
  function annonceDejaVue(uid, p) {
    if (Profil.bilansAnnonces(profil).indexOf(p.cle) >= 0) return true;
    try { return !!racine.localStorage.getItem(cleAnnonce(uid, p)); } catch (e) { return true; }
  }
  // Noter des périodes annoncées : l'appareil d'abord (`false` s'il refuse : on n'annonce pas ce qu'on ne peut retenir),
  // puis le profil — seulement s'il est connu (un profil jamais lu ne se crée pas d'une annonce).
  function noterAnnonces(uid, periodes) {
    try { periodes.forEach(function (p) { racine.localStorage.setItem(cleAnnonce(uid, p), '1'); }); } catch (e) { return false; }
    var deja = Profil.bilansAnnonces(profil);
    var cles = periodes.map(function (p) { return p.cle; }).filter(function (c) { return deja.indexOf(c) < 0; });
    if (profil && cles.length) poserProfil({ bilans_annonces: Profil.ajouterBilansAnnonces(deja, cles) }).catch(function () {});
    return true;
  }
  function annoncerUnBilan(uid) {
    if (!uid) return false;
    var a = annoncesDuJour(new Date()).filter(function (x) { return !annonceDejaVue(uid, x.periode) && !bilanPeriode(x.periode).vide; });
    if (!a.length) return false;
    if (!noterAnnonces(uid, a.map(function (x) { return x.periode; }))) return false;
    Annee.annonce($('annonce-annee'), { texte: a[0].texte, surVoir: function () { ouvrirBilan(a[0].periode); } });
    return true;
  }
  function annoncerLAnnee(uid) {
    var maintenant = new Date(), an = maintenant.getFullYear() - 1;
    if (maintenant.getMonth() !== 0 || an < PREMIERE_ANNEE || !uid) return false;
    var p = Bilans.periodeDeLAnnee(an);
    if (annonceDejaVue(uid, p) || bilanDeLAnnee(an).vide) return false;
    // Un seul message : l'année d'abord ; la saison et le mois du jour sont notés vus avec elle.
    if (!noterAnnonces(uid, [p].concat(annoncesDuJour(maintenant).map(function (x) { return x.periode; })))) return false;
    Annee.annonce($('annonce-annee'), { an: an, surVoir: function () { ouvrirAnnee(an); } });
    return true;
  }
  // `profilLu` : la lecture du profil lancée par la synchronisation. L'annonce l'attend (au plus 5 s) — décider sur le
  // seul cache annoncerait de nouveau, sur un appareil neuf, ce qu'un autre a déjà annoncé.
  function apresSynchroAnnee(uid, profilLu) {
    var an = anneeDemandee();
    if (an) { ouvrirAnnee(an); return; }
    var p = periodeDemandee();
    if (p) { ouvrirBilan(p); return; }
    var g = generation;
    var borne = new Promise(function (r) { racine.setTimeout(r, ATTENTE_PROFIL_ANNONCE_MS); });
    return Promise.race([Promise.resolve(profilLu).catch(function () {}), borne]).then(function () {
      if (!generationValide(g) || userId() !== uid) return;
      if (!annoncerLAnnee(uid)) annoncerUnBilan(uid);
    });
  }

  // ══ LE JEU (64B, JEU-V1 §9, maquette `maquette-jeu-v6.html`) ═════════════
  //
  // ⚠️ L'ÉCRAN LIT LE JEU, IL NE LE REFAIT PAS. L'état vient de `Jeu.etatDuJeu`,
  // nourri par `faits.faitsDuJeu` ; ce qu'on en montre (le plus proche, les
  // jauges, les succès par catégorie, les titres et les cadres) vient des
  // lectures du module. Les textes vivent dans `rendu.js`. Le coach ne lit
  // jamais le jeu (garde d'architecture).
  //
  // ⚠️ L'INTERRUPTEUR (`profiles.jeu_actif`, §9.1) : absent = allumé. Éteint,
  // pas d'onglet, pas de bloc dans la feuille « Terminer », l'initiale au
  // Profil, et `/jeu…` s'ouvre comme une route inconnue (`rendreRoute`).
  function jeuAllume() { return Profil.jeuActif(profil); }

  // La barre suit l'interrupteur : l'onglet Jeu caché quand il est éteint, et autant de colonnes que d'onglets
  // VISIBLES (pas de trou). Appelée par `montrer`, à chaque écran : l'écran suit tout de suite, hors ligne compris.
  // 87 (SOCIAL-V1) — L'ONGLET RESTE, jeu éteint : le social est volontaire et indépendant du jeu. Il se réduit
  // au fil et aux amis, et s'appelle « Amis » (« Jeu & amis » sinon).
  function appliquerJeu() {
    var bouton = $('onglet-jeu'), barre = $('onglets'), nom = $('onglet-jeu-nom');
    if (bouton) bouton.hidden = false;
    if (nom) nom.textContent = jeuAllume() ? 'Jeu & amis' : 'Amis';
    ['vue-jeu', 'vue-fil', 'vue-guilde'].forEach(function (id) { Rendu.rendreEnteteSocial($(id), jeuAllume()); });
    if (barre) barre.style.setProperty('--n-onglets', String(barre.querySelectorAll('.onglet:not([hidden])').length));
  }

  // Le profil vient de changer (lu du serveur, ou l'interrupteur) : la barre suit, et un écran du jeu ouvert se
  // ferme si le jeu vient de s'éteindre — comme une route inconnue.
  function jeuSuitLeProfil() {
    appliquerJeu();
    if (!jeuAllume() && Routeur.estVueDuJeu(ecranCourant)) {
      allerA(Routeur.RACINE, {}, true);
      rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
    }
  }

  // 87 — L'ONGLET « JEU & AMIS » : l'accueil du jeu, ou — jeu éteint — le fil.
  function ouvrirOngletJeu() {
    if (jeuAllume()) { allerA(Routeur.JEU, {}); return rendreJeu(); }
    allerA(Routeur.FIL, {}, true);
    return rendreFil();
  }

  // ⚠️ LA MÉMOIRE DE L'ONGLET. `etatDuJeu` relit tout l'historique : il se recalcule quand change l'une de ces
  // clés — le nombre de séances et de séries du corpus, la taille du journal, le jour local, le catalogue (son
  // index, comparé par référence) — jamais à chaque rendu. « Aujourd'hui » est l'INSTANT (`new Date()`), comme
  // `ceQueJeSais` le reçoit ailleurs : les records se lisent jusqu'à lui.
  var memoJeu = { cle: null, catalogue: null, etat: null };
  function etatDuJeuCourant() {
    var c = corpus(), maintenant = new Date(), catalogue = c.catalogue();
    var cle = (c.seances || []).length + '|' + (c.series || []).length + '|' + (c.journal || []).length + '|' +
      Routeur.versDate(maintenant);
    if (memoJeu.cle !== cle || memoJeu.catalogue !== catalogue) {
      memoJeu = { cle: cle, catalogue: catalogue, etat: Jeu.etatDuJeu(faits.faitsDuJeu(c, maintenant)) };
    }
    return memoJeu.etat;
  }

  function ouvrirVueDuJeu(vue, rendre) { allerA(vue, {}); rendre(); }

  // La description d'un succès, avec le nom court de l'exercice pour un cap rond (comme la médaille).
  function succesDecrit(id) {
    var d = Jeu.descriptionDuSucces(id);
    if (d && d.categorie === 'cap') d.nom = Modele.nomCourt(Modele.nommer(corpus().catalogue(), d.cle));
    return d;
  }

  // ── La feuille « Terminer » (§9.4) : ce que la séance ajoute ─────────────
  //
  // `etatDuJeu` sans elle (la mémoire de l'onglet), puis avec elle (`faitsDuJeu` et `enCours`, par les
  // convertisseurs qui l'écriront : `Seance.ligneSession`, `Seance.lignes`), comparés par `Jeu.apport`. RIEN
  // n'est écrit.
  //
  // ⚠️ TOUT LE CALCUL DANS UN `try` : une exception (`Seance.lignes` LÈVE sur une série sans identifiant ou en
  // double) donne `null` — pas de bloc — et jamais une feuille sans « Terminer » ni « Abandonner ».
  //
  // ⚠️ SA MÉMOIRE : les identifiants et `validee_a` des séries validées de la séance, la taille du journal, le
  // jour — et l'état de l'onglet. `surTitre` recrée l'objet séance à chaque frappe : une clé sur la référence se
  // recalculerait à chaque lettre.
  var memoFeuilleJeu = { cle: null, jeu: null };
  function jeuDeLaFeuille() {
    if (!seance || !jeuAllume()) return null;
    try {
      var c = corpus(), maintenant = new Date();
      // 182 — la séance déjà dans le cache (relue après un rechargement en pleine séance) ne compte pas dans « avant » :
      // sinon l'apport, donc l'XP du récap perso et celle publiée au groupe, vaut 0.
      var dedans = (c.seances || []).some(function (s) { return s && s.id === seance.id; }) ||
        (c.series || []).some(function (x) { return x && x.session_id === seance.id; });
      var avant = dedans ? Jeu.etatDuJeu(faits.faitsDuJeu(c, maintenant, null, seance.id)) : etatDuJeuCourant();
      var validees = Seance.toutesLesSeries(seance).filter(function (x) { return Seance.partEnBase(x.serie); })
        .map(function (x) { return x.serie.id + '@' + (x.serie.validee_a || ''); });
      var cle = seance.id + '|' + validees.join(',') + '|' + (c.journal || []).length + '|' +
        Routeur.versDate(maintenant) + '|' + memoJeu.cle;
      if (memoFeuilleJeu.cle === cle) return memoFeuilleJeu.jeu;
      var enCours = { seance: seance, ligne: Seance.ligneSession(Seance.terminer(seance, maintenant)),
                      lignes: Seance.lignes(seance) };
      var apres = Jeu.etatDuJeu(faits.faitsDuJeu(c, maintenant, enCours));
      var a = Jeu.apport(avant, apres);
      var jeu = { apport: a, succes: a.succes.map(succesDecrit) };
      memoFeuilleJeu = { cle: cle, jeu: jeu };
      return jeu;
    } catch (e) {
      console.warn('Le bloc du jeu ne se calcule pas, la feuille se passe de lui :', texteErreur(e));
      return null;
    }
  }

  function rendreJeu() {
    montrer('jeu', Routeur.JEU);
    var e = etatDuJeuCourant();
    publierJeu(e);
    Rendu.rendreJeuAccueil($('jeu-accueil'), {
      etat: e,
      jauge: Jeu.jauges(e).niveau,
      proches: Jeu.lesPlusProches(e),
      gelsMax: Jeu.tables().gels.max,
      surMuscles: function () { ouvrirVueDuJeu(Routeur.MUSCLES, rendreJeuMuscles); },
      surSucces: function () { ouvrirVueDuJeu(Routeur.SUCCES, rendreJeuSucces); },
      surDeblocages: function () { ouvrirVueDuJeu(Routeur.DEBLOCAGES, rendreJeuDeblocages); }
    });
  }

  function rendreJeuMuscles() {
    montrer('muscles', Routeur.MUSCLES);
    var e = etatDuJeuCourant();
    Rendu.rendreJeuMuscles($('jeu-muscles'), { etat: e, ordre: Jeu.ORDRE_DES_MUSCLES, jauges: Jeu.jauges(e) });
  }

  function rendreJeuSucces() {
    montrer('succes', Routeur.SUCCES);
    var e = etatDuJeuCourant();
    Rendu.rendreJeuSucces($('jeu-succes'), {
      etat: e,
      categories: Jeu.parCategorie(e),
      raretes: Jeu.tables().raretes,
      titres: Jeu.titresEtCadresDetailles(e).titres
    });
  }

  function rendreJeuDeblocages() {
    montrer('deblocages', Routeur.DEBLOCAGES);
    var e = etatDuJeuCourant(), t = Jeu.tables();
    Rendu.rendreJeuDeblocages($('jeu-deblocages'), {
      cadres: Jeu.titresEtCadresDetailles(e).cadres,
      semaines: e.semaines,
      conditions: { vitrine: t.vitrine.succes, grave: t.grave.titre },
      gels: t.gels
    });
  }


  // ══ LE NIVEAU PUBLIÉ (87, SOCIAL-V1) ═════════════════════════════════════
  //
  // Les autres voient le niveau et le titre du jeu (`profiles.jeu_niveau`, `jeu_titre`) : l'app les PUBLIE
  // depuis `etatDuJeu`, à l'ouverture de l'onglet et à la fin d'une séance, par le chemin du profil
  // (`poserProfil` : local d'abord, rejoué hors ligne). SEULEMENT S'ILS ONT CHANGÉ : ouvrir l'onglet n'écrit
  // rien de plus quand rien n'a bougé. Jeu éteint, rien ne part (la base les tait déjà : `jeu_actif`).
  // Le jeu ne les relit jamais.
  function publierJeu(etat) {
    if (!jeuAllume() || !userId() || !profil) return;
    try {
      var e = etat || etatDuJeuCourant();
      var niveau = e.niveau.niveau, titre = e.titre || null;
      if (profil.jeu_niveau === niveau && (profil.jeu_titre || null) === titre) return;
      poserProfil({ jeu_niveau: niveau, jeu_titre: titre }).catch(function (err) {
        console.warn('Le niveau publié attend le réseau :', texteErreur(err));
      });
    } catch (err) {
      console.warn('Le niveau ne se publie pas :', texteErreur(err));
    }
  }

  // ══ LE SOCIAL, ÉTAGE 1 (87, SOCIAL-V1, maquette `maquette-social-etage1-v2.html`) ═══════════════
  //
  // ⚠️ LES AUTRES NE SE LISENT QUE PAR LES FONCTIONS DE LA BASE (`Donnees.social*`), qui appliquent les cercles,
  // les blocages et le compte privé. L'écran ne décide d'aucun cercle (`Social.cercleDe`) et ne compte aucune
  // médaille (`faits.medaillesDuSocial`) ; le coach et les bilans ne lisent RIEN d'ici. Les LECTURES vivent en
  // mémoire (rien du social n'entre dans le cache) ; les GESTES passent par la file (107, ci-dessous).
  var social = { liens: null, liensBruts: null, liensN: 0, fil: null, filN: 0, medailles: {}, ami: null, recherche: '',
                 resultats: null, jeton: 0, confirmes: [], horloge: 0, refus: null, aRafraichir: null };

  // ⚠️ 121 (audit du 16/10/2026, 05 #13) — LE SOCIAL APPARTIENT AU COMPTE QUI PART (« Quitter », un autre compte qui
  // entre), comme le groupe (`oublierGroupe`) : ses liens (et le badge des demandes sur l'onglet), son fil, sa guilde,
  // ses gestes confirmés, ses refus, et ce que l'app sait avoir publié (scores de force, nombres de guilde, le refus
  // de la charge par la base d'avant v2_091). Sans cela, le badge de A restait sur l'onglet de B, la fin d'une séance
  // de B publiait parce que A était membre d'une guilde, et B se comparait aux chiffres publiés par A. Le jeton
  // monte (une lecture en vol pour A ne s'affiche jamais chez B) ; l'horloge des gestes ne redescend pas.
  function oublierSocial() {
    social = { liens: null, liensBruts: null, liensN: 0, fil: null, filN: 0, medailles: {}, ami: null, recherche: '',
               resultats: null, jeton: social.jeton + 1, confirmes: [], horloge: social.horloge, refus: null, aRafraichir: null };
    scoresPublies = null; baseExigeLaCharge = false; scoresGuildePublies = null; scoresGuildeConnus = null;
    jetonEntreAmis++;
    majBadgeSocial();
  }

  // Une lecture qui échoue (hors ligne, le plus souvent) : l'écran dit qu'il faut le réseau pour voir ceci.
  // 121 (05 #4, #12) — une seule phrase, « Il faut le réseau pour … » : pour voir (une lecture), ou pour faire (un geste
  // du groupe, `phraseDuReseau`).
  function phraseDuReseau(action) { return 'Il faut le réseau pour ' + action + '.'; }
  function erreurSociale(e, quoi) {
    console.warn('Social :', texteErreur(e));
    return phraseDuReseau('voir ' + (quoi || 'le social'));
  }
  function tonnesSociales(kg) { return Bilan.tonnesDuRecap(Number(kg) || 0); }
  function allerAmi(pseudo) { allerA(Routeur.AMI, { pseudo: pseudo }); rendreAmi(pseudo); }

  // ══ 107 — UN GESTE SOCIAL FAIT HORS LIGNE N'EST PLUS PERDU (SOCIAL-V1 §8, décision du 15/10/2026) ═══════════════
  //
  // Un geste (s'abonner, accepter, refuser, se désabonner, bloquer, débloquer, réagir, les gestes de la guilde) est
  // POSÉ DANS LA FILE, sur disque, comme une séance, dans l'ordre ; un geste qui annule le précédent le remplace (seul
  // l'état final part, `Social.cleDuGeste`). « Compte privé » part par le chemin du profil (`poserProfil`, local
  // d'abord, rejoué au retour du réseau) : c'est un champ du profil, un état. L'écran le montre aussitôt
  // comme fait (« en attente du réseau ») ; la vidange l'envoie quand le réseau est là (`executerGesteSocial`). La base
  // le refuse au retour : l'entrée sort, l'écran le dit en une phrase (`social.refus`) et relit l'état réel.
  //
  // ⚠️ L'ÉCRAN = LA LECTURE + LES GESTES QU'ELLE NE CONTIENT PAS ENCORE : ceux de la file, et ceux confirmés APRÈS le
  // départ de la lecture (`social.confirmes`, numérotés par `social.horloge` ; une lecture note le numéro à son départ).
  // Sans les seconds, un geste confirmé disparaîtrait de l'écran le temps que la relecture revienne.
  function gestesEnAttente() {
    return Attente.ordonnee(attente).filter(function (e) { return e && e.table === Attente.SOCIAL && e.donnees; })
      .map(function (e) { return e.donnees; });
  }
  function gestesDepuis(n0) {
    return social.confirmes.filter(function (c) { return c.n > (n0 || 0); }).map(function (c) { return c.d; })
      .concat(gestesEnAttente());
  }
  function horsGuilde(d) { return d.geste !== Social.GESTES.GUILDE; }
  // 121 (05 #5) — une publication de fond (mes nombres de guilde) n'est pas un geste de l'écran.
  function estPublication(d) { return d.geste === Social.GESTES.SCORES_GUILDE; }
  function estReaction(d) { return d.geste === Social.GESTES.REAGIR || d.geste === Social.GESTES.RETIRER_REACTION; }
  // « En attente du réseau » : une ligne discrète, quand un geste de ce genre attend.
  function ligneEnAttente(filtre) {
    var t = Social.EN_ATTENTE;
    return gestesEnAttente().some(function (d) { return !estPublication(d) && filtre(d); }) ? t.charAt(0).toUpperCase() + t.slice(1) : null;
  }
  // Le refus dit au retour du réseau : montré sur l'écran social ouvert, puis oublié au geste suivant, ou quand on
  // ouvre un écran social après l'avoir vu (pas à la relecture qu'il déclenche lui-même).
  function phraseDeRefus() { return social.refus ? social.refus.phrase : null; }
  function refusVu() { if (social.refus) social.refus.vu = true; }
  function ouvrirEcranSocial(relecture) { if (!relecture && social.refus && social.refus.vu) social.refus = null; }

  // Poser un geste : sur disque d'abord (la file), puis l'écran le montre fait.
  // `fond` (121, 05 #5) : une publication de fond (mes nombres de guilde) — elle n'efface pas la phrase d'un refus et ne
  // redessine rien.
  async function poserGesteSocial(champs, fond) {
    var d = Object.assign({ moi: userId() }, champs);
    if (!Social.gesteValide(d)) { console.warn('Geste social incomplet, ignoré :', JSON.stringify(d)); return; }
    if (!fond) social.refus = null;
    // Un geste sur un état (`Social.cleDuGeste`) remplace celui qui attend sur le même état : seul l'état final part.
    var cle = Social.cleDuGeste(d);
    await poser({ table: Attente.SOCIAL, op: Attente.GESTE, id: cle || uuid(), alaFin: !!cle, donnees: d,
      posee_a: new Date().toISOString() });
    if (!fond) redessinerSocial();
  }
  function poserGuilde(fn, args, extra) {
    var g = social.guilde;
    if (g) { g.message = null; g.edition = false; g.quitter = false; g.couleurEdition = null; }
    return poserGesteSocial(Object.assign({ geste: Social.GESTES.GUILDE, fn: fn, args: args || {},
      monPseudo: profil && profil.username ? profil.username : null }, extra || {}));
  }

  // La vidange : l'écrivain de chaque geste (`donnees.js`), et rien d'autre. `moi` : le compte qui l'a fait.
  async function executerGesteSocial(d) {
    var G = Social.GESTES, moi = d.moi;
    if (d.geste === G.SABONNER) {
      var autre = d.autre;
      // Depuis la recherche, on n'a que le pseudo : l'identifiant se lit au départ.
      if (!autre) {
        var p = await Donnees.socialProfil(d.pseudo);
        if (!p || !p.id) throw { code: 'TH404', message: 'profil introuvable : ' + d.pseudo };
        autre = p.id;
      }
      return Donnees.sAbonner(moi, autre);
    }
    if (d.geste === G.RETIRER_ABONNEMENT) return Donnees.retirerAbonnement(moi, d.autre);
    if (d.geste === G.RETIRER_ABONNE) return Donnees.retirerAbonnement(d.autre, moi);
    if (d.geste === G.ACCEPTER) return Donnees.accepterDemande(d.autre, moi);
    if (d.geste === G.BLOQUER) return Donnees.bloquer(moi, d.autre);
    if (d.geste === G.DEBLOQUER) return Donnees.debloquer(moi, d.autre);
    if (d.geste === G.REAGIR) return Donnees.reagir(d.session, moi);
    if (d.geste === G.RETIRER_REACTION) return Donnees.retirerReaction(d.session, moi);
    if (d.geste === G.GUILDE) return Donnees.gesteDeGuilde(d.fn, d.args || {});
    if (d.geste === G.SCORES_GUILDE) return publierScoresGuildeDeLaFile(d);
    console.warn('Geste social inconnu, retiré de la file :', d.geste);
    return true;
  }
  // 121 (05 #3) — « rejoué » : un envoi PRÉCÉDENT a pu passer (`parti`, écrit avant l'appel, ou un échec déjà constaté).
  function issueSociale(op, erreur) { return Social.issueDuGeste(op.donnees || {}, erreur, Attente.dejaParti(op)); }

  // Ce que la vidange a fait d'un geste : confirmé (ou déjà fait), ou refusé.
  function noterGesteSocial(op, erreur) {
    var d = op.donnees || {};
    // 121 (05 #5) — une publication de fond : ni phrase, ni relecture (l'écran de la guilde relit ses nombres en s'ouvrant).
    if (estPublication(d)) {
      if (erreur) console.warn('Les nombres de guilde n’ont pas pu se publier :', texteErreur(erreur));
      return;
    }
    var t = social.aRafraichir || (social.aRafraichir = { relire: false });
    if (erreur) {
      social.refus = { phrase: Social.phraseDuRefus(d, erreur), vu: false };
      t.relire = true;
      return;
    }
    social.confirmes.push({ n: ++social.horloge, d: d });
    if (social.confirmes.length > 200) social.confirmes.splice(0, social.confirmes.length - 200);
    if (!estReaction(d)) t.relire = true;
    // Un abonnement fait vers un compte public : la relecture dira s'il est devenu privé entre-temps.
    if (d.geste === Social.GESTES.SABONNER && d.prive === false) (t.publics || (t.publics = [])).push(d);
  }
  // Après la vidange : l'écran social ouvert se redessine ; il se RELIT si un geste a changé un lien ou la guilde,
  // ou si la base en a refusé un (l'état réel).
  async function rafraichirSocial() {
    var t = social.aRafraichir;
    social.aRafraichir = null;
    if (!t) return;
    if (t.publics) {
      // « Le compte est devenu privé » : les liens relus après la confirmation (une lecture qui échoue ne dit rien).
      try {
        await chargerLiens();
        var phrase = Social.phraseDevenuPrive(t.publics, social.liensBruts);
        if (phrase) social.refus = { phrase: phrase, vu: false };
      } catch (e) { /* hors ligne : l'écran se relira plus tard */ }
    }
    recalculerLiens();
    if (ecranCourant === 'fil') return t.relire ? rendreFil(true) : dessinerFil();
    if (ecranCourant === 'amis') return t.relire ? rendreAmisApresGeste() : dessinerAmis();
    if (ecranCourant === 'ami') {
      var a = social.ami;
      return t.relire && a && a.pseudo && !a.sous ? rendreAmi(a.pseudo, { relecture: true }) : dessinerAmi();
    }
    if (ecranCourant === 'guilde') return t.relire ? rendreGuilde(social.guilde && social.guilde.onglet, true) : dessinerGuilde();
  }
  function redessinerSocial() {
    recalculerLiens();
    if (ecranCourant === 'fil') dessinerFil();
    else if (ecranCourant === 'amis') dessinerAmis();
    else if (ecranCourant === 'ami') dessinerAmi();
    else if (ecranCourant === 'guilde') dessinerGuilde();
  }

  function recalculerLiens() {
    social.liens = social.liensBruts
      ? Social.liensRanges(Social.liensAvecGestes(social.liensBruts, gestesDepuis(social.liensN))) : null;
    majBadgeSocial();
  }
  async function chargerLiens() {
    var n0 = social.horloge;
    try { social.liensBruts = await Donnees.socialLiens(); social.liensN = n0; }
    catch (e) { social.liensBruts = null; social.liens = null; throw e; }
    recalculerLiens();
    return social.liens;
  }
  // 184 (D5, Soc-demande-invisible) — LES DEMANDES D'ABONNEMENT S'ALLUMENT DÈS L'ACCUEIL : les liens se lisent à
  // l'ouverture, une fois le premier écran posé, SANS être attendus (hors ligne ou en erreur : le point reste éteint,
  // rien ne se dit). Sans cela, le point de l'onglet n'apparaissait qu'après un passage par un écran social.
  function lireLiensALOuverture(userId) {
    // L'outil de rejeu (développement) ne parle jamais au réseau : rien à lire.
    if (!jeuAllume() || rejeuDemande) return;
    chargerLiens().catch(function () {}).then(function () {
      // Le compte a changé pendant la lecture : ses liens ne sont plus ceux de l'écran.
      if (!sessionActive || idDeSession(sessionActive) !== userId) oublierSocial();
    });
  }
  // Un badge sur l'onglet pour les demandes reçues (pas de notification push).
  function majBadgeSocial() {
    var b = $('onglet-jeu');
    // Un attribut, pas une classe : `rendreOnglets` réécrit la classe à chaque écran.
    if (!b) return;
    if (social.liens && social.liens.demandesRecues.length) b.setAttribute('data-demandes', String(social.liens.demandesRecues.length));
    else b.removeAttribute('data-demandes');
  }

  async function medaillesDe(sessionId) {
    if (!social.medailles[sessionId]) {
      social.medailles[sessionId] = faits.medaillesDuSocial(corpus(), await Donnees.socialRecordsSeance(sessionId));
    }
    return social.medailles[sessionId];
  }

  function vueDuFil() {
    var r = social.liens, G = Social.GESTES;
    var demandes = (r ? r.demandesRecues : []).map(function (d) {
      return { pseudo: d.pseudo, couleur: Social.couleurDuBlason(d.pseudo),
        sur: function () { allerAmi(d.pseudo); },
        surAccepter: function () { poserGesteSocial({ geste: G.ACCEPTER, autre: d.user_id, pseudo: d.pseudo }); },
        // Refuser = retirer la demande, en silence.
        surRefuser: function () { poserGesteSocial({ geste: G.RETIRER_ABONNE, autre: d.user_id, pseudo: d.pseudo, refuser: true }); } };
    });
    var refus = phraseDeRefus(), enAttente = ligneEnAttente(horsGuilde);
    if (!social.fil) {
      return { etat: social.erreurFil ? 'erreur' : 'charge', message: social.erreurFil, demandes: demandes, refus: refus, attente: enAttente };
    }
    var maintenant = new Date();
    return { etat: 'ok', demandes: demandes, refus: refus, attente: enAttente,
      cartes: Social.filAvecGestes(social.fil, gestesDepuis(social.filN)).map(function (l) {
        return { session_id: l.session_id, pseudo: l.pseudo, couleur: Social.couleurDuBlason(l.pseudo),
          quand: Modele.quand(l.debut, maintenant), titre: l.titre || null, tonnes: tonnesSociales(l.tonnage_kg),
          medailles: social.medailles[l.session_id] || [], jaiReagi: !!l.j_ai_reagi,
          surProfil: function () { allerAmi(l.pseudo); },
          surVoir: function () { social.voirSeance = { pseudo: l.pseudo, session_id: l.session_id, debut: l.debut }; allerAmi(l.pseudo); },
          surReagir: function () {
            poserGesteSocial({ geste: l.j_ai_reagi ? G.RETIRER_REACTION : G.REAGIR, session: l.session_id, pseudo: l.pseudo });
          } };
      }) };
  }
  function dessinerFil() {
    if (ecranCourant !== 'fil') return;
    Rendu.rendreFil($('social-fil'), vueDuFil());
    refusVu();
  }

  // `relecture` (107) : relu après un geste refusé — la phrase du refus reste.
  async function rendreFil(relecture) {
    montrer('fil', Routeur.FIL);
    ouvrirEcranSocial(relecture === true);
    var jeton = ++social.jeton;
    social.fil = null; social.erreurFil = null;
    dessinerFil();
    try {
      await chargerLiens();
      // 89 — ouvrir le social publie mes scores de force (seulement s'ils ont changé), sans attendre.
      publierScoresForce().catch(function (err) { console.warn('Les scores de force attendent le réseau :', texteErreur(err)); });
      var n0 = social.horloge;
      var fil = Social.filRange(await Donnees.socialFil());
      await Promise.all(fil.map(function (l) { return medaillesDe(l.session_id).catch(function () { return []; }); }));
      if (jeton !== social.jeton) return;
      social.fil = fil; social.filN = n0;
    } catch (e) {
      if (jeton !== social.jeton) return;
      social.erreurFil = erreurSociale(e, 'le fil');
    }
    dessinerFil();
  }

  // ── Le profil d'une personne : « /a/<pseudo> » ──
  function vueDeLAmi() {
    var a = social.ami;
    if (!a || a.etat !== 'ok') return a || { etat: 'charge' };
    // 107 — le profil lu, et les gestes qu'il ne contient pas encore (bloqué : il n'est plus visible).
    var p = Social.profilAvecGestes(a.profil, gestesDepuis(a.n));
    if (!p) return { etat: 'ok', profil: null, message: a.message || phraseDeRefus() };
    var moi = userId(), cercle = Social.cercleDe(p, moi), G = Social.GESTES;
    var lui = { autre: p.id, pseudo: p.pseudo };
    var menu = [];
    if (cercle === Social.SUIVI || cercle === Social.MUTUEL || cercle === Social.DEMANDE) {
      menu.push({ geste: 'retirer-abonnement', texte: cercle === Social.DEMANDE ? 'Annuler la demande' : 'Retirer l’abonnement',
        sur: function () { poserGesteSocial(Object.assign({ geste: G.RETIRER_ABONNEMENT }, lui)); } });
    }
    if (p.me_suit) {
      menu.push({ geste: 'retirer-abonne', texte: 'Retirer cet abonné',
        sur: function () { poserGesteSocial(Object.assign({ geste: G.RETIRER_ABONNE }, lui)); } });
    }
    if (cercle !== Social.MOI) {
      menu.push({ geste: 'bloquer', texte: 'Bloquer', confirmer: 'Bloquer ' + p.pseudo + ' : confirmer',
        sur: function () {
          poserGesteSocial(Object.assign({ geste: G.BLOQUER }, lui)).then(function () { allerA(Routeur.FIL, {}, true); rendreFil(); });
        } });
    }
    var texteBouton = Social.boutonDe(p, cercle);
    var attend = gestesEnAttente().some(function (d) { return horsGuilde(d) && !estReaction(d) && (d.autre ? d.autre === p.id : d.pseudo === p.pseudo); });
    var etatTexte = cercle === Social.MOI ? 'C’est toi' : (Social.etatDe(p, cercle) || (p.compte_prive ? 'Compte privé' : null));
    if (attend) etatTexte = (etatTexte ? etatTexte + ' · ' : '') + Social.EN_ATTENTE;
    var vue = { etat: 'ok', message: a.message || phraseDeRefus(), profil: {
      pseudo: p.pseudo, couleur: Social.couleurDuBlason(p.pseudo),
      ligneJeu: Social.ligneDuJeu(p.niveau, p.titre, Rendu.JEU_TITRES),
      etatTexte: etatTexte,
      bio: p.bio,   // 137 : la base décide (null hors des cercles) ; aucun réglage de visibilité du v1 n'est lu
      bouton: texteBouton ? { texte: texteBouton, sur: function () {
        poserGesteSocial(Object.assign({ geste: G.SABONNER, prive: p.compte_prive !== false, niveau: p.niveau === undefined ? null : p.niveau }, lui));
      } } : null,
      menu: cercle === Social.MOI ? [] : menu } };
    if (!Social.voitLeCalendrier(cercle)) {
      vue.cache = cercle === Social.MOI ? null
        : cercle === Social.DEMANDE ? 'Ses séances se voient quand ' + p.pseudo + ' accepte ta demande.'
        : 'Abonne-toi pour voir ses séances.';
      return vue;
    }
    vue.calendrier = Social.calendrierSocial(a.annee, a.mois, a.seances || []);
    vue.choisi = a.choisi ? a.choisi.cle : null;
    vue.surMois = function (n) { var m = Calendrier.decalerMois(a.annee, a.mois, n); chargerMoisAmi(m.annee, m.mois, null); };
    vue.surJour = function (j) { choisirJourAmi(j); };
    vue.resume = a.resume || null;
    // 89 — ÉTAGE 2, mutuels seulement : son mois en deux chiffres, « Ses exercices », « Se comparer sur la période ».
    if (Social.voitLeDetail(cercle)) {
      var tonnage = (a.seances || []).reduce(function (x, s) { return x + (Number(s.tonnage_kg) || 0); }, 0);
      vue.mois = { seances: (a.seances || []).length, tonnes: tonnesSociales(tonnage),
        libelle: Modele.MOIS_LONGS[a.mois] };
      vue.exercices = (a.exercices || []).map(function (x) {
        return { slug: x.exercise_slug, nom: nomSocial(x.exercise_slug),
          sous: kgSocial(x.charge_max) + ' · ' + x.seances + ' séance' + (x.seances > 1 ? 's' : ''),
          sur: function () { allerA(Routeur.AMI, { pseudo: p.pseudo, slug: x.exercise_slug }); rendreAmi(p.pseudo, { slug: x.exercise_slug }); } };
      });
      vue.surComparer = function () { allerA(Routeur.AMI, { pseudo: p.pseudo, comparer: true }); rendreAmi(p.pseudo, { comparer: true }); };
    }
    return vue;
  }

  // Le nom d'un exercice du catalogue (« Squat (Barre) »), un slug inconnu tel quel.
  function nomSocial(slug) {
    var index = corpus().catalogue() || {};
    return index[slug] ? index[slug].nom : slug;
  }
  function aLaBarreSocial(slug) { return Social.aLaBarre((corpus().catalogue() || {})[slug]); }
  function kgSocial(v) { return Modele.nombreTexte(v) + ' kg'; }
  function dessinerAmi() {
    if (ecranCourant !== 'ami') return;
    var a = social.ami;
    // 89 — le retour d'une sous-page ramène au profil (« ← jordan »), celui du profil au fil.
    var retour = $('btn-retour-ami');
    if (retour) retour.textContent = a && a.sous ? '← ' + a.pseudo : '← Fil';
    if (a && a.sous === 'exercice') return Rendu.rendreExerciceAmi($('social-ami'), vueExerciceAmi());
    if (a && a.sous === 'comparer') return Rendu.rendreComparaison($('social-ami'), vueComparaison());
    Rendu.rendreAmi($('social-ami'), vueDeLAmi());
    if (a && a.etat === 'ok') refusVu();
  }

  // `params` (89) : `{ slug }` — son exercice ; `{ comparer: true }` — se comparer sur la période ; rien — son profil.
  // `params.relecture` (107) : relu après un geste refusé — la phrase du refus reste.
  async function rendreAmi(pseudo, params) {
    montrer('ami', Routeur.AMI);
    ouvrirEcranSocial(!!(params && params.relecture));
    var jeton = ++social.jeton;
    var sous = params && params.slug ? 'exercice' : params && params.comparer ? 'comparer' : null;
    var voir = social.voirSeance && social.voirSeance.pseudo === pseudo ? social.voirSeance : null;
    social.voirSeance = null;
    social.ami = { etat: 'charge', pseudo: pseudo, sous: sous };
    dessinerAmi();
    try {
      var n0 = social.horloge;
      var p = await Donnees.socialProfil(pseudo);
      if (jeton !== social.jeton) return;
      if (sous) {
        // ⚠️ MUTUELS SEULEMENT : à sens unique, l'app ne demande rien (et la base ne rendrait rien).
        social.ami = { etat: 'ok', pseudo: pseudo, profil: p, n: n0, sous: sous, slug: params.slug || null, periode: 'mois' };
        dessinerAmi();
        if (p && Social.voitLeDetail(Social.cercleDe(p, userId()))) {
          await (sous === 'exercice' ? chargerExerciceAmi(social.ami) : chargerComparaison(social.ami));
        }
        return;
      }
      var d = voir ? new Date(voir.debut) : new Date();
      social.ami = { etat: 'ok', pseudo: pseudo, profil: p, n: n0, annee: d.getFullYear(), mois: d.getMonth(), seances: [] };
      dessinerAmi();
      if (p && Social.voitLeCalendrier(Social.cercleDe(p, userId()))) {
        await chargerMoisAmi(social.ami.annee, social.ami.mois, voir ? voir.session_id : null);
      }
      if (p && Social.voitLeDetail(Social.cercleDe(p, userId())) && social.ami && social.ami.profil === p) {
        var a = social.ami, ex = await Donnees.socialExercicesAmi(p.id);
        if (social.ami !== a) return;
        a.exercices = ex;
        dessinerAmi();
      }
    } catch (e) {
      if (jeton !== social.jeton) return;
      social.ami = { etat: 'erreur', pseudo: pseudo, message: erreurSociale(e, 'ce profil') };
      dessinerAmi();
    }
  }

  // 144-6 — la feuille « Comment faire » d'un exercice de la séance d'un ami : la fiche (125), lecture seule.
  function ouvrirCommentFaireAmi(exo) {
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleCommentFaire(cible, {
        nom: Modele.nommer(Modele.indexerExercices(local.exercices), exo.slug),
        comment: vueCommentFaire(exo),
        surFermer: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  async function chargerMoisAmi(annee, mois, sessionChoisie) {
    var a = social.ami;
    if (!a || !a.profil) return;
    var b = Social.bornesDuMois(annee, mois);
    try {
      var seances = await Donnees.socialCalendrier(a.profil.id, b.de, b.a);
      if (social.ami !== a) return;
      a.annee = annee; a.mois = mois; a.seances = seances; a.choisi = null; a.resume = null; a.message = null;
      dessinerAmi();
      if (sessionChoisie) {
        var g = Social.calendrierSocial(annee, mois, seances), cible = null;
        g.lignes.forEach(function (l) { l.jours.forEach(function (j) {
          if (j.seances.some(function (s) { return s.session_id === sessionChoisie; })) cible = j;
        }); });
        if (cible) await choisirJourAmi(cible, sessionChoisie);
      }
    } catch (e) {
      a.message = erreurSociale(e, 'ses séances');
      dessinerAmi();
    }
  }

  // Le résumé d'un jour touché : titre, date, tonnage, records ; le détail des exercices pour un mutuel
  // seulement — à sens unique, la base ne le rend pas, et l'écran le dit.
  async function choisirJourAmi(jour, sessionId) {
    var a = social.ami;
    if (!a || !jour.seances.length) return;
    var s = (sessionId && jour.seances.filter(function (x) { return x.session_id === sessionId; })[0]) ||
      jour.seances[jour.seances.length - 1];
    a.choisi = jour;
    a.resume = { titre: s.titre || null, quand: Modele.quand(s.debut, new Date()), tonnes: tonnesSociales(s.tonnage_kg) };
    dessinerAmi();
    try {
      var medailles = await medaillesDe(s.session_id);
      var mutuel = Social.voitLeDetail(Social.cercleDe(a.profil, userId()));
      var detail = mutuel ? await Donnees.socialDetailSeance(s.session_id) : [];
      if (social.ami !== a || a.choisi !== jour) return;
      a.resume.medailles = medailles;
      if (mutuel && detail.length) {
        var index = corpus().catalogue() || {};
        a.resume.detail = Social.detailParExercice(detail).map(function (x) {
          var nom = Modele.nomCourt(index[x.slug] ? index[x.slug].nom : x.slug);
          var ligne = { nom: nom.charAt(0).toUpperCase() + nom.slice(1), fait: faits.faitDeLExercice(x.series) };
          // 144-6 — « Comment faire » seulement quand l'exercice a une description (comme l'onglet de la page d'exercice).
          var fiche = index[x.slug];
          if (fiche && fiche.description && String(fiche.description).trim()) {
            ligne.surOuvrir = function () { ouvrirCommentFaireAmi(fiche); };
          }
          return ligne;
        });
      } else {
        a.resume.detailCache = 'Le détail des exercices se voit quand vous vous suivez l’un l’autre.';
      }
    } catch (e) {
      a.message = erreurSociale(e, 'ses séances');
    }
    dessinerAmi();
  }

  // ══ LE SOCIAL, ÉTAGE 2 (89, SOCIAL-V1 « Étage 2 », maquette `maquette-social-etage2-guilde-v2.html`, écrans 1 à 3) ══
  //
  // Mutuels seulement ; jamais de vainqueur, de couronne ni de rouge ; le coach et les bilans n'en lisent rien. Les
  // chiffres d'un ami viennent de la base (`social_series_exercice`, `social_periode`), les miens de
  // `faits.seriesComptees` — et les deux passent par les MÊMES fonctions de `social.js`.
  // 179 (B-B11) — l'unité sur la charge (VOIX-V1 principe 1) : « 62,5 kg × 8 », « 8 reps » sans charge.
  function serieTexte(s) { return s ? Modele.serieFaite(s.charge, s.reps) : '—'; }
  function resumeAffiche(r) {
    return r ? { charge: kgSocial(r.meilleureCharge), serie: serieTexte(r.meilleureSerie), seances: String(r.seances),
      mois: r.mois } : null;
  }

  async function chargerExerciceAmi(a) {
    try {
      var series = await Donnees.socialSeriesExercice(a.profil.id, a.slug);
      if (social.ami !== a) return;
      a.resume = Social.resumeExercice(series, new Date());
      a.charge = true;
    } catch (e) {
      a.message = erreurSociale(e, 'cet exercice');
    }
    dessinerAmi();
  }
  function vueExerciceAmi() {
    var a = social.ami;
    if (!a || a.etat !== 'ok') return a || { etat: 'charge' };
    var p = a.profil;
    if (!p) return { etat: 'ok', profil: null };
    var v = { etat: 'ok', profil: { pseudo: p.pseudo }, pseudo: p.pseudo, nom: nomSocial(a.slug), message: a.message || null };
    if (!Social.voitLeDetail(Social.cercleDe(p, userId()))) {
      v.cache = 'Ses exercices se voient quand vous vous suivez l’un l’autre.';
      return v;
    }
    if (!a.charge) { v.chargement = true; return v; }
    v.lui = resumeAffiche(a.resume);
    if (a.compare) {
      var maintenant = new Date();
      v.moi = resumeAffiche(Social.resumeExercice(faits.seriesComptees(corpus(), null, null, a.slug), maintenant)) ||
        { charge: '—', serie: '—', seances: '0', mois: null };
    }
    v.surComparer = a.compare ? null : function () { a.compare = true; dessinerAmi(); };
    return v;
  }

  async function chargerComparaison(a) {
    var b = Social.bornesDePeriode(a.periode, new Date());
    try {
      var lui = Social.periodeDeLaBase(await Donnees.socialPeriode(a.profil.id, b.de, b.a));
      if (social.ami !== a) return;
      var moi = Social.periodeDesLignes(faits.seriesComptees(corpus(), b.de, b.a, null));
      // « À poids de corps égal », pour les exercices à la barre en commun : les scores publiés (le mien d'abord à jour).
      var barres = Object.keys(moi.exercices).filter(function (k) { return lui.exercices[k] && aLaBarreSocial(k); });
      var scores = {};
      if (barres.length) await publierScoresForce().catch(function () {});
      for (var i = 0; i < barres.length; i++) {
        var lignes = await Donnees.socialScoresForce(barres[i]);
        scores[barres[i]] = {
          moi: (lignes.filter(function (l) { return l.moi; })[0] || {}).score,
          lui: (lignes.filter(function (l) { return l.user_id === a.profil.id; })[0] || {}).score
        };
      }
      if (social.ami !== a) return;
      a.comparatif = Social.comparaisonPeriode(moi, lui, { estALaBarre: aLaBarreSocial, scores: scores, nomDe: nomSocial });
    } catch (e) {
      a.message = erreurSociale(e, 'la comparaison');
    }
    dessinerAmi();
  }
  function vueComparaison() {
    var a = social.ami;
    if (!a || a.etat !== 'ok') return a || { etat: 'charge' };
    var p = a.profil;
    if (!p) return { etat: 'ok', profil: null };
    var v = { etat: 'ok', profil: { pseudo: p.pseudo }, pseudo: p.pseudo, message: a.message || null,
      periodes: Social.PERIODES.map(function (x) {
        return { cle: x.cle, libelle: x.libelle, actif: x.cle === a.periode, sur: function () {
          if (a.periode === x.cle) return;
          a.periode = x.cle; a.comparatif = null; a.message = null;
          dessinerAmi();
          chargerComparaison(a);
        } };
      }) };
    if (!Social.voitLeDetail(Social.cercleDe(p, userId()))) {
      v.cache = 'La comparaison se voit quand vous vous suivez l’un l’autre.';
      return v;
    }
    var c = a.comparatif;
    if (!c) { v.chargement = true; return v; }
    var t = c.totaux;
    v.totaux = [
      { libelle: 'Séances', moi: String(t.moi.seances), lui: String(t.lui.seances) },
      { libelle: 'Tonnage', moi: tonnesSociales(t.moi.tonnage_kg), lui: tonnesSociales(t.lui.tonnage_kg) },
      { libelle: 'Séries', moi: String(t.moi.series), lui: String(t.lui.series) },
      { libelle: 'Reps', moi: String(t.moi.reps), lui: String(t.lui.reps) }
    ];
    v.communs = c.communs.map(function (x) {
      return { slug: x.slug, nom: nomSocial(x.slug), barre: x.barre, personnes: x.ordre.map(function (qui) {
        return { qui: qui === 'moi' ? 'toi' : p.pseudo, moi: qui === 'moi', kg: kgSocial(qui === 'moi' ? x.moi : x.lui) };
      }) };
    });
    return v;
  }

  // ── MES SCORES DE FORCE (`scores_force`) : publiés depuis l'appareil, SEULEMENT S'ILS ONT CHANGÉ ──
  //
  // La meilleure charge de chaque exercice à la barre (mes séries comptées des 12 derniers mois, `Social.bornesDouzeMois`
  // — la fenêtre des kilos d'« Entre amis ») et ma dernière pesée datée, FLOUTÉE
  // (`Social.poidsFloute` : la pesée + mon décalage secret, arrondie à la dizaine — audit du 16/10/2026, prompt 114),
  // donnent le score DOTS ; seul le score part. Ni la pesée, ni le décalage, ni la charge ne quittent le téléphone.
  // Sans sexe précisé, sans pesée ou sans décalage gardé sur l'appareil, je n'apparais pas : mes scores sont retirés
  // — quand on SAIT qu'il y en a (publiés depuis l'ouverture, ou une ligne à moi dans `lignesConnues`, la réponse de
  // `social_scores_force`). Le profil pas encore lu : on ne sait rien, on ne fait rien. Rend `true` s'il a écrit.
  //
  // AVANT v2_091 la base exige encore la charge (NOT NULL, code 23502) : on ne la lui donne pas — mes scores sont
  // retirés, et on n'insiste plus jusqu'à la prochaine ouverture de l'app. Après v2_091, le score seul passe.
  var scoresPublies = null, baseExigeLaCharge = false;
  async function publierScoresForce(lignesConnues) {
    var moi = userId();
    if (!moi || !profil) return false;
    var index = Modele.indexerExercices(local.exercices);
    // La dernière pesée datée, telle quelle (`resume` l'arrondit au dixième, pour l'affichage).
    var pesees = Poids.normaliser(local.pesees || []), pesee = pesees.length ? pesees[pesees.length - 1] : null;
    var douze = Social.bornesDouzeMois(new Date());
    var scores = baseExigeLaCharge ? null :
      Social.scoresAPublier(Social.meilleuresCharges(faits.seriesComptees(corpus(), douze.de, douze.a, null)),
        pesee ? pesee.poids : null, profil.sexe, function (slug) { return Social.aLaBarre(index[slug]); },
        decalageDuPoids(moi));
    if (!scores) {
      var enBase = (scoresPublies && Object.keys(scoresPublies).length) ||
        (lignesConnues || []).some(function (l) { return l && l.moi; });
      if (!enBase) return false;
      await Donnees.retirerScores(moi);
      scoresPublies = {};
      return true;
    }
    var changes = Social.scoresChanges(scores, scoresPublies);
    if (changes.length) {
      try {
        await Donnees.publierScores(moi, changes);
      } catch (e) {
        if (!e || e.code !== '23502') throw e;
        baseExigeLaCharge = true;
        await Donnees.retirerScores(moi);
        scoresPublies = {};
        return true;
      }
    }
    var publies = {};
    scores.forEach(function (s) { publies[s.exercise_slug] = { score: s.score }; });
    scoresPublies = publies;
    return changes.length > 0;
  }
  // Mon décalage secret (−5 à +5 kg), tiré une fois sur CET appareil et gardé là (`localStorage`), jamais publié.
  // Sans stockage qui le retienne, `null` : un décalage retiré à chaque ouverture finirait par trahir la pesée (la
  // fréquence des deux poids ronds la situe) — on ne publie pas.
  var CLE_DECALAGE_POIDS = 'th-v2-decalage-poids-';
  function decalageDuPoids(moi) {
    try {
      var st = racine.localStorage, cle = CLE_DECALAGE_POIDS + moi, lu = st.getItem(cle);
      if (Social.decalageValide(lu)) return Number(lu);
      var tirage = new Uint32Array(1);
      racine.crypto.getRandomValues(tirage);
      var d = Social.decalageDepuis(tirage[0] / 4294967296);
      if (d === null) return null;
      st.setItem(cle, String(d));
      return st.getItem(cle) === String(d) ? d : null;
    } catch (e) {
      return null;
    }
  }

  // « Entre amis », en bas de MA page d'exercice, pour un exercice à la barre : mes mutuels et moi, à poids de corps
  // égal, avec les vrais kilos de la meilleure charge sur 12 mois — les leurs lus dans leurs séances visibles
  // (`social_meilleures_charges`, v2_091), les miens sur l'appareil. Rien sous deux personnes ; rien hors ligne ;
  // rien tant que v2_091 n'est pas lancée (la fonction manque). Le « i » : la phrase validée le 16/10/2026, mot pour mot.
  var TEXTE_ENTRE_AMIS = 'On compare la force rapportée au poids de corps (formule DOTS), arrondi à 10 kg près : un ' +
    'nettement plus léger qui soulève autant passe devant. Tes amis ne voient jamais ton poids et ne peuvent pas le ' +
    'retrouver. Sans pesée, tu n’apparais pas.';
  var jetonEntreAmis = 0;
  async function entreAmis(slug, exo) {
    var cible = $('exercice-entre-amis'), jeton = ++jetonEntreAmis;
    Rendu.rendreEntreAmis(cible, null);
    if (!Social.aLaBarre(exo) || !userId()) return;
    try {
      var lignes = await Donnees.socialScoresForce(slug);
      if (await publierScoresForce(lignes)) lignes = await Donnees.socialScoresForce(slug);
      var charges = await Donnees.socialMeilleuresCharges(slug);
      var douze = Social.bornesDouzeMois(new Date());
      var maCharge = Social.meilleuresCharges(faits.seriesComptees(corpus(), douze.de, douze.a, slug))[slug];
      var classement = Social.classementEntreAmis(lignes, charges, maCharge);
      if (jeton !== jetonEntreAmis || ecranCourant !== 'exercice') return;
      Rendu.rendreEntreAmis(cible, classement ? { info: TEXTE_ENTRE_AMIS, lignes: classement.map(function (x) {
        return { rang: x.rang, pseudo: x.moi ? 'toi' : x.pseudo, moi: x.moi, couleur: Social.couleurDuBlason(x.pseudo),
          kg: kgSocial(x.charge_kg) };
      }) } : null);
    } catch (e) {
      console.warn('Entre amis :', texteErreur(e));
    }
  }

  // ══ LA GUILDE (90, SOCIAL-V1 « Guilde », maquette `maquette-social-etage2-guilde-v2.html`, écran 4) ══════════
  //
  // Tout passe par les fonctions de la base (v2_080), qui gardent les règles : 30 membres, une guilde par personne,
  // inviter un abonné mutuel seulement, l'administration au plus ancien quand l'administrateur part. Mes nombres
  // (séances prévues, records sans dépasser la charge proposée) se calculent sur l'appareil (`faits.scoresDeGuilde`) et
  // seuls les nombres partent. Pas de messagerie : des réactions. Le coach et les bilans ne lisent rien d'ici.
  var ONGLETS_GUILDE = [
    { cle: 'semaine', libelle: 'Semaine' }, { cle: 'fil', libelle: 'Fil' },
    { cle: 'progression', libelle: 'Progression' }, { cle: 'membres', libelle: 'Membres' }
  ];
  // MES NOMBRES DE GUILDE, publiés seulement s'ils ont changé depuis l'ouverture de l'app (et seulement membre).
  var scoresGuildePublies = null;
  function mesScoresDeGuilde() {
    return faits.scoresDeGuilde(corpus(), local.predictions || [], profil.seances_par_semaine, new Date());
  }
  // À l'ouverture de la guilde (en direct : la jauge lue juste après doit les contenir).
  async function publierScoresGuilde() {
    var moi = userId();
    if (!moi || !profil) return false;
    var s = mesScoresDeGuilde();
    if (!Social.scoresGuildeChanges(s, scoresGuildePublies)) return false;
    await Donnees.publierScoresGuilde(moi, s);
    scoresGuildePublies = s;
    return true;
  }
  // ⚠️ 121 (audit du 16/10/2026, 05 #5) — À LA FIN D'UNE SÉANCE ET AU DÉMARRAGE, PAR LA FILE. Ils ne partaient que si
  // l'écran Guilde avait été ouvert depuis le lancement de l'app (`social.guilde`, en mémoire) : la jauge du défi et la
  // Progression ignoraient les membres qui s'entraînent sans ouvrir la guilde. Désormais ils sont POSÉS dans la file
  // (sur disque, rejoués au retour du réseau, le dernier calcul remplace le précédent) dès qu'ils diffèrent de ce que
  // l'appareil a déjà fait partir (`scoresGuildeConnus`, gardé sur l'appareil : au démarrage, « périmés » = une
  // semaine, un mois ou des séances que la dernière publication ne connaissait pas). La vidange lit `guilde_moi` :
  // membre, elle les écrit ; sinon, rien ne part (« quand on me sait membre », §6.2).
  var CLE_SCORES_GUILDE = 'guilde-scores-connus';
  var scoresGuildeConnus = null;
  async function poserScoresGuilde() {
    var moi = userId();
    if (!moi || !profil) return false;
    var s = mesScoresDeGuilde();
    if (!Social.scoresGuildeChanges(s, scoresGuildeConnus)) return false;
    await poserGesteSocial({ moi: moi, geste: Social.GESTES.SCORES_GUILDE, scores: s }, true);
    return true;
  }
  async function publierScoresGuildeDeLaFile(d) {
    var g = await Donnees.guildeMoi();
    if (g) {
      await Donnees.publierScoresGuilde(d.moi, d.scores);
      if (d.moi === userId()) scoresGuildePublies = d.scores;
    }
    if (d.moi === userId()) {
      scoresGuildeConnus = d.scores;
      await Cache.ecrireMeta(CLE_SCORES_GUILDE, d.scores).catch(function () {});
    }
    return true;
  }

  async function chargerGuilde(g) {
    var moi = await Donnees.guildeMoi();
    if (social.guilde !== g) return;
    g.g = moi;
    if (!moi) {
      g.invitations = await Donnees.guildeInvitationsRecues();
      return;
    }
    await publierScoresGuilde().catch(function (err) { console.warn('Les nombres de guilde attendent le réseau :', texteErreur(err)); });
    var r = await Promise.all([Donnees.guildeMembres(), Donnees.guildeSemaine(), Donnees.guildeProgression()]);
    if (social.guilde !== g) return;
    g.membres = r[0]; g.semaine = r[1]; g.progression = r[2];
    if (g.onglet === 'fil') await chargerFilGuilde(g);
    if (g.onglet === 'membres' && moi.admin !== undefined) await chargerLiens().catch(function () {});
  }
  async function chargerFilGuilde(g) {
    // 121 (D5) — mes abonnements disent quelles séances je peux ouvrir (« Voir la séance ») ; hors ligne, aucune.
    await chargerLiens().catch(function () {});
    var fil = Social.filRange(await Donnees.guildeFil());
    await Promise.all(fil.map(function (l) {
      if (social.medailles[l.session_id]) return null;
      return Donnees.guildeRecordsSeance(l.session_id).then(function (lignes) {
        social.medailles[l.session_id] = faits.medaillesDuSocial(corpus(), lignes);
      }).catch(function () {});
    }));
    if (social.guilde === g) g.fil = fil;
  }

  // `relecture` (107) : relue après un geste refusé — la phrase du refus reste.
  async function rendreGuilde(onglet, relecture) {
    montrer('guilde', Routeur.GUILDE);
    ouvrirEcranSocial(relecture === true);
    // La couleur choisie pour « Créer » reste d'une lecture à l'autre (une création refusée se relit sans la perdre).
    var avant = social.guilde, n0 = social.horloge;
    var g = { etat: 'charge', onglet: onglet || (avant && avant.onglet) || 'semaine',
              couleur: (avant && avant.couleur) || Social.COULEURS_GUILDE[0], n: n0 };
    // ⚠️ 121 (audit du 16/10/2026, 05 #19) — RELUE APRÈS UN GESTE, L'ÉCRAN GARDE CE QU'IL MONTRE jusqu'à la nouvelle
    // lecture : la lecture d'avant, et les gestes qu'elle ne contient pas (`g.n` reste le sien le temps de relire). Il
    // passait par « Chargement… » après chaque geste confirmé (un rang, un défi, une invitation) : l'écran clignotait,
    // et le banc `guilde` lisait parfois ce « Chargement… » sous charge (sa section instable).
    if (relecture === true && avant && avant.etat === 'ok') {
      ['g', 'membres', 'semaine', 'invitations', 'fil', 'progression'].forEach(function (k) { g[k] = avant[k]; });
      g.etat = 'ok'; g.n = avant.n;
    }
    social.guilde = g;
    dessinerGuilde();
    try {
      await chargerGuilde(g);
      if (social.guilde !== g) return;
      // Le fil n'est relu que sur son onglet (sinon, à l'ouverture de l'onglet, comme avant).
      if (g.onglet !== 'fil' && avant && g.fil === avant.fil) g.fil = null;
      g.etat = 'ok'; g.n = n0;
    } catch (e) {
      if (social.guilde !== g) return;
      g.etat = 'erreur'; g.message = erreurSociale(e, 'la guilde');
    }
    dessinerGuilde();
  }
  function dessinerGuilde() {
    if (ecranCourant !== 'guilde') return;
    Rendu.rendreGuilde($('social-guilde'), vueDeLaGuilde());
    if (social.guilde && social.guilde.etat === 'ok') refusVu();
  }

  function vueDeLaGuilde() {
    var g = social.guilde;
    if (!g || g.etat !== 'ok') return g || { etat: 'charge' };
    var G = Social.GESTES;
    // 107 — ce que la base a rendu, et les gestes qu'elle ne contient pas encore.
    var o = Social.guildeAvecGestes({ g: g.g, membres: g.membres, semaine: g.semaine, invitations: g.invitations, fil: g.fil,
      progression: g.progression }, gestesDepuis(g.n), userId());
    var v = { etat: 'ok', message: g.message || phraseDeRefus(), couleurs: Social.COULEURS_GUILDE,
      attente: ligneEnAttente(function (d) { return d.geste === G.GUILDE || estReaction(d); }) };
    if (!o.g) {
      // Sans guilde : les invitations reçues, puis « Créer une guilde ».
      v.invitations = (o.invitations || []).map(function (i) {
        var extra = { nom: i.nom, couleur: i.couleur, membres: i.membres };
        return { nom: i.nom, couleur: i.couleur, invitant: i.invitant, membres: i.membres,
          surRejoindre: function () { poserGuilde('guilde_repondre', { p_guilde: i.guilde_id, p_rejoindre: true }, extra); },
          surRefuser: function () { poserGuilde('guilde_repondre', { p_guilde: i.guilde_id, p_rejoindre: false }, extra); } };
      });
      v.creer = { couleur: g.couleur, surCouleur: function (c) { g.couleur = c; dessinerGuilde(); },
        surCreer: function (nom) {
          var n = Social.nomDeGuilde(nom);
          if (!n) { g.message = 'Le nom fait de 3 à 24 caractères.'; return dessinerGuilde(); }
          poserGuilde('guilde_creer', { p_nom: n, p_couleur: g.couleur });
        } };
      return v;
    }
    var moi = o.g, membres = o.membres || [];
    v.guilde = { nom: moi.nom, couleur: moi.couleur, membres: moi.membres + ' membre' + (moi.membres > 1 ? 's' : '') };
    v.onglets = ONGLETS_GUILDE.map(function (x) {
      return { cle: x.cle, libelle: x.libelle, actif: g.onglet === x.cle, sur: function () {
        if (g.onglet === x.cle) return;
        g.onglet = x.cle; g.quitter = false;
        if (x.cle === 'fil' && !o.fil) {
          dessinerGuilde();
          return chargerFilGuilde(g).catch(function (e) { g.message = erreurSociale(e, 'le fil de la guilde'); }).then(dessinerGuilde);
        }
        if (x.cle === 'membres') { dessinerGuilde(); return chargerLiens().catch(function () {}).then(dessinerGuilde); }
        dessinerGuilde();
      } };
    });
    var maintenant = new Date();
    var progression = Social.progressionRangee(o.progression).map(function (x) {
      return { rang: x.rang, pseudo: x.moi ? 'toi' : x.pseudo, moi: x.moi, texte: x.texte };
    });
    v.titreProgression = 'Progression ' + (/^[aeiouéè]/i.test(Modele.MOIS_LONGS[maintenant.getMonth()]) ? 'd’' : 'de ') +
      Modele.MOIS_LONGS[maintenant.getMonth()];
    if (g.onglet === 'semaine') {
      var s = o.semaine;
      var j = Social.jaugeDuDefi(s, moi.membres);
      v.defi = j ? { titre: j.titre, quand: Social.joursRestants(maintenant), part: j.part, phrase: j.phrase } : null;
      v.cetteSemaine = s ? { seances: String(s.seances), records: String(Social.recordsDeLaSemaine(s)), tonnes: tonnesSociales(s.tonnage_kg) } : null;
      v.progression = progression;
      // Le défi est FIGÉ une fois la semaine lancée (un membre y a terminé une séance) : la base le refuserait.
      if (moi.admin && Social.defiModifiable(s)) {
        v.choixDefi = Social.DEFIS.map(function (d) {
          return { cle: d.cle, libelle: d.libelle, actif: s && s.defi === d.cle, choix: (d.choix || []).map(function (n) {
            return { n: n, actif: s && s.defi === d.cle && Number(s.n) === n,
              sur: function () { if (Social.defiValide(d.cle, n)) poserGuilde('guilde_choisir_defi', { p_type: d.cle, p_n: n }); } };
          }), sur: d.choix ? null : function () {
            if (Social.defiValide(d.cle, null)) poserGuilde('guilde_choisir_defi', { p_type: d.cle, p_n: null });
          } };
        });
      } else if (moi.admin && s) v.defiFige = Social.PHRASE_DEFI_FIGE;   // 92 — le pourquoi, dit
    } else if (g.onglet === 'fil') {
      if (!o.fil) v.chargementFil = true;
      else v.fil = { etat: 'ok', demandes: [], fin: (o.fil.length ? 'Tu es à jour · les 30 derniers jours'
        : 'Aucune séance des membres ces 30 derniers jours.'), cartes: o.fil.map(function (l) {
          return { session_id: l.session_id, pseudo: l.pseudo, couleur: Social.couleurDuBlason(l.pseudo),
            quand: Modele.quand(l.debut, maintenant), titre: l.titre || null, tonnes: tonnesSociales(l.tonnage_kg),
            medailles: social.medailles[l.session_id] || [], jaiReagi: !!l.j_ai_reagi,
            surProfil: function () { allerAmi(l.pseudo); },
            // 121 (D5, 05 #11) — « Voir la séance » seulement quand je peux la voir : abonné à son auteur. Sinon, son profil
            // dirait « Abonne-toi pour voir ses séances. » — une impasse.
            surVoir: Social.suisAbonne(social.liens, l.user_id) ? function () {
              social.voirSeance = { pseudo: l.pseudo, session_id: l.session_id, debut: l.debut }; allerAmi(l.pseudo);
            } : null,
            surReagir: function () {
              poserGesteSocial({ geste: l.j_ai_reagi ? G.RETIRER_REACTION : G.REAGIR, session: l.session_id, pseudo: l.pseudo });
            } };
        }) };
    } else if (g.onglet === 'progression') {
      v.progression = progression;
      v.explicationProgression = 'La part de tes exercices du mois avec au moins un record, sans dépasser la charge ' +
        'proposée par le coach. Un exercice compte à partir de 2 séances dans le mois. Remise à zéro le 1er.';
    } else {
      var titres = Rendu.JEU_TITRES;
      var monRang = (membres.filter(function (m) { return m.moi; })[0] || {}).rang || Social.RANG_PAR_DEFAUT;
      v.membres = membres.map(function (m) {
        // 121 (05 #6) — un membre bloqué arrive sans pseudo (v2_094) : « un membre », sans lien vers un profil.
        var nomme = m.pseudo || Social.MEMBRE_ANONYME;
        return { pseudo: m.pseudo || null, couleur: Social.couleurDuBlason(m.pseudo), ligne: Social.ligneMembre(m, titres), moi: !!m.moi,
          surProfil: m.moi || !m.pseudo ? null : function () { allerAmi(m.pseudo); },
          surRetirer: moi.admin && !m.moi ? function () { poserGuilde('guilde_retirer_membre', { p_user: m.user_id }, { pseudo: nomme }); } : null,
          surTransmettre: moi.admin && !m.moi ? function () { poserGuilde('guilde_transmettre', { p_user: m.user_id }, { pseudo: nomme }); } : null };
      });
      v.rangs = Social.RANGS.map(function (r) {
        return { rang: r, actif: r === monRang, sur: function () {
          if (r !== monRang && Social.rangValide(r)) poserGuilde('guilde_choisir_rang', { p_rang: r });
        } };
      });
      if (moi.membres < Social.MEMBRES_MAX) {
        // Une invitation partie (ou qui attend le réseau) : « invitation envoyée », sans bouton.
        v.invitables = social.liens ? Social.invitables(social.liens, membres).map(function (l) {
          var invite = !!o.invites[l.user_id];
          return { pseudo: l.pseudo, couleur: Social.couleurDuBlason(l.pseudo), invite: invite,
            sur: invite ? null : function () { poserGuilde('guilde_inviter', { p_user: l.user_id }, { pseudo: l.pseudo }); } };
        }) : null;
      }
      if (moi.admin) {
        v.edition = g.edition ? { nom: moi.nom, couleur: g.couleurEdition || moi.couleur,
          surCouleur: function (c) { g.couleurEdition = c; dessinerGuilde(); },
          surEnregistrer: function (nom) {
            var n = Social.nomDeGuilde(nom);
            if (!n) { g.message = 'Le nom fait de 3 à 24 caractères.'; return dessinerGuilde(); }
            poserGuilde('guilde_modifier', { p_nom: n, p_couleur: g.couleurEdition || moi.couleur });
          },
          surAnnuler: function () { g.edition = false; g.couleurEdition = null; dessinerGuilde(); } }
          : { surOuvrir: function () { g.edition = true; g.couleurEdition = moi.couleur; dessinerGuilde(); } };
      }
      v.quitter = g.quitter ? { surConfirmer: function () { poserGuilde('guilde_quitter', {}); },
        surAnnuler: function () { g.quitter = false; dessinerGuilde(); } }
        : { surOuvrir: function () { g.quitter = true; dessinerGuilde(); } };
    }
    return v;
  }

  // ══ LE GROUPE DE SÉANCE (91, SOCIAL-V1 « Groupe », maquettes `maquette-social-groupe-v1.html` et
  // `maquette-groupe-direct-interactive.html`) ══════════════════════════════════════════════════════════════════
  //
  // Éphémère, le temps d'une séance (comme dans Dofus), à distance ou à la salle. Tout passe par les fonctions de la
  // base (v2_082), qui gardent les règles : 6 membres, abonnés mutuels seulement, un groupe à la fois, jamais deux
  // personnes qui se bloquent, messages ≤ 140 caractères réservés aux membres. CHACUN GARDE SA SÉANCE : le groupe ne
  // porte que l'identifiant de ma séance, la liste de mes exercices et mon XP. La routine (ou l'utilisateur) décide de
  // la structure, le moteur décide de la charge : « Suivre la séance de X » copie SA LISTE d'exercices, jamais ses
  // charges ; le plan de séance n'est jamais modifié par le groupe, et le coach et les bilans n'en lisent rien.
  //
  // ⚠️ LE DIRECT EST UNE DÉCORATION, JAMAIS UNE DÉPENDANCE : il se relit environ toutes les 20 s par une lecture (pas
  // de temps réel) ; une lecture qui échoue ne dit rien et ne bloque rien — la séance continue normalement.
  //
  // 106 (décisions d'Aurélien du 15/10/2026, SOCIAL-V1 §7.3, v2_087) :
  //   · UN MESSAGE ÉCRIT HORS LIGNE EST GARDÉ SUR LE TÉLÉPHONE (`grp.file`, écrite dans le cache comme la séance, relue
  //     au démarrage par `chargerCache`) et part au retour du réseau — pour le groupe où il a été écrit, une seule fois
  //     (son identifiant). Un refus de la base (groupe fini, quitté) le retire et se dit ; le réseau absent, il attend.
  //   · LE GROUPE EST TERMINÉ dès que toutes les séances sont finies ; CHACUN PEUT LANCER OU REJOINDRE UN AUTRE GROUPE
  //     DÈS QUE SA SÉANCE EST FINIE (`Social.libreDuGroupe`). Mon groupe n'est montré DANS une séance que si c'est la
  //     sienne (`groupeDeLaSeance`) : une séance suivante n'en hérite rien — ni carte, ni liste publiée, ni XP, ni départ.
  var grp = { moi: null, etat: [], direct: [], messages: [], invitations: [], envoyees: [], lu: 0, enCours: false,
              muet: false, ouvert: false, ecrire: false, file: [], envoi: null, message: null, publie: null, vue: null,
              aRejoindre: null, recapAuto: false, traces: {}, quitterDemande: false };
  var CLE_FILE_GROUPE = 'groupe-messages';
  // 121 (05 #12) — les traces « Faite en groupe avec … » de mes séances, gardées sur l'appareil (les 200 dernières).
  var CLE_TRACES_GROUPE = 'groupe-traces', TRACES_GROUPE_MAX = 200;
  var gardeGroupe = null;

  // `action` (121, 05 #12) : ce que l'écran demande au réseau — par défaut, s'entraîner ensemble (inviter, rejoindre :
  // un geste, pas « voir le social »).
  function messageGroupe(e, action) {
    var m = String((e && (e.message || e.details)) || '');
    // 142 — « pas membre » : je ne suis plus dans ce groupe (parti, ou parti en silence après un blocage, SOCIAL-V1 §7.1).
    // Aucune phrase : le réseau est là, et rien n'est à dire. L'opération sort de la file (`refusDuGroupe`).
    if (/groupe_pas_membre/.test(m)) return null;
    if (/groupe_plein/.test(m)) return 'Le groupe est complet : 6 personnes.';
    if (/groupe_invite_non_mutuel/.test(m)) return 'On n’invite qu’un abonné mutuel.';
    if (/groupe_bloque/.test(m)) return 'Ce groupe n’est pas possible.';
    // 177 — les refus de « Rejoindre » se disent en une phrase, jamais en silence.
    if (/groupe_deja_dans_un|groupe_membres_un_a_la_fois/.test(m)) return 'Tu es déjà dans un groupe avec quelqu’un : quitte-le d’abord.';
    if (/groupe_sans_invitation/.test(m)) return 'Cette invitation n’est plus valable.';
    if (/groupe_eteint/.test(m)) return 'Ce groupe est terminé.';
    if (/groupe_messages_texte/.test(m)) return 'Un message fait de 1 à 140 caractères.';
    console.warn('Groupe :', texteErreur(e));
    return phraseDuReseau(action || 's’entraîner ensemble');
  }
  // Mes exercices, dans l'ordre de ma séance (une fois chacun) : ce que voit qui « suit » ma séance.
  function exercicesDe(s) {
    var out = [];
    ((s && s.exercices) || []).forEach(function (e) { if (e && e.exercise_slug && out.indexOf(e.exercise_slug) < 0) out.push(e.exercise_slug); });
    return out;
  }
  function nomDuCatalogue(slug) {
    var e = Modele.indexerExercices(local.exercices)[slug];
    return e ? e.nom : slug;
  }
  // 144-5 — la mesure de l'exercice qui part et de celui qui arrive, pour que « Remplacer » vide les cibles sans sens.
  function mesuresDuRemplacement(avant, apres) {
    var index = Modele.indexerExercices(local.exercices);
    var m = function (slug) { var e = index[slug]; return e && e.mesure ? e.mesure : null; };
    return { avant: m(avant), apres: m(apres) };
  }
  // Ma dernière série validée, lue sur l'appareil (la base peut l'attendre).
  function maDerniereSerie() {
    var t = null;
    if (seance) Seance.toutesLesSeries(seance).forEach(function (x) { if (x.serie.validee_a && (!t || x.serie.validee_a > t)) t = x.serie.validee_a; });
    return t;
  }

  // 106 — ma place dans mon groupe (la ligne `moi` de l'état), et le groupe de CETTE séance.
  function maPlace() { return (grp.etat || []).filter(function (m) { return m && m.moi; })[0] || null; }
  function groupeDeLaSeance(s) {
    var p = maPlace();
    s = s === undefined ? seance : s;
    return !!(grp.moi && s && p && p.session_id === s.id);
  }
  function libreDuGroupe() {
    return !grp.moi || Social.libreDuGroupe(grp.etat, seance ? seance.id : null, new Date().toISOString());
  }
  // 177 — une invitation reçue se VOIT aussi quand je suis seul dans mon groupe (même séance en cours) : la base me laisse
  // partir (`groupe_liberer`, v2_114). Avec un autre membre actif, elle reste cachée (le refus de la base serait certain).
  function invitationsVisibles() {
    return libreDuGroupe() || Social.seulDansMonGroupe(grp.etat, new Date().toISOString());
  }
  // La carte d'une invitation : « Rejoindre » (ma séance en cours continue ; sans séance, je choisis ma séance), « Non merci ».
  function cartesDInvitations() {
    return (grp.invitations || []).map(function (i) {
      return { invitant: i.invitant, surRejoindre: function () { rejoindreInvitation(i); }, surRefuser: function () { refuserInvitation(i); } };
    });
  }
  // 106 — tout ce que le groupe sait du compte qui part (« Quitter », un autre compte qui entre).
  function oublierGroupe() {
    grp.moi = null; grp.etat = []; grp.direct = []; grp.messages = []; grp.invitations = []; grp.envoyees = [];
    grp.file = []; grp.envoi = null; grp.message = null; grp.publie = null; grp.lu = 0; grp.recapAuto = false;
    grp.aRejoindre = null; grp.traces = {}; grp.quitterDemande = false;
  }

  // UNE LECTURE : mon groupe, l'état des séances, le direct, les messages — et, libre (sans groupe, ou ma séance du
  // groupe finie), mes invitations. Une lecture à la fois ; un échec ne dit rien (le direct est une décoration).
  async function chargerGroupe() {
    // L'outil de rejeu (développement) ne lit rien du groupe : il ne parle pas à la base.
    if (!userId() || grp.enCours || rejeuDemande) return;
    grp.enCours = true;
    try {
      await envoyerFileGroupe();
      var moi = await Donnees.groupeMoi();
      grp.moi = moi;
      if (moi) {
        var r = await Promise.all([Donnees.groupeEtat(), Donnees.groupeDirect(), Donnees.groupeMessages()]);
        grp.etat = r[0]; grp.direct = r[1]; grp.messages = r[2];
        await publierMesExercices();
      } else {
        grp.etat = []; grp.direct = []; grp.messages = []; grp.envoyees = [];
      }
      // 106 — libre (ma séance du groupe finie), les invitations d'un autre groupe se montrent déjà.
      grp.invitations = invitationsVisibles() ? await Donnees.groupeInvitationsRecues() : [];
      grp.lu = Date.now();
    } catch (e) {
      console.warn('Le groupe attend le réseau :', texteErreur(e));
    } finally {
      grp.enCours = false;
    }
    redessinerGroupe();
  }
  // La boucle : environ toutes les 20 s, seulement en séance ou dans un groupe, et app visible.
  function tickGroupe() {
    if (!userId() || !(seance || grp.moi || grp.file.length)) return;
    if (doc.visibilityState === 'hidden') return;
    chargerGroupe();
  }
  // Une lecture à l'ouverture d'un écran qui montre le groupe (au plus une toutes les 20 s).
  function rafraichirGroupe() {
    if (!userId()) return;
    if (Date.now() - grp.lu < Social.RAFRAICHIR_GROUPE_MS && grp.lu) return redessinerGroupe();
    chargerGroupe();
  }
  function redessinerGroupe() {
    if (ecranCourant === 'groupe' && grp.vue && grp.vue.mode === 'inviter') dessinerVueGroupe();
    if (ecranCourant === 'seance') dessinerGroupeSeance();
    if (ecranCourant === 'liste' || ecranCourant === 'saisie') dessinerGroupeAccueil();
  }

  // Ma liste d'exercices suit ma séance (pour qui « suit » ma séance) — seulement si elle a changé, et seulement la
  // séance DU groupe (106 : une séance suivante n'écrit pas dans le groupe d'avant).
  async function publierMesExercices() {
    if (!groupeDeLaSeance() || enEdition()) return;
    var l = exercicesDe(seance), cle = l.join(',');
    if (cle === grp.publie) return;
    await Donnees.groupePublier(l, null);
    grp.publie = cle;
  }
  // 106 — LA FILE EST GARDÉE SUR LE TÉLÉPHONE (le brouillon du cache, comme la séance) : écrite AVANT le premier essai
  // d'envoi, réécrite à chaque départ. Un « Quitter » en vol n'y réécrit rien (la génération).
  function garderFileGroupe(g) {
    if (g !== undefined && !generationValide(g)) return Promise.resolve();
    return Cache.ecrireBrouillon(CLE_FILE_GROUPE, grp.file.length ? grp.file : null).catch(function (e) {
      console.warn('La file des messages du groupe n’a pas pu être gardée :', texteErreur(e));
    });
  }
  // Les messages partent dans l'ordre, UN envoi à la fois (deux envois parallèles enverraient la tête deux fois et
  // en retireraient deux). Un REFUS de la base (groupe fini, quitté, texte refusé) retire le message et se dit ; le
  // réseau absent, il attend — la file s'arrête là, rien n'est perdu.
  function envoyerFileGroupe() {
    if (grp.envoi) return grp.envoi;
    var g = generation;
    var envoi = (async function () {
      while (grp.file.length && generationValide(g)) {
        var m = grp.file[0];
        try {
          if (m.geste) await envoyerGesteDuGroupe(m);
          else await Donnees.groupeEnvoyer(m.texte, m.groupe_id, m.id);
        } catch (e) {
          if (!refusDuGroupe(e)) throw e;
          if (m.geste) console.warn('Geste du groupe refusé (' + m.geste + ') :', texteErreur(e));
          else grp.message = messageGroupe(e);
        }
        if (!generationValide(g)) return;
        grp.file = grp.file.filter(function (x) { return x.id !== m.id; });
        await garderFileGroupe(g);
      }
    })();
    // Le verrou se pose APRÈS le départ et se lève quand l'envoi est fini (réussi ou non) — et seulement le sien : une
    // file vide finit tout de suite, un verrou levé AVANT d'être posé resterait posé pour toujours.
    grp.envoi = envoi;
    var lever = function () { if (grp.envoi === envoi) grp.envoi = null; };
    envoi.then(lever, lever);
    return envoi;
  }
  // 136 (audit du 16/10, 06 #14) — UN GESTE DE FIN DU GROUPE, PAR LA FILE DU GROUPE (`grp.file`). La base l'applique au
  // groupe où je suis À L'ENVOI (`groupe_publier`, `groupe_quitter` ne prennent pas de groupe) : parti en retard, il
  // ne doit jamais toucher un AUTRE groupe. On relit donc mon groupe d'abord ; s'il a changé (ou si je n'y suis plus),
  // le geste n'a plus d'objet et sort de la file, sans rien écrire.
  async function envoyerGesteDuGroupe(m) {
    var moi = await Donnees.groupeMoi();
    if (!moi || moi.id !== m.groupe_id) return;
    if (m.geste === 'publier') { await Donnees.groupePublier(m.exercices, m.xp); return; }
    await Donnees.groupeQuitter();
    if (grp.moi && grp.moi.id === m.groupe_id) {
      grp.moi = null; grp.etat = []; grp.direct = []; grp.messages = []; grp.publie = null;
    }
  }
  // 177 (28/10/2026, « je n'arrive pas à quitter le groupe ») — il n'existait AUCUN bouton : `groupe_quitter` ne partait que
  // d'une séance abandonnée. « Quitter » dans la carte du groupe : en direct (le réseau, une réponse), ma séance continue
  // seule — mêmes séries, même identifiant. Un refus ou le réseau absent se dit ; jamais en silence.
  function confirmationDeDepart() {
    return { texte: 'Ta séance continue, seule : tes séries restent les tiennes.', surOui: quitterLeGroupe,
             surNon: function () { grp.quitterDemande = false; redessinerGroupe(); } };
  }
  async function quitterLeGroupe() {
    grp.quitterDemande = false;
    if (!grp.moi) return;
    try {
      await Donnees.groupeQuitter();
      grp.message = null;
    } catch (e) {
      grp.message = messageGroupe(e);   // « pas membre » : déjà parti, rien à dire
      if (grp.message) return redessinerGroupe();
    }
    grp.moi = null; grp.etat = []; grp.direct = []; grp.messages = []; grp.envoyees = []; grp.publie = null;
    grp.lu = 0;
    redessinerGroupe();
    await chargerGroupe();
  }
  // Poser un geste de fin dans la file du groupe : gardé sur l'appareil AVANT le premier essai (comme un message),
  // puis envoyé ; le réseau absent, il attend — la boucle du groupe et le retour du réseau le renvoient.
  function poserGesteDuGroupe(geste) {
    if (!grp.moi) return Promise.resolve();
    grp.file = grp.file.concat([Object.assign({ id: uuid(), groupe_id: grp.moi.id, le: new Date().toISOString() }, geste)]);
    return garderFileGroupe().then(function () { return envoyerFileGroupe(); }).catch(function (e) {
      console.warn('Le groupe attend le réseau :', texteErreur(e));
    });
  }
  // Un refus de la base (une règle du groupe), pas le réseau.
  function refusDuGroupe(e) { return !!e && /groupe_/.test(String(e.message || e.details || '')); }
  async function envoyerMessageGroupe(texte) {
    var t = Social.messageValide(texte);
    if (!t) { grp.message = 'Un message fait de 1 à 140 caractères.'; return dessinerGroupeSeance(); }
    if (!grp.moi) return;
    grp.file = grp.file.concat([{ id: uuid(), groupe_id: grp.moi.id, texte: t, le: new Date().toISOString() }]);
    grp.ecrire = false; grp.message = null;
    dessinerGroupeSeance();
    await garderFileGroupe();
    try {
      await envoyerFileGroupe();
      grp.messages = await Donnees.groupeMessages();
    } catch (e) {
      // Le réseau absent : le message attend (gardé), et partira au retour du réseau.
    }
    dessinerGroupeSeance();
  }

  // « 💬 jordan : « Dernière série ! » · 🔥 lea » — les deux derniers messages.
  function texteDesMessages() {
    var emoji = function (t) { return Social.EMOJIS_GROUPE.indexOf(t) >= 0; };
    var l = (grp.messages || []).slice(-2).map(function (m) {
      var qui = m.moi ? 'toi' : m.pseudo;
      return emoji(m.texte) ? m.texte + ' ' + qui : '💬 ' + qui + ' : « ' + m.texte + ' »';
    });
    return l.length ? l.join(' · ') : null;
  }

  function dessinerGroupeSeance() {
    var cible = $('groupe-seance');
    if (!cible || ecranCourant !== 'seance') return;
    if (!seance || enEdition() || !userId()) return Rendu.rendreGroupeSeance(cible, null);
    Rendu.rendreGroupeSeance(cible, vueDuGroupeSeance());
  }
  function vueDuGroupeSeance() {
    var v = { message: grp.message, invitations: cartesDInvitations() };
    // 106 — le groupe d'une AUTRE séance (la mienne y est finie) ne se montre pas ici : je suis libre d'en lancer un.
    if (!groupeDeLaSeance()) {
      v.surLancer = function () { ouvrirInviter(); };
      return v;
    }
    var maintenant = new Date().toISOString();
    var lignes = Social.lignesDuDirect(grp.direct, maintenant, nomDuCatalogue, Modele.formatMesure);
    var n = grp.etat.length || grp.moi.membres || 1;
    var g = {
      titre: 'Groupe · ' + n,
      muet: grp.muet, ouvert: grp.ouvert,
      surMuet: function () { grp.muet = !grp.muet; dessinerGroupeSeance(); },
      surQuitter: function () { grp.quitterDemande = true; dessinerGroupeSeance(); },
      confirmerQuitter: grp.quitterDemande ? confirmationDeDepart() : null,
      surInviter: n < Social.GROUPE_MAX ? function () { ouvrirInviter(); } : null,
      pastilles: Social.pastillesDuGroupe(grp.etat, maintenant, maDerniereSerie()),
      lignes: grp.ouvert ? lignes : lignes.slice(0, Social.LIGNES_DU_DIRECT),
      toutVoir: grp.ouvert ? { texte: 'Réduire', sur: function () { grp.ouvert = false; dessinerGroupeSeance(); } }
        : lignes.length > Social.LIGNES_DU_DIRECT ? { texte: 'Tout voir (' + lignes.length + ')', sur: function () { grp.ouvert = true; dessinerGroupeSeance(); } }
        : null,
      messages: texteDesMessages(),
      enAttente: Social.texteEnAttente(grp.file, grp.moi.id),
      rapides: Social.MESSAGES_RAPIDES.concat(Social.EMOJIS_GROUPE).map(function (t) {
        return { texte: t, sur: function () { envoyerMessageGroupe(t); } };
      }),
      max: Social.MESSAGE_MAX,
      surEcrire: function () { grp.ecrire = true; dessinerGroupeSeance(); var c = $('groupe-texte'); if (c) c.focus(); },
      ecrire: grp.ecrire ? { surEnvoyer: envoyerMessageGroupe, surAnnuler: function () { grp.ecrire = false; dessinerGroupeSeance(); } } : null
    };
    // « Suivre la séance de X » : un exercice qu'il a ajouté depuis, proposé UNE fois (« Ajouter ? »).
    var suivi = seance.groupe && seance.groupe.suivi;
    if (suivi) {
      var lui = grp.etat.filter(function (m) { return m.pseudo === suivi.pseudo; })[0];
      var nouveaux = lui ? Social.exercicesAjoutes(suivi.copie, lui.exercices, (suivi.vus || []).concat(exercicesDe(seance))) : [];
      if (nouveaux.length) {
        var slug = nouveaux[0];
        g.proposition = { texte: suivi.pseudo + ' a ajouté ' + nomDuCatalogue(slug) + ' · Ajouter ?',
          surAjouter: function () { marquerVu(slug).then(function () { return ajouterExerciceDuGroupe(slug); }); },
          surNon: function () { marquerVu(slug).then(dessinerGroupeSeance); } };
      }
    }
    v.groupe = g;
    return v;
  }
  async function marquerVu(slug) {
    if (!seance || !seance.groupe || !seance.groupe.suivi) return;
    var s = seance.groupe.suivi;
    seance = Object.assign({}, seance, { groupe: { suivi: Object.assign({}, s, { vus: (s.vus || []).concat([slug]) }) } });
    await sauverSeance();
  }
  // Ajouter un exercice à MA séance par le geste du catalogue (les séries de départ, la semaine allégée, la série de
  // plus) : la structure vient de l'autre, la charge de mon coach.
  async function ajouterExerciceDuGroupe(slug) {
    if (!seance) return;
    var avant = seance.exercices;
    seance = Seance.ajouterExercice(seance, slug, uuid, { series: seriesDeDepartPour(slug) });
    await apresGeste({ structure: false });
    await allegeePourAjout(avant, slug);
    await ligneDePlusPourAjout(avant, slug);
    publierMesExercices().catch(function () {});
  }

  // ── L'accueil : mes invitations ; le groupe qui finit ──
  function dessinerGroupeAccueil() {
    // 171 — Saisie n'a plus de bloc « Groupe » (doublon exact de l'accueil, où il reste).
    var id = ecranCourant === 'liste' ? 'groupe-accueil' : null;
    if (!id) return;
    if (!userId()) return Rendu.rendreGroupeAccueil($(id), null);
    var v = { invitations: cartesDInvitations() };
    if (grp.moi && !seance) {
      var maintenant = new Date().toISOString();
      if (Social.groupeFini(grp.etat, maintenant)) {
        v.fin = { titre: 'Le récap du groupe est prêt', sous: 'Tout ce que vous avez fait ensemble.', surVoir: ouvrirRecapGroupe };
      } else {
        var encore = Social.encoreEnSeance(grp.etat, maintenant);
        v.fin = { titre: 'Groupe · ' + (encore.length ? encore.join(', ') + (encore.length > 1 ? ' s’entraînent encore' : ' s’entraîne encore') : 'en cours'),
                  sous: 'Le récap du groupe s’ouvrira quand toutes les séances seront terminées.',
                  surQuitter: function () { grp.quitterDemande = true; redessinerGroupe(); },
                  confirmerQuitter: grp.quitterDemande ? confirmationDeDepart() : null };
      }
    }
    Rendu.rendreGroupeAccueil($(id), v.invitations.length || v.fin ? v : null);
  }

  // ── La vue du groupe (plein écran, sans route) ──
  function ouvrirVueGroupe(etat) {
    grp.vue = etat;
    if (!gardeGroupe) {
      gardeGroupe = function () { return grp.vue && ecranCourant === 'groupe' ? { raison: 'groupe', afficher: fermerVueGroupe } : null; };
      ajouterGarde(gardeGroupe);
    }
    montrer('groupe');
    dessinerVueGroupe();
  }
  function quitterVueGroupe() {
    grp.vue = null;
    if (gardeGroupe) { retirerGarde(gardeGroupe); gardeGroupe = null; }
  }
  function fermerVueGroupe() {
    var v = grp.vue;
    quitterVueGroupe();
    if (v && v.retourDetail) { allerA(Routeur.SEANCE, { id: v.retourDetail }); return rendreDetail(v.retourDetail); }
    if (seance) { allerA(Routeur.SAISIE, {}); return rendreSeance(); }
    allerA(Routeur.RACINE, {});
    rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
  }
  // 182 — ce que le récap détaillé lit de l'app : le catalogue (jamais le slug brut), le formateur des séries, la phrase de
  // la médaille, les tonnes, la durée, le jour et l'heure locaux. Aucun calcul ici.
  function outilsDuRecapDeGroupe() {
    var index = Modele.indexerExercices(local.exercices);
    // Un slug que mon catalogue ne connaît pas (l'exercice perso d'un autre) prend le nom générique de `Modele.nommer`
    // (appelé sans slug) : on ne devine pas, on n'affiche pas le slug brut.
    var nomComplet = function (slug) { return index[slug] ? index[slug].nom : Modele.nommer(index, ''); };
    return {
      nomDe: nomComplet,
      mesure: function (s) { return Modele.formatMesure(s); },
      record: function (r) {
        var nom = Modele.nomCourt(nomComplet(r.slug));
        var phrase = Modele.phraseDeRecord([r], nom, null, nomComplet);
        return { nom: nom.charAt(0).toUpperCase() + nom.slice(1), phrase: phrase ? phrase[0] : null };
      },
      tonnes: tonnesSociales, duree: Modele.formatDuree, nombre: function (n) { return Modele.nombreTexte(n, 0); },
      jour: function (iso) { return Modele.jourNomme(Routeur.versDate(new Date(iso))); }, heure: Modele.heureMinute
    };
  }
  function dessinerVueGroupe() {
    if (ecranCourant !== 'groupe' || !grp.vue) return;
    var v = grp.vue, vue = { mode: v.mode, message: v.message || null };
    if (v.mode === 'inviter') {
      // 177 — l'invitation reçue passe AVANT la création : on la voit avant d'inviter à son tour.
      vue.invitations = cartesDInvitations();
      vue.sous = seance ? (seance.titre || 'Séance') + ' · en cours' : null;
      // 121 (05 #12) — la lecture des amis a échoué (hors ligne) : la phrase seule, jamais « Chargement… » sans fin.
      if (!social.liens) vue.mode = v.message ? 'erreur' : 'charge';
      else {
        vue.amis = Social.invitablesDuGroupe(social.liens, grp.etat, grp.envoyees).map(function (a) {
          return { pseudo: a.pseudo, invite: a.invite, sous: a.invite ? 'invité · en attente' : null,
                   libelle: a.invite ? 'Annuler' : 'Inviter', sur: function () { (a.invite ? annulerInvitation : inviterAuGroupe)(a.user_id); } };
        });
      }
    } else if (v.mode === 'rejoindre') {
      var i = v.invitation;
      vue.invitant = i.invitant;
      vue.surPasMaintenant = fermerVueGroupe;
      if (seance) {
        vue.choix = [{ cle: 'en-cours', titre: 'Avec ma séance en cours', sous: (seance.titre || 'Séance') + ' · tes charges, que je te propose',
                       sur: function () { rejoindreAvec(i, null); } }];
      } else {
        vue.choix = [];
        if ((i.exercices || []).length) {
          vue.choix.push({ cle: 'suivre', titre: 'Suivre la séance de ' + i.invitant, sous: 'Mêmes exercices · tes charges, que je te propose',
                           sur: function () { rejoindreAvec(i, { suivre: true }); } });
        }
        var mesRoutines = routines.filter(function (r) { return r && !r.archivee_a; });
        vue.choix.push({ cle: 'routine', titre: 'Une de mes routines',
          sous: mesRoutines.slice(0, 3).map(function (r) { return r.nom; }).join(' · ') + (mesRoutines.length > 3 ? '…' : ''),
          sur: function () { v.routines = !v.routines; dessinerVueGroupe(); },
          routines: v.routines ? mesRoutines.map(function (r) { return { nom: r.nom, sur: function () { rejoindreAvec(i, { routine: r }); } }; }) : null });
        vue.choix.push({ cle: 'vide', titre: 'Séance vide', sur: function () { rejoindreAvec(i, {}); } });
      }
    } else if (v.mode === 'recap' || v.mode === 'fige') {
      // 121 (05 #4) — le récap n'a pas pu se lire : la phrase seule, jamais « 0 t · 0 séries · 0 records ».
      if (!v.lignes) vue.mode = v.message ? 'erreur' : 'charge';
      else {
        var r = Social.recapDuGroupe(v.lignes);
        var d = v.le ? new Date(v.le) : null;
        var jour = d && !isNaN(d.getTime()) ? Modele.jourNomme(Routeur.versDate(d)) : '';
        // 182 — le récap qui raconte la séance (chacun porte son `detail`) ; un ancien récap figé garde l'affichage d'avant.
        var detaille = Social.recapDetaille(v.lignes, outilsDuRecapDeGroupe());
        if (detaille) vue.detaille = detaille;
        vue.recap = {
          titre: 'Ensemble' + (jour ? ' · ' + jour : ''),
          qui: r.membres.map(function (m) { return m.pseudo; }).join(' · '),
          tonnes: tonnesSociales(r.tonnage_kg), series: r.series, records: r.records,
          xp: jeuAllume() && r.xp !== null ? '+' + Modele.nombreTexte(r.xp, 0) + ' XP ensemble' : null,
          membres: r.membres.map(function (m) { return { pseudo: m.pseudo, part: Social.partDe(m, tonnesSociales) }; }),
          note: v.mode === 'recap' && Social.faiteEnGroupeAvec(r.membres)
            ? 'Ta séance garde « ' + Social.faiteEnGroupeAvec(r.membres) + ' » et ce récap.' : null
        };
        vue.mode = 'recap';
        if (v.mode === 'recap') vue.surFermer = fermerRecapGroupe;
      }
    }
    Rendu.rendreGroupeVue($('groupe-corps'), vue);
  }

  // LANCER : depuis ma séance en cours ; le groupe naît à la première invitation.
  function ouvrirInviter() {
    if (!seance) return;
    ouvrirVueGroupe({ mode: 'inviter' });
    var g = grp.vue;
    Promise.all([chargerLiens(), groupeDeLaSeance() ? Donnees.groupeInvitationsEnvoyees() : Promise.resolve([])]).then(function (r) {
      grp.envoyees = r[1];
    }).catch(function (e) { g.message = messageGroupe(e); }).then(dessinerVueGroupe);
  }
  async function gesteGroupe(ecrire) {
    var v = grp.vue;
    try {
      await ecrire();
      if (v) v.message = null;
      grp.envoyees = await Donnees.groupeInvitationsEnvoyees();
    } catch (e) {
      if (v) v.message = messageGroupe(e);
    }
    dessinerVueGroupe();
  }
  function inviterAuGroupe(user) {
    gesteGroupe(async function () {
      if (!seance) return;
      if (!groupeDeLaSeance()) {
        // 106 — la base doit savoir ma séance précédente finie (elle ferme alors ma place dans son groupe) : la file
        // d'envoi part d'abord.
        await vidanger().catch(function () {});
        await Donnees.groupeCreer(seance.id, exercicesDe(seance));
        grp.publie = exercicesDe(seance).join(',');
        grp.moi = await Donnees.groupeMoi();
        grp.etat = await Donnees.groupeEtat();
      }
      await Donnees.groupeInviter(user);
    });
  }
  function annulerInvitation(user) { gesteGroupe(function () { return Donnees.groupeAnnulerInvitation(user); }); }

  // REJOINDRE : l'invitation, puis MA séance (suivre celle de X, une routine, vide — ou celle en cours).
  function ouvrirRejoindre(invitation) { ouvrirVueGroupe({ mode: 'rejoindre', invitation: invitation }); }
  // 177 — « Rejoindre » sur la carte. Une séance en cours : c'est elle qui rejoint, sans écran de choix (même identifiant,
  // les séries restent) ; la base me laisse partir de mon groupe si j'y suis seul. Sans séance : le choix de ma séance.
  async function rejoindreInvitation(invitation) {
    if (!seance) return ouvrirRejoindre(invitation);
    var v = grp.vue;
    await rejoindre(invitation);
    if (v && grp.vue === v) {
      if (grp.message) { v.message = grp.message; dessinerVueGroupe(); } else fermerVueGroupe();
    }
  }
  // 177 — « Non merci » : l'invitation s'efface. Un refus de la base se dit.
  async function refuserInvitation(invitation) {
    var v = grp.vue;
    try {
      await Donnees.groupeRefuser(invitation.groupe_id);
      grp.message = null;
      if (v) v.message = null;
    } catch (e) {
      grp.message = messageGroupe(e);
      if (v) v.message = grp.message;
    }
    grp.invitations = (grp.invitations || []).filter(function (i) { return i.groupe_id !== invitation.groupe_id; });
    grp.lu = 0;
    await chargerGroupe();
    if (v && grp.vue === v) dessinerVueGroupe();
  }
  function rejoindreAvec(invitation, depart) {
    if (!depart) return rejoindre(invitation).then(fermerVueGroupe);
    quitterVueGroupe();
    grp.aRejoindre = { invitation: invitation, suivre: !!depart.suivre };
    demarrerSeance(depart.routine || null);
  }
  // Appelé quand la séance vient d'être créée (`creerSeance`) : « Suivre la séance de X » pose SES exercices dans MA
  // séance, par le geste du catalogue, puis on rejoint.
  async function apresCreationPourLeGroupe() {
    var a = grp.aRejoindre;
    grp.aRejoindre = null;
    if (!a || !seance) return;
    if (a.suivre) {
      var copie = (a.invitation.exercices || []).slice();
      seance = Object.assign({}, seance, { groupe: { suivi: { pseudo: a.invitation.invitant, copie: copie, vus: [] } } });
      for (var k = 0; k < copie.length; k++) await ajouterExerciceDuGroupe(copie[k]);
    }
    await rejoindre(a.invitation);
  }
  async function rejoindre(invitation) {
    if (!seance) return;
    try {
      // 106 — comme pour lancer : la base apprend d'abord que ma séance précédente est finie.
      await vidanger().catch(function () {});
      await Donnees.groupeRejoindre(invitation.groupe_id, seance.id, exercicesDe(seance));
      grp.publie = exercicesDe(seance).join(',');
      grp.message = null;
    } catch (e) {
      // La séance continue, sans groupe : le refus se dit en haut de la séance.
      grp.message = messageGroupe(e);
    }
    grp.lu = 0;
    await chargerGroupe();
  }

  // LA FIN : mon XP de la séance part (nulle jeu éteint) ; mon récap d'abord, puis celui du groupe quand toutes les
  // séances sont terminées.
  function publierFinPourLeGroupe(finie, jeuDuRecap) {
    if (!groupeDeLaSeance(finie)) return;
    var xp = jeuAllume() && jeuDuRecap && jeuDuRecap.apport ? Math.max(0, Math.round(Number(jeuDuRecap.apport.xp) || 0)) : null;
    grp.recapAuto = true;
    // 136 (06 #14) — par la file du groupe : hors ligne, l'XP attend et repart (plus d'envoi unique sans retour).
    poserGesteDuGroupe({ geste: 'publier', exercices: exercicesDe(finie), xp: xp });
  }
  // Après « Fermer » de mon récap : si toutes les séances du groupe sont terminées, le récap du groupe s'ouvre.
  function apresRecapDeSeance() {
    if (!grp.moi || !grp.recapAuto) return;
    grp.lu = 0;
    chargerGroupe().then(function () {
      if (grp.moi && !seance && grp.recapAuto && ecranCourant === 'liste' && Social.groupeFini(grp.etat, new Date().toISOString())) {
        grp.recapAuto = false;
        ouvrirRecapGroupe();
      }
    });
  }
  function ouvrirRecapGroupe() {
    grp.recapAuto = false;
    ouvrirVueGroupe({ mode: 'recap' });
    var v = grp.vue;
    // 182 — le récap EN DIRECT passe par `groupe_recap_seance` (ma séance) : seul son JSON porte le `detail` de chacun
    // (v2_115) ; l'ancienne `groupe_recap` (une table) ne le porte pas. Sans place connue, elle reste le repli.
    var place = maPlace();
    (place && place.session_id ? Donnees.groupeRecapSeance(place.session_id).then(function (r) {
      if (r && r.recap && r.recap.membres) return { lignes: r.recap.membres, le: r.le || null };
      return Donnees.groupeRecap().then(function (l) { return { lignes: l, le: l.length ? l[0].le : null }; });
    }) : Donnees.groupeRecap().then(function (l) { return { lignes: l, le: l.length ? l[0].le : null }; })
    ).then(function (r) {
      v.lignes = r.lignes; v.le = r.le;
    }).catch(function (e) { v.message = messageGroupe(e, 'voir le récap du groupe'); v.lignes = null; }).then(dessinerVueGroupe);
  }
  // FERMER le récap du groupe : il se fige pour moi (lisible depuis ma séance) ; le dernier éteint le groupe.
  async function fermerRecapGroupe() {
    var v = grp.vue;
    try {
      // 136 (06 #14) — ce qui attend pour ce groupe (mon XP de fin, un message) part AVANT que je le ferme : fermé, il ne
      // le prendrait plus, et la file ci-dessous l'oublierait.
      await envoyerFileGroupe();
      await Donnees.groupeFermer();
    } catch (e) {
      if (v) { v.message = messageGroupe(e, 'fermer le récap du groupe'); dessinerVueGroupe(); }
      return;
    }
    // 106 — les messages encore gardés pour ce groupe ne partiront plus (je l'ai fermé).
    var fini = grp.moi && grp.moi.id;
    grp.file = grp.file.filter(function (m) { return m.groupe_id !== fini; });
    garderFileGroupe();
    grp.moi = null; grp.etat = []; grp.direct = []; grp.messages = []; grp.envoyees = []; grp.publie = null;
    fermerVueGroupe();
  }
  // Une séance abandonnée sort du groupe, sans récap — la séance DU groupe seulement (106 : abandonner une séance
  // suivante ne fait pas quitter le groupe d'avant).
  // 136 (06 #14) — par la file du groupe, comme l'XP : hors ligne, le départ attend et repart.
  function quitterLeGroupeSiMembre(abandonnee) {
    if (!groupeDeLaSeance(abandonnee)) return;
    poserGesteDuGroupe({ geste: 'quitter' });
  }

  // Le détail d'une séance faite en groupe : « Faite en groupe avec jordan, lea », et le récap figé.
  //
  // ⚠️ 121 (audit du 16/10/2026, 05 #12) — LA TRACE EST GARDÉE SUR L'APPAREIL (`grp.traces`, le brouillon
  // `CLE_TRACES_GROUPE`) : « La séance garde la trace « Faite en groupe avec … » » (SOCIAL §7) — hors ligne aussi. Elle
  // n'existait qu'en base : hors ligne, la ligne disparaissait du détail sans rien dire. La lecture de la base la
  // remplace dès qu'elle revient (un compte supprimé y devient « un ancien membre ») ; « Quitter » et un autre compte
  // l'effacent avec le reste du cache. C'est MON récap, lisible par moi seul (`groupe_recaps`).
  function dessinerTraceDuGroupe(cible, sessionId, r) {
    var texte = r && r.recap ? Social.faiteEnGroupeAvec(r.recap.membres) : null;
    if (!texte) return false;
    Rendu.rendreGroupeDuDetail(cible, { texte: texte, surVoir: function () {
      ouvrirVueGroupe({ mode: 'fige', retourDetail: sessionId, lignes: r.recap.membres || [], le: r.le });
    } });
    return true;
  }
  function rendreGroupeDuDetail(sessionId) {
    var cible = $('detail-groupe');
    Rendu.rendreGroupeDuDetail(cible, null);
    if (!sessionId || !userId()) return;
    var garde = grp.traces[sessionId] || null;
    if (garde) dessinerTraceDuGroupe(cible, sessionId, garde);
    Donnees.groupeRecapSeance(sessionId).then(function (r) {
      if (r && r.recap) garderTraceDuGroupe(sessionId, { recap: { membres: r.recap.membres || [] }, le: r.le || null });
      if (ecranCourant !== 'detail' || !r || !r.recap) return;
      dessinerTraceDuGroupe(cible, sessionId, r);
    }).catch(function () { /* hors ligne : la trace gardée reste (ou rien, si la séance n'a jamais été vue en groupe) */ });
  }
  function garderTraceDuGroupe(sessionId, trace) {
    var t = Object.assign({}, grp.traces);
    t[sessionId] = trace;
    var cles = Object.keys(t);
    if (cles.length > TRACES_GROUPE_MAX) cles.slice(0, cles.length - TRACES_GROUPE_MAX).forEach(function (k) { delete t[k]; });
    grp.traces = t;
    return Cache.ecrireBrouillon(CLE_TRACES_GROUPE, t).catch(function (e) {
      console.warn('La trace du groupe ne se garde pas sur l’appareil :', texteErreur(e));
    });
  }

  // ── Trouver des amis (＋) ──
  function personneDeRecherche(x, liens) {
    var suivis = {}, demandes = {}, abonnes = {};
    if (liens) {
      liens.abonnements.forEach(function (l) { suivis[l.pseudo] = true; });
      liens.demandesEnvoyees.forEach(function (l) { demandes[l.pseudo] = true; });
      liens.abonnes.forEach(function (l) { abonnes[l.pseudo] = l; });
    }
    var sous = [Social.ligneDuJeu(x.niveau, null, null), x.compte_prive ? 'compte privé' : null].filter(Boolean).join(' · ');
    var bouton = null;
    if (suivis[x.pseudo]) sous = (sous ? sous + ' · ' : '') + 'tu le suis';
    else if (demandes[x.pseudo]) sous = (sous ? sous + ' · ' : '') + 'demande envoyée';
    else {
      var lien = abonnes[x.pseudo];
      // 107 — la recherche ne rend que le pseudo : sans lien connu, l'identifiant se lira au départ du geste.
      bouton = { texte: lien ? 'Suivre en retour' : 'S’abonner', sur: function () {
        poserGesteSocial({ geste: Social.GESTES.SABONNER, autre: lien ? lien.user_id : null, pseudo: x.pseudo,
          prive: x.compte_prive !== false, niveau: x.niveau === undefined ? null : x.niveau });
      } };
    }
    return { pseudo: x.pseudo, couleur: Social.couleurDuBlason(x.pseudo), sous: sous || null, bouton: bouton,
      surProfil: function () { allerAmi(x.pseudo); } };
  }
  function rendreAmisApresGeste() { chargerLiens().catch(function () {}).then(function () { dessinerAmis(); chercherAmis(social.recherche); }); }

  function dessinerAmis() {
    if (ecranCourant !== 'amis') return;
    var liens = social.liens, G = Social.GESTES;
    var attente = ligneEnAttente(function (d) { return horsGuilde(d) && !estReaction(d); });
    // « Compte privé » part par le canal du profil (local d'abord, rejoué au retour du réseau) : il attend aussi.
    if (!attente && profilAEnvoyer) attente = Social.EN_ATTENTE.charAt(0).toUpperCase() + Social.EN_ATTENTE.slice(1);
    Rendu.rendreAmis($('social-amis'), {
      recherche: social.recherche,
      surRecherche: function (t) { social.recherche = t; chercherAmis(t); },
      message: social.messageAmis || phraseDeRefus(),
      attente: attente,
      aSuivre: (liens ? liens.aSuivreEnRetour : []).map(function (l) {
        return { pseudo: l.pseudo, couleur: Social.couleurDuBlason(l.pseudo), sous: l.pseudo + ' te suit',
          bouton: { texte: 'Suivre en retour', sur: function () {
            poserGesteSocial({ geste: G.SABONNER, autre: l.user_id, pseudo: l.pseudo, niveau: l.niveau === undefined ? null : l.niveau });
          } }, surProfil: function () { allerAmi(l.pseudo); } };
      }),
      lien: profil && profil.username ? Social.lienInvitation(racine.location.origin, profil.username) : null,
      surPartager: partagerLienInvitation,
      prive: Profil.comptePrive(profil),
      surPrive: function () { poserProfil({ compte_prive: !Profil.comptePrive(profil) }).catch(function () {}); dessinerAmis(); },
      bloques: (liens ? liens.bloques : []).map(function (l) {
        return { pseudo: l.pseudo, couleur: Social.couleurDuBlason(l.pseudo), sous: null,
          bouton: { texte: 'Débloquer', classe: 's-b2', sur: function () {
            poserGesteSocial({ geste: G.DEBLOQUER, autre: l.user_id, pseudo: l.pseudo });
          } } };
      })
    });
    refusVu();
    dessinerResultats();
  }

  // Les résultats de la recherche, tels que lus, redessinés avec les liens du moment (un geste fait hors ligne s'y
  // voit) — sans relire le réseau tant que le texte cherché n'a pas changé.
  function dessinerResultats() {
    var t = String(social.recherche || '').trim();
    if (t.length < 2) { Rendu.rendreResultatsAmis($('social-resultats'), { resultats: [] }); return; }
    var r = social.resultats;
    if (!r || r.texte !== t) { chercherAmis(t); return; }
    Rendu.rendreResultatsAmis($('social-resultats'), { resultats: r.lignes.map(function (x) { return personneDeRecherche(x, social.liens); }),
      vide: r.lignes.length ? null : 'Aucun pseudo ne commence par « ' + t + ' ».' });
  }

  var minuterieRecherche = null;
  function chercherAmis(texte) {
    if (minuterieRecherche) clearTimeout(minuterieRecherche);
    var t = String(texte || '').trim();
    var cible = $('social-resultats');
    if (t.length < 2) { Rendu.rendreResultatsAmis(cible, { resultats: [] }); return; }
    minuterieRecherche = setTimeout(async function () {
      try {
        var r = await Donnees.socialRechercher(t);
        if (social.recherche.trim() !== t) return;
        social.resultats = { texte: t, lignes: r };
        dessinerResultats();
      } catch (e) {
        Rendu.rendreResultatsAmis($('social-resultats'), { etat: 'erreur', message: erreurSociale(e, 'la recherche') });
      }
    }, 250);
  }

  function partagerLienInvitation() {
    var lien = Social.lienInvitation(racine.location.origin, profil && profil.username);
    var nav = racine.navigator;
    if (nav && nav.share) { nav.share({ title: 'TrainHub', url: lien }).catch(function () {}); return; }
    if (nav && nav.clipboard) nav.clipboard.writeText(lien).catch(function () {});
  }

  async function rendreAmis(relecture) {
    montrer('amis', Routeur.AMIS);
    ouvrirEcranSocial(relecture === true);
    social.messageAmis = null;
    dessinerAmis();
    try { await chargerLiens(); } catch (e) { social.messageAmis = erreurSociale(e, 'tes amis'); }
    dessinerAmis();
  }

  // Le nombre de réactions à SA séance : l'auteur seulement (`social_mes_reactions` ne compte que les siennes).
  async function rendreReactionsDeLaSeance(sessionId) {
    var cible = $('detail-reactions');
    Rendu.rendreReactionsAuteur(cible, 0);
    if (!sessionId || !userId()) return;
    try {
      var n = await Donnees.socialMesReactions(sessionId);
      if (ecranCourant === 'detail') Rendu.rendreReactionsAuteur(cible, n);
    } catch (e) { /* hors ligne : rien à dire */ }
  }

  // 58-1 — LE MOIS ET SES RECORDS : les séances avec leurs séries, celles d'un
  // exercice, les records d'une séance, d'un mois et le dernier record vivent
  // dans le module des faits (`faits.js`) ; l'écran les lit (`faits.*`).





  // ⚠️ PAS `bilanDe` : ce nom est celui du bilan d'un BLOC (§9.22), plus haut.
  // Deux déclarations du même nom, et la seconde efface la première — la
  // carte de fin de bloc s'était vidée (banc « cycles », 55-1).
  function bilanDuMoisDe(mois) {
    return Bilan.bilanDuMois({ mois: mois, seances: faits.seancesAvecSeries(corpus()), exercices: local.exercices });
  }

  // « Septembre », « septembre 2026 ».
  function nomDuMois(mois, avecAnnee) {
    var d = Bilan.premierJour(mois);
    if (!d) return '';
    var n = Modele.MOIS_LONGS[d.getMonth()];
    return avecAnnee ? n + ' ' + d.getFullYear() : n.charAt(0).toUpperCase() + n.slice(1);
  }

  function afficherMois(mois) {
    allerA(Routeur.MOIS, { mois: mois });
    rendreMois(mois);
  }
  function afficherRecordsDuMois(mois) {
    allerA(Routeur.RECORDS, { mois: mois });
    rendreRecordsDuMois(mois);
  }

  // 98 — LE BILAN DU MOIS EST LA STORY DU MOIS (BILANS-V1) : la route `/progression/mois/AAAA-MM` ouvre Progression,
  // et la story par-dessus ; la fermer rend Progression (et son adresse). L'ancien bilan n'est plus rendu ; ses
  // records (`faits.recordsDuMois`) et ses paris passent dans la story (`ouvrirBilan`).
  function rendreMois(moisDemande) {
    var mois = moisDemande || Bilan.moisEcoule(new Date());
    rendreProgression();
    ouvrirBilan(Bilans.periodeDuMois(mois), { surFermer: function () {
      if (Routeur.analyser(racine.location.pathname).vue === Routeur.MOIS) allerA(Routeur.PROGRESSION, {}, true);
    } });
  }

  // LES RECORDS D'UN MOIS : chacun mène à sa séance.
  function rendreRecordsDuMois(moisDemande) {
    montrer('records', Routeur.RECORDS);
    var mois = moisDemande || Bilan.moisEcoule(new Date());
    var courant = Bilan.cleMois(new Date());
    Rendu.rendreRecordsDuMois($('records-mois'), {
      titre: nomDuMois(mois, true).replace(/^./, function (c) { return c.toUpperCase(); }),
      records: faits.recordsDuMois(corpus(), mois).map(function (r) {
        return { seanceId: r.seanceId, texte: r.nom + ' ' + r.mesure,
                 date: Modele.jourMois(new Date(r.debut), new Date().getFullYear()) };
      }),
      surPrecedent: function () { afficherRecordsDuMois(Bilan.moisPrecedent(mois)); },
      surSuivant: mois < courant ? function () { afficherRecordsDuMois(Bilan.moisSuivant(mois)); } : null,
      surSeance: function (id) { afficherDetail(id); }
    });
  }

  // Les trois derniers exercices pratiqués, et combien d'exercices distincts le
  // compte a vus passer. Un seul balayage des séances récentes — inutile de
  // parcourir trois ans pour trois noms.
  //
  // La valeur affichée est la MEILLEURE SÉRIE, exactement comme sur la carte de
  // séance. Les deux surfaces disent le même chiffre pour le même exercice du
  // même jour — deux voix pour un seul chiffre est la famille de défauts que
  // l'audit v1 a cataloguée. Un exercice sans meilleure série n'affiche pas de
  // valeur : rien ne s'invente.
  function sommaireExercices(surExercice, surTous) {
    // 206 — « TES EXERCICES » : les exercices les plus faits sur 8 semaines (`faits.exercicesLesPlusFaits`), chacun avec ses
    // points des 6 derniers mois (`faits.pointsDeLExercice`, le max estimé des records) et sa mini-courbe (`THCourbe.mini`).
    // Un exercice sans point sur les 6 mois n'a pas de ligne : rien ne s'invente.
    var c = corpus(), maintenant = new Date();
    var index = Modele.indexerExercices(local.exercices);
    var lignes = [];
    faits.exercicesLesPlusFaits(c, maintenant, 8, 4).forEach(function (slug) {
      var p = faits.pointsDeLExercice(c, slug);
      var fenetre = Courbe.dansLaPeriode(p.points, '6m', maintenant);
      var r = Courbe.resume(fenetre);
      if (!r) return;
      var unite = p.mesure === 'charge' ? ' kg' : p.mesure === 'reps' ? ' reps' : ' s';
      var d = Math.round(r.debut), f = Math.round(r.fin);
      lignes.push({
        slug: slug,
        nom: (index[slug] && index[slug].nom) || slug,
        mesure: (r.n > 1 && d !== f ? Modele.nombreTexte(d) + ' \u2192 ' : '') + Modele.nombreTexte(f) + unite,
        mini: Courbe.mini(fenetre, 92, 36, p.mesure)
      });
    });
    return { legende: 'Max estimé, 6 derniers mois', lignes: lignes, surExercice: surExercice, surTous: surTous };
  }

  // ══ LA SÉANCE EN COURS ═══════════════════════════════════════════════════
  //
  // Le contrat, dans l'ordre où il compte :
  //
  //   1. tout geste écrit d'abord EN LOCAL, et rend la main ;
  //   2. l'intention d'envoi est POSÉE dans la file, sur disque ;
  //   3. la vidange tente le réseau — et son échec ne remonte jamais à l'écran
  //      de saisie, parce qu'il n'y a rien à y faire.
  //
  // Une séance perdue est le pire défaut possible. Tout ce qui suit est écrit
  // pour que ça n'arrive pas, y compris si l'app est tuée entre deux lignes.

  // Écrit la séance sur disque, ENTIÈRE, dans une transaction. Appelé après
  // chaque geste. Une séance pèse quelques kilo-octets : le coût est nul devant
  // la garantie qu'aucun état à moitié écrit ne puisse exister.
  // ⚠️ LES DEUX PORTES PAR OÙ LA SÉANCE SORT (chantier 33) : le DISQUE
  // (`sauverSeance`) et le FIL (`poserSeries`). On sème aux deux, pas à une
  // seule — tous les gestes ne passent pas par `apresGeste` : `enregistrerEdition`
  // pose et adopte sans jamais sauver de brouillon. Couvrir l'entonnoir des
  // gestes aurait donc laissé la correction d'une séance passée à découvert.
  //
  // Une série sans identifiant ne doit exister ni sur le disque ni sur le fil :
  // `sets.id` est uuid NOT NULL, et le refus du serveur bloquerait la file
  // entière (voir la garde de sortie dans `Seance.lignes`).
  //
  // Sans effet et sans recopie quand rien ne manque : le chemin normal ne paie
  // rien, et l'appel est sûr à répéter.
  function semerSeance() { seance = Seance.semerIdentifiants(seance, uuid); }

  // 134 (I-12, audit iPhone) — DEMANDER QUE LE STOCKAGE NE S'EFFACE PAS. Dans un onglet Safari, WebKit efface ce
  // qu'un site a écrit après 7 jours d'usage sans visite : une séance finie hors ligne et jamais renvoyée, le
  // brouillon. Une fois, au premier enregistrement local d'une séance, si l'API existe. La réponse ne change rien à
  // l'app et ne s'affiche pas : on ne l'attend pas.
  var persistanceDemandee = false;
  function demanderPersistance() {
    if (persistanceDemandee) return;
    persistanceDemandee = true;
    var st = racine.navigator && racine.navigator.storage;
    if (!st || typeof st.persist !== 'function') return;
    try { Promise.resolve(st.persist()).catch(function () {}); } catch (e) { /* refusé : rien à faire */ }
  }

  async function sauverSeance() {
    // 115 (E2) — ce qui s'enregistre est la séance qu'on voit : une suppression en attente part d'abord.
    if (suppressionDifferee) await solderSuppression();
    semerSeance();
    try {
      await Cache.ecrireBrouillon('seance', seance);
      demanderPersistance();
    } catch (e) {
      // Le disque local est la dernière ligne. S'il refuse, l'utilisateur doit
      // le savoir tout de suite — c'est le seul cas où la saisie doit crier.
      console.error('Séance non sauvegardée :', texteErreur(e));
      direSauvegardeImpossible();
    }
  }

  // 136 (audit du 16/10, E15 ; ECRAN-SAISIE §7 sexies : « la file ne perd rien en silence ») — LE DISQUE QUI REFUSE SE
  // DIT, une phrase et une place : celles de la séance. La séance (`sauverSeance`) et la file (`poser`, `poserPaquet`)
  // la disent toutes deux : une file qui ne s'écrit pas sur disque est une promesse d'envoi qu'un rechargement perdrait.
  // Elle ne vient qu'APRÈS le nouvel essai de `Cache` (134, I-02 : une connexion perdue se rouvre une fois) — c'est le
  // second échec, et lui seul, qui remonte ici.
  var PHRASE_SAUVEGARDE_IMPOSSIBLE = 'Sauvegarde impossible sur cet appareil. Ne ferme pas l\u2019app.';
  function direSauvegardeImpossible() {
    var cible = $('erreur-seance');
    if (cible) Rendu.message(cible, PHRASE_SAUVEGARDE_IMPOSSIBLE, 'erreur');
  }

  // Pose une intention dans la file ET l'écrit sur disque. La file EST la
  // promesse d'envoi : tant qu'une entrée y est, rien n'est perdu.
  //
  // 148 (diagnostic 146) — LA GARDE COMMUNE DES GESTES EN VOL. `synchroniser()` lit les pesées au début et les fond
  // longtemps après ; `Attente.protegees` ne garde que ce qui est ENCORE dans la file à ce moment-là. Une pesée posée
  // PUIS ENVOYÉE pendant la synchronisation n'est plus protégée : la lecture périmée la remplaçait (courbe, ligne
  // « Poids », cache) jusqu'à la synchronisation suivante — aucune perte en base. `poser` est l'unique entrée de la
  // file : elle note ici `table / id` AVANT toute écriture asynchrone (sinon la fenêtre se rouvre) ; la synchronisation
  // remet la note à zéro à son début. À l'application, la pesée se FOND avec `protegees ∪ gestesEnVol` : les pesées
  // des autres jours ou d'un autre appareil arrivent toujours. Les objectifs gardent leur garde du 139
  // (`versionObjectifs`, `gardeLesGestesEnVol`) ; elle pourrait rejoindre celle-ci plus tard.
  var gestesEnVol = {};
  function noterGesteEnVol(operation) {
    if (!operation || !operation.table || operation.id === undefined || operation.id === null) return;
    (gestesEnVol[operation.table] = gestesEnVol[operation.table] || {})[operation.id] = true;
  }
  function protegeesEtEnVol(table) {
    var res = Object.assign({}, Attente.protegees(attente, table));
    Object.keys(gestesEnVol[table] || {}).forEach(function (id) { res[id] = true; });
    return res;
  }

  async function poser(operation) {
    noterGesteEnVol(operation);
    attente = Attente.poser(attente, operation);
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File non persistée :', texteErreur(e)); direSauvegardeImpossible(); }
    rendreEtatSync();
    vidanger();   // volontairement PAS attendu : la saisie ne dépend pas du réseau
  }

  // L'état affiché combine lecture et écriture. Tant qu'il reste quelque chose
  // à envoyer, « à jour » serait faux.
  function rendreEtatSync() {
    var noeud = $('etat-sync');
    if (!noeud) return;
    // 117 (audit du 16/10, 06 #7) — la base de l'appareil est tenue par une autre page de l'app restée ouverte
    // (une ancienne version) : l'app a démarré sans elle, sur le réseau ; elle le dit, au lieu d'attendre sans fin.
    if (Cache.estBloquee && Cache.estBloquee()) {
      Rendu.rendreEtat(noeud, { code: 'bloque', libelle: 'Données de l\u2019appareil indisponibles : ferme l\u2019autre onglet de l\u2019app' });
      return;
    }
    Rendu.rendreEtat(noeud, Attente.deciderEtat(etat, attente));
  }

  // ── La vidange ──────────────────────────────────────────────────────────
  //
  // Une opération ne quitte la file QUE sur confirmation du serveur. C'est la
  // règle du chantier 15 appliquée à l'écriture : le compte AUTORISE, il ne
  // constate pas. En cas d'échec, l'entrée reste, marquée — et la file s'arrête
  // là plutôt que de sauter l'entrée suivante, dont la clé étrangère dépend
  // peut-être de celle qui vient d'échouer.
  // Le réseau revient, ou l'app revient au premier plan (134, I-13) : la file part, et le profil modifié hors ligne
  // avec elle. Sûr à répéter : une vidange en cours se relance après elle (`vidangeARelancer`).
  function renvoyerCeQuiAttend() { vidanger(); if (profilAEnvoyer) envoyerProfil(); }

  async function vidanger() {
    if (vidangeEnCours) { vidangeARelancer = true; return; }
    if (!sessionActive) return;
    vidangeEnCours = true;
    vidangeARelancer = false;
    var g = generation;
    try {
      var garde = Attente.gardeDeVidange(attente.length);   // lue au départ : une file qui ne rétrécit pas ne tourne pas sans fin, une file saine part entière (144-3)
      while (garde-- > 0) {
        var op = Attente.prochaine(fileEnvoyable(attente));
        if (!op) break;
        // ⚠️ LE CONFLIT « UNE SEULE EN COURS » SE RÉSOUT DANS L'ENVOI
        // (26/09/2026) : une autre séance encore ouverte en base est refermée
        // — la décision du chantier 36, puisque la nôtre est celle que le
        // téléphone a sous les yeux —, puis l'entrée repart AUSSITÔT, et ses
        // séries et ses paris derrière elle dans cette même boucle. Si le
        // renvoi échoue encore, l'entrée reste EN ÉCHEC, à retenter comme une
        // coupure : jamais bloquée, jamais abandonnée en silence.
        // 121 (audit du 16/10, 05 #3) — un geste social est marqué « peut-être parti » SUR LE DISQUE avant l'appel :
        // relu après un rechargement, son « déjà fait » sera un succès, pas un faux refus. `op` reste la copie d'avant
        // la marque : c'est elle que `issueSociale` lit (un PREMIER envoi n'est jamais « rejoué »).
        if (op.table === Attente.SOCIAL && !op.parti) {
          attente = Attente.marquerParti(attente, op.cle);
          await Cache.ecrireAttente(attente).catch(function () {});
          if (!generationValide(g)) return;
        }
        var echec = await Attente.envoyer(op, executer, refermerSeancesSauf);
        // « Quitter » pendant l'aller-retour : la file de ce compte est déjà
        // vidée, on n'y réécrit rien.
        if (!generationValide(g)) return;
        // §9.11 — ce que devient un envoi refusé se décide dans `attente.js`
        // (`apresEchec`). Une observation dont la série (23503) ou le pari
        // (`TH000`, 29/09/2026) n'est pas en base ATTEND : elle ne bloque
        // rien. Orpheline — sa séance n'a plus rien en file, son pari ne
        // montera jamais —, elle est ABANDONNÉE. Seul le reste arrête la
        // vidange.
        if (echec) {
          // 107 — un geste social : « déjà fait » sort comme un succès, un refus sort sans arrêter la vidange
          // (`issueSociale`, `Social.issueDuGeste`).
          var issue = Attente.apresEchec(attente, op, echec, issueSociale);
          attente = issue.file;
          await Cache.ecrireAttente(attente).catch(function () {});
          if (issue.suite === 'faite') { noterGesteSocial(op, null); continue; }
          if (issue.suite === 'refusee') {
            console.warn('Geste social refusé par la base (' + op.cle + ') :', texteErreur(echec));
            noterGesteSocial(op, echec);
            continue;
          }
          // 117 (audit du 16/10, 06 #2) — un pari, ou le journal d'une séance, refusé parce que sa séance n'existe
          // plus (abandonnée, supprimée) : il sort de la file au lieu de rester « refusé » pour toujours.
          if (issue.suite === 'caduque') {
            console.warn('Envoi retiré (' + op.cle + ') : sa séance n\u2019existe plus en base.');
            continue;
          }
          if (issue.suite === 'abandonnee') {
            console.warn(op.table === Attente.OBJECTIFS
              ? 'Objectif abandonné (' + op.cle + ') : son pari n\u2019est pas en base et n\u2019est plus dans la file.'
              : 'Observation orpheline abandonnée (' + op.cle + ') : son pari n\u2019est pas en base, ' +
                'et sa séance n\u2019a plus rien à envoyer.');
            continue;
          }
          if (issue.suite === 'attend') continue;
          // 117 (audit du 16/10, 06 #4) — refusée : marquée, dépassée par `prochaine` avec ce qui dépend d'elle ; les
          // entrées suivantes (une autre séance) partent dans cette même vidange.
          if (issue.suite === 'bloquee') {
            console.warn('Envoi refusé (' + op.cle + ') :', texteErreur(echec));
            continue;
          }
          console.warn('Envoi différé (' + op.cle + ') :', texteErreur(echec));
          break;
        }
        // Retirée APRÈS confirmation, jamais avant — et seulement si elle est
        // restée CELLE QU'ON A ENVOYÉE. Un geste survenu pendant l'aller-retour
        // a pu la remplacer par une intention plus récente : la jeter perdrait
        // cette intention sans que rien ne le dise (voir `attente.js`).
        // `|| 1` : une entrée écrite par un build antérieur n'a pas de `version`.
        // Sans ce défaut elle serait retirée sans condition — donc la perte
        // silencieuse rouvrirait, une seule fois, pour ce qui traînait dans la
        // file au moment de la mise à jour.
        // Les observations qui attendaient repartent (`apresSucces`).
        attente = Attente.apresSucces(attente, op);
        if (op.table === Attente.SETS) envoisDeSeries++;
        await Cache.ecrireAttente(attente).catch(function () {});
        if (op.table === Attente.OBSERVATIONS) await confirmerObservation(op);
        if (op.table === Attente.SOCIAL) noterGesteSocial(op, null);
      }
    } finally {
      if (generationValide(g)) {
        vidangeEnCours = false;
        rendreEtatSync();
      }
    }
    if (!generationValide(g)) return;
    // 107 — l'écran social ouvert montre ce que la vidange a fait des gestes (confirmés, ou refusés).
    rafraichirSocial().catch(function (e) { console.warn('Social :', texteErreur(e)); });
    // 58-2 — tous les lots du remplissage sont montés : le journal est rempli.
    constaterJournalRempli().catch(function () {});
    if (vidangeARelancer) { vidangeARelancer = false; vidanger(); }
  }

  // ⚠️ 58-2 — LE JOURNAL DES RECORDS ATTEND QUE SON REMPLISSAGE SOIT DÉCIDÉ.
  // Le remplissage de l'historique se décide sur « le journal du serveur est
  // vide pour ce compte » (`deciderJournal`). Une ligne écrite à « Terminer »
  // et montée AVANT cette décision — l'app ouverte hors ligne, le réseau qui
  // revient par l'événement `online`, une vidange sans synchronisation — ferait
  // dire « pas vide » au compte, et l'historique ne serait jamais rempli. Ses
  // entrées restent donc dans la file, sans rien retenir d'autre (rien ne
  // dépend d'elles), jusqu'à la décision.
  function fileEnvoyable(file) {
    if (journalDecide) return file;
    return (file || []).filter(function (e) { return e && e.table !== Attente.RECORDS; });
  }

  // Referme en base toutes les séances `en_cours` sauf celle-ci. UPDATE ciblé
  // (`Donnees.refermerSeance`) : rien n'est supprimé, elles gardent leurs
  // séries et rejoignent l'historique. Une lecture qui échoue remonte — la
  // vidange en fait un échec à retenter, pas un blocage.
  async function refermerSeancesSauf(id) {
    var ouvertes = await Donnees.seancesEnCours();
    for (var i = 0; i < (ouvertes || []).length; i++) {
      var x = ouvertes[i];
      if (!x || !x.id || x.id === id) continue;
      await Donnees.refermerSeance(x.id);
      console.warn('Séance restée ouverte en base refermée : ' + x.id);
    }
  }

  function executer(op) {
    if (op.table === Attente.SESSIONS && op.op === Attente.SUPPRIMER) {
      return Donnees.supprimerSeance(op.id);
    }
    if (op.table === Attente.SESSIONS) return Donnees.enregistrerSeance(op.donnees);
    if (op.table === Attente.SETS) return Donnees.remplacerSeries(op.id, op.donnees || [], op.connues);
    // §9.1.1 — la ligne part telle qu'elle a été posée : son identifiant la
    // rend idempotente, sa date dit quand le choix a été fait.
    if (op.table === Attente.ZONES) return Donnees.enregistrerZone(op.donnees);
    if (op.table === Attente.MODES) return Donnees.enregistrerMode(op.donnees);
    // §9.22 (53-2) — un bloc, créé ou changé de statut : `upsert` sur son id.
    if (op.table === Attente.BLOCS) return Donnees.enregistrerBloc(op.donnees);
    // §9.11 — l'insertion IGNORE les doublons (le trigger refuserait un
    // upsert rejoué), et l'observation la suit par une mise à jour étroite.
    if (op.table === Attente.PREDICTIONS) return envoyerPrediction(op);
    if (op.table === Attente.OBSERVATIONS) return Donnees.observerPrediction(op.id, op.donnees || {});
    // 58-2 — le journal des records : un AJOUT qui ignore les lignes déjà là,
    // jamais une modification (`records_immuable`).
    if (op.table === Attente.RECORDS) return Donnees.ajouterRecords(op.donnees || []);
    // 60-2a — la pesée du questionnaire : un `upsert` sur (user_id, date) qui
    // FUSIONNE. ⚠️ SANS CETTE BRANCHE, une entrée `body_weight_log` serait vidée
    // par le dernier `return` sans rien écrire — la perte silencieuse que la
    // file existe pour empêcher.
    if (op.table === Attente.PESEES) return Donnees.enregistrerPesee(op.donnees);
    // 69 — le rattachement d'un nom importé : un `upsert` sur (user_id,
    // alias_norme) qui FUSIONNE. Sans cette branche, l'entrée serait vidée par
    // le dernier `return` sans rien écrire.
    if (op.table === Attente.ALIAS) return Donnees.enregistrerAlias(op.donnees);
    // 99 (MOTEUR §9.24) — le choix fait pour une séance manquée : un `upsert` sur (user_id, semaine, routine_id).
    if (op.table === Attente.SEMAINE_CHOIX) return Donnees.enregistrerChoixDeSemaine(op.donnees);
    // 107 (SOCIAL-V1 §8) — un geste social, dans l'ordre de pose (l'état final seul, pour un geste qui en annule un autre).
    if (op.table === Attente.SOCIAL) return executerGesteSocial(op.donnees || {});

    // 109 (MOTEUR §9.25) — l'objectif d'un exercice : un `upsert` sur (user_id, exercise_slug), ou son retrait.
    if (op.table === Attente.OBJECTIFS && op.op === Attente.SUPPRIMER) return Donnees.retirerObjectif(op.id);
    if (op.table === Attente.OBJECTIFS) return Donnees.enregistrerObjectif(op.donnees);
    // §6 — l'intention porte l'ÉTAT VOULU de la routine, pas un chemin pour y
    // aller : le plan d'écritures se calcule à la vidange, contre ce que la
    // routine est devenue entre-temps. C'est de là que vient l'idempotence.
    if (op.table === Attente.ROUTINE_EXOS && op.op === Attente.PLAN) {
      return appliquerReportRoutine(op.id, op.donnees);
    }
    // ⚠️ UNE RÉPONSE DU CHANTIER 26 ENCORE EN FILE. Son intention visait UNE
    // ligne et portait des champs ; la nouvelle vise la routine et porte un
    // état. Sans cette porte, une file écrite avant la mise à jour serait
    // vidée sans rien écrire — exactement la perte silencieuse que la file
    // existe pour empêcher.
    if (op.table === Attente.ROUTINE_EXOS) return Donnees.majExercice(op.id, op.donnees);
    // ⚠️ 117 (audit du 16/10, 06 #17) — UNE TABLE INCONNUE N'EST PAS UN SUCCÈS. Ce `return` « réussissait » sans rien
    // écrire, et l'entrée sortait de la file : la perte silencieuse que les branches ci-dessus décrivent deux fois.
    // Elle est REFUSÉE (`TH001`, `Attente.CODES_SCHEMA`) : elle reste, elle se voit, elle ne retient rien d'autre, et
    // elle est retentée à l'ouverture (une version de l'app qui connaît la table l'enverra).
    return Promise.reject({ code: 'TH001', message: 'la file ne sait pas écrire la table « ' + op.table + ' »' });
  }

  // ⚠️ UNE ENTRÉE `predictions` EN `observer` EST UNE ENTRÉE D'AVANT LE
  // 27/09/2026, encore sur un appareil : le pari et son observation dans la
  // même entrée. On la rejoue telle quelle — l'insertion part sans
  // observation, la mise à jour prouve qu'elle a touché le pari. Les entrées
  // neuves séparent les deux (`Attente.OBSERVATIONS`).
  async function envoyerPrediction(op) {
    await Donnees.enregistrerPrediction(op.donnees);
    if (op.op !== Attente.OBSERVER) return true;
    var l = op.donnees || {};
    await Donnees.observerPrediction(op.id, {
      valeur_observee: l.valeur_observee === undefined ? null : l.valeur_observee,
      observee_a: l.observee_a === undefined ? null : l.observee_a,
      set_observe: l.set_observe === undefined ? null : l.set_observe
    });
    return true;
  }

  // Après chaque geste : on sauve, on pose l'état des séries, on redessine.
  // Un seul chemin, pour qu'aucun geste ne puisse oublier l'un des trois.
  async function apresGeste(options) {
    var o = options || {};
    await sauverSeance();
    if (o.structure !== false) await poserSeries();
    if (o.rendre !== false) rendreSeance();
    // §14.5 (49-U15) — un exercice ajouté en cours de séance peut ouvrir sur
    // un repli : son pari s'écrit à sa première apparition (une fois).
    if (o.structure !== false) ecrireReplis().catch(function () {});
    // 193-4 — une barre dont le test est fini range sa mesure (une fois).
    if (o.structure !== false) rangerLesMesuresDeTest().catch(function () {});
  }

  // ⚠️ 83 (12/10/2026) — L'ENVOI NE SUPPRIME QUE CE QUE CET APPAREIL CONNAÎT
  // (ECRAN-SAISIE §7 duovicies.1 bis). Deux appareils sur la même séance
  // s'effaçaient l'un l'autre : « supprimer tout ce qui n'est pas dans ma
  // liste » emportait les séries que l'autre venait de valider (prouvé au banc,
  // 82). L'entrée porte donc ses `connues` : ce que cet appareil a envoyé pour
  // la séance, plus ce qu'il en a chargé depuis la base (`connaitre`).
  //
  // 131 — `s` (facultatif) : une séance PASSÉE corrigée sans être ouverte (« Ce qui manque à tes séances »,
  // `enregistrerCorrection`). Le même envoi, la même file ; la séance ouverte (`seance`) n'est pas touchée. Sans `s`,
  // rien ne change : la séance ouverte, ses identifiants semés, la suppression différée soldée d'abord.
  function poserSeries(s) {
    var x = s || null;
    if (!x) {
      // 115 (E2) — même règle que `sauverSeance` : une suppression en attente part d'abord.
      if (suppressionDifferee) return solderSuppression().then(function () { return poserSeries(); });
      semerSeance();
      x = seance;
    }
    var lignes = Seance.lignes(x);
    var connues = connaitre(x.id, lignes.map(function (l) { return l.id; }));
    return poser({
      table: Attente.SETS, op: Attente.REMPLACER, id: x.id,
      donnees: lignes, connues: connues
    });
  }

  // Les séries que cet appareil CONNAÎT pour une séance : envoyées par lui, ou
  // chargées depuis la base (la reprise d'une séance, « Modifier » une séance
  // terminée). Un ensemble qui ne fait que grandir tant que la séance est
  // ouverte ici — une série retirée de la liste reste connue, sinon l'envoi
  // suivant ne la supprimerait plus. Tenu en mémoire et sur le disque (le
  // brouillon, `CLE_CONNUES`) : il survit au rechargement, et l'entrée de file
  // porte sa propre copie pour la vidange hors ligne. Rend la liste à jour.
  function connaitre(sessionId, ids) {
    if (!sessionId) return [];
    var deja = local.connues[sessionId] || [];
    var vus = {}, liste = [];
    deja.concat(ids || []).forEach(function (id) {
      if (id && !vus[id]) { vus[id] = true; liste.push(id); }
    });
    local.connues[sessionId] = liste;
    Cache.ecrireBrouillon(CLE_CONNUES, local.connues).catch(function (e) {
      console.warn('Séries connues non persistées :', texteErreur(e));
    });
    return liste.slice();
  }

  // La séance quitte cet appareil (terminée, abandonnée, correction
  // enregistrée) : son dernier envoi porte déjà ses connues, l'ensemble se
  // libère. Une nouvelle correction la rechargera depuis la base.
  async function oublierConnues(sessionId) {
    if (!sessionId || !local.connues[sessionId]) return;
    delete local.connues[sessionId];
    await Cache.ecrireBrouillon(CLE_CONNUES, local.connues).catch(function () {});
  }

  // 131 — `s` (facultatif) : la séance passée d'une correction faite sans l'ouvrir (`enregistrerCorrection`).
  function poserSeance(creation, s) {
    var x = s || seance;
    return poser({
      table: Attente.SESSIONS, op: Attente.UPSERT, id: x.id,
      donnees: Seance.ligneSession(x), creation: !!creation
    });
  }

  // ── Démarrer, reprendre, terminer ───────────────────────────────────────
  // §9.18 (51-1) — `raccourci` (facultatif) : `{ cible, complet, resultat }`,
  // la carte « J'ai peu de temps » acceptée. La séance démarre sur une COPIE
  // raccourcie de la routine (`Moteur.appliquerRaccourci`) ; la routine, elle,
  // ne change jamais (ECRAN-SAISIE §6.3).
  // 84 — commencer passe d'abord par la question de l'autre appareil.
  function demarrerSeance(routine, raccourci) {
    return avantDeCommencer(function () { return creerSeance(routine, raccourci); });
  }
  async function creerSeance(routine, raccourci) {
    var id = uuid();
    var depart = routine;
    var applique = null;
    if (routine && raccourci && raccourci.resultat) {
      applique = Moteur.appliquerRaccourci(routine, raccourci.resultat);
      depart = applique.routine;
      // §9.18 (51-1 ter) — UNE RÉDUCTION S'APPLIQUE UNE SEULE FOIS, SUR LA
      // ROUTINE : la semaine allégée et la série de plus lisent le nombre de
      // séries de la routine COMPLÈTE, jamais celui de la séance raccourcie —
      // le mécanisme du remplacement (`routinesHeritees`), lu par la consigne
      // quand elle se fige. Sans lui : couché 4 → 2 → 1, et une ligne remise.
      (raccourci.complet || []).forEach(function (e) {
        var cle = id + '|' + e.slug;
        if (e && e.tr > 0 && !Object.prototype.hasOwnProperty.call(routinesHeritees, cle)) routinesHeritees[cle] = e.tr;
      });
    }
    // 99 (MOTEUR §9.24) — les exercices ajoutés par la semaine qui déraille, à la fin, avec leur mention.
    var ajoutes = avecLesAjoutsDeLaSemaine(depart);
    depart = ajoutes.routine;
    seance = Seance.creer({
      id: id,
      userId: sessionActive && sessionActive.user && sessionActive.user.id,
      titre: routine ? routine.nom : null,
      routine: depart,
      idSerie: uuid
    });
    if (ajoutes.mentions.length) {
      var n0 = seance.exercices.length - ajoutes.mentions.length;
      seance = Object.assign({}, seance, { exercices: seance.exercices.map(function (x, i) {
        return i >= n0 ? Object.assign({}, x, { ajout: ajoutes.mentions[i - n0] }) : x;
      }) });
    }
    // Le souvenir du raccourci, dans le brouillon de la séance seulement (la
    // session et les séries n'ont pas de colonne pour lui) : I32 le vérifie, et
    // la question de fin n'y propose jamais de retirer un exercice raccourci.
    if (applique) {
      seance = Object.assign({}, seance, { raccourcie: {
        cible: raccourci.cible, complet: raccourci.complet,
        raccourcie: raccourci.resultat.exercices, retires: applique.retires } });
      // 188-1 — le geste s'écrit AVEC la séance (`sessions.gestes`) : les exercices retirés, par leur slug.
      var retiresSlugs = [];
      (routine.exercices || []).forEach(function (e, i) {
        var x = raccourci.resultat.exercices[i];
        if (x && x.ch + x.tr + x.deg + (x.rec || 0) === 0 && e && e.exercise_slug) retiresSlugs.push(e.exercise_slug);
      });
      seance = Seance.noterGeste(seance, { geste: 'raccourci', retires: retiresSlugs });
    }
    chrono = null;
    await sauverSeance();
    await poserSeance(true);
    allerA(Routeur.SAISIE, {}, true);
    rendreSeance();
    // §14.4 (49-U14) — une séance créée PENDANT une semaine allégée ne garde
    // que ses lignes allégées.
    await appliquerAllegee();
    // 189 — « une série de moins jusqu'à la fin de ta sèche » en cours : une ligne de moins par exercice.
    await appliquerSerieDeMoins();
    // §14.5 (49-U15) — le repli s'écrit à l'ouverture.
    await ecrireReplis();
    // §14.7 (49-U17) — une série de plus en cours : la ligne en plus.
    await appliquerSerieDePlus();
    // §14 (111) — une dégressive proposée en cours : la ligne dégressive.
    await appliquerDegressive();
    // 91 — une séance commencée pour rejoindre un groupe : « Suivre la séance de X », puis on rejoint.
    await apresCreationPourLeGroupe();
  }

  // §14.4 (49-U14) — RETIRER LES LIGNES EN TROP, une fois : à l'acceptation
  // de la carte et à la création d'une séance dans la période. Jamais au
  // rendu : une série ajoutée ensuite (« + Série ») reste. La règle est
  // `Plan.lignesARetirer` (les séries validées n'y sont jamais).
  async function appliquerAllegee() {
    if (!seance || enEdition()) return;
    var aRetirer = Plan.lignesARetirer(planActuel());
    if (!aRetirer.length) return;
    aRetirer.forEach(function (r) { seance = Seance.retirerSerie(seance, r.iExo, r.iSerie); });
    await apresGeste();
  }

  // ⚠️ RÉPARATION AU DÉMARRAGE (chantier 33). L'APPAREIL NE SE RÉPARE PAS TOUT
  // SEUL : un téléphone mis à jour porte peut-être déjà un brouillon dont des
  // séries n'ont pas d'identifiant, et une entrée de file que le serveur a
  // refusée en 23502 et que la file a donc bloquée DÉFINITIVEMENT. Le correctif
  // du contrat ne suffit pas — sans ce passage, ces séances ne remonteraient
  // JAMAIS, même après la mise à jour.
  //
  // L'ordre compte. Le MODÈLE d'abord : son entrée de file se reconstruit
  // ensuite depuis lui, donc les deux portent les MÊMES identifiants. Semer des
  // deux côtés séparément les ferait diverger — la ligne monterait sous une
  // identité, puis serait remplacée sous une autre au geste suivant.
  async function reparerIdentifiantsManquants() {
    var avant = seance;
    if (seance) {
      // `sauverSeance` sème et écrit le brouillon réparé.
      await sauverSeance();
      // Et si cette séance attendait déjà, son intention se repose depuis le
      // modèle : `poser` compresse sur la même clé, remonte la version et
      // remet `bloquee` à null — le déblocage et la réparation sont le même
      // geste, et l'intention reste un REMPLACEMENT COMPLET.
      var cle = Attente.cleDe(Attente.SETS, seance.id);
      if (seance !== avant && (attente || []).some(function (e) { return e.cle === cle; })) {
        await poserSeries();
      }
    }
    // Le reste de la file : les séances DÉJÀ TERMINÉES, dont plus aucun geste
    // ne repassera jamais. C'est le cas que le correctif du contrat n'atteint
    // pas, et c'est celui qui laisse une séance fantôme en base.
    var r = Attente.reparerIdentifiants(attente, uuid);
    if (!r.entrees) return;
    attente = r.file;
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File réparée non persistée :', texteErreur(e)); }
    console.warn('File réparée : ' + r.lignes + ' série(s) sans identifiant dans ' +
      r.entrees + ' envoi(s) — ' + 'déblocage et renvoi complet.');
  }

  // ⚠️ ET CELLES QUE LE CHANTIER 36 NE PEUT PLUS CRÉER (chantier 37).
  //
  // Même raison, même règle : borner à la saisie n'a aucun effet sur ce qui est
  // DÉJÀ sur le disque, marqué définitif. Une file posée avant le correctif porte
  // peut-être un report de déviation refusé en `23514`, ou des reps hors `int4`
  // refusées en `22003` — et elle bloquait tout ce qui suivait.
  //
  // Ça compte maintenant : l'app s'ouvre à d'autres utilisateurs, un appareil
  // qui arrive avec une file bloquée n'a aucune issue, et `/__sw-off` — la seule
  // sortie connue — efface la file d'écriture avec les données non montées.
  //
  // Le bornage est celui de `THSeance`, pas un second jeu de règles : la
  // réparation et la saisie passent par la MÊME expression par colonne.
  async function reparerFileHorsBornes() {
    var r = Attente.reparerBornes(attente, Seance.bornerLigne);
    if (!r.entrees) return;
    attente = r.file;
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File réparée non persistée :', texteErreur(e)); }
    console.warn('File réparée : ' + r.entrees + ' envoi(s) hors bornes débloqué(s)' +
      (r.lignes ? ', ' + r.lignes + ' série(s) bornée(s)' : '') + '.');
  }

  // ⚠️ ET CELLES QUE LE CONFLIT « UNE SEULE EN COURS » AVAIT BLOQUÉES (26/09).
  //
  // Même règle encore : une file écrite avant ce correctif porte peut-être une
  // séance marquée définitive sur `sessions_une_seule_en_cours`, et ses séries
  // et ses paris retenus derrière elle. On la débloque ; la vidange la renverra
  // en refermant d'abord l'autre séance.
  async function reparerFileConflitsEnCours() {
    var r = Attente.reparerConflitsEnCours(attente);
    if (!r.entrees) return;
    attente = r.file;
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File réparée non persistée :', texteErreur(e)); }
    console.warn('File réparée : ' + r.entrees + ' séance(s) en conflit « une seule en cours » débloquée(s).');
  }

  // 117 (audit du 16/10, 06 #4) — les refus « la base n'a pas encore cette colonne, cette table » (ou « cette version
  // ne connaît pas cette table ») sont retentés une fois par ouverture : la migration lancée, ils montent seuls.
  async function reparerFileSchema() {
    var r = Attente.reparerSchema(attente);
    if (!r.entrees) return;
    attente = r.file;
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File réparée non persistée :', texteErreur(e)); }
    console.warn('File : ' + r.entrees + ' envoi(s) refusé(s) faute de colonne ou de table retenté(s).');
  }

  // ══ LA SÉANCE `en_cours` RESTÉE EN BASE (chantier 36, D7) ════════════════
  //
  // `sessions_une_seule_en_cours` est un index UNIQUE sur `user_id` WHERE
  // `statut = 'en_cours'`, et il n'est PAS différable. Une séance restée ouverte
  // en base — autre appareil, réinstallation, ou un fantôme — fait donc échouer
  // la CRÉATION de la suivante en `23505` : code définitif, la file meurt, et
  // avec elle tout ce qui suit. `Donnees.seancesEnCours` avait été écrite
  // exactement pour ça, et n'était appelée que par un test.
  // (Depuis le 26/09/2026, ce `23505`-là n'est plus définitif : la vidange le
  // résout en refermant l'autre séance — voir `vidanger`. Cette fonction reste
  // la première ligne : elle évite le conflit au lieu de le réparer.)
  //
  // ── CE QU'ON EN FAIT, ET POURQUOI ──────────────────────────────────────
  //
  // Pas de brouillon local → on la REPREND. Elle peut porter des séries
  // validées ; les jeter serait la perte que tout ce projet s'interdit, et
  // `Donnees.seriesDeSeance` existe pour la rapatrier.
  //
  // Un brouillon local → on la REFERME (`statut = 'terminee'`). Les deux ne
  // peuvent pas coexister — l'index l'interdit — et c'est le brouillon local que
  // l'utilisateur a sous les yeux. Refermer ne perd RIEN : la séance distante
  // garde ses séries et rejoint l'historique.
  //
  // On ne DEMANDE pas pour une séance ABANDONNÉE : c'est presque toujours un
  // fantôme, et les deux issues sont non destructives. ⚠️ SAUF UNE SÉANCE
  // VIVANTE (84, 12/10/2026) : quelqu'un s'en sert sur un autre appareil — la
  // refermer ou la reprendre en silence effaçait sa décision (prouvé au banc,
  // 82). Elle ne se referme jamais ici, et sa reprise se demande.
  //
  // ⚠️ ET ÇA SE PASSE AU DÉMARRAGE, JAMAIS AU GESTE. « Démarrer une séance »
  // doit marcher hors ligne : y glisser une requête réseau ferait dépendre le
  // geste du réseau, ce que le contrat de la file interdit. Si la lecture
  // échoue, on ne bloque rien et on retentera au prochain démarrage.
  async function resoudreSeanceEnCoursDistante() {
    if (!sessionActive) return;
    var g = generation;
    var ouvertes;
    try { ouvertes = await Donnees.seancesEnCours(); }
    catch (e) {
      // Le réseau ne décide de rien : sans réponse, on ne touche à rien.
      console.warn('Séances en cours illisibles :', texteErreur(e));
      return;
    }
    if (!generationValide(g)) return;
    // ⚠️ TOUTES CELLES QUI NE SONT PAS LA NÔTRE, pas « la première ». L'index
    // n'en autorise qu'une à la fois, mais il a pu être créé APRÈS que
    // plusieurs se soient installées — et surtout, si la première rendue est la
    // nôtre, s'arrêter là laisserait les autres bloquer la file pour toujours.
    var etrangeres = (ouvertes || []).filter(function (x) {
      return x && x.id && !(seance && seance.id === x.id);
    });
    if (!etrangeres.length) return;

    // ⚠️ 84 (12/10/2026) — UNE SÉANCE VIVANTE D'UN AUTRE APPAREIL NE SE FERME NI
    // NE SE REPREND EN SILENCE (ECRAN-SAISIE §7 duovicies.1 ter). Vivante : sa
    // dernière série validée, ou son début, date de moins de 45 minutes
    // (`Seance.estVivante`). Les ABANDONNÉES se traitent comme avant.
    var lues = await lireActivite(etrangeres);
    if (!generationValide(g)) return;
    var abandonnees = lues.filter(function (x) { return !x.vivante; });
    var vivantes = lues.filter(function (x) { return x.vivante; });

    // Un brouillon local existe : les ABANDONNÉES ne peuvent pas coexister avec
    // lui, on les referme. Une VIVANTE reste `en_cours` : quelqu'un s'en sert.
    // Aucune n'est supprimée — elles gardent leurs séries.
    if (seance) {
      for (var i = 0; i < abandonnees.length; i++) {
        try {
          await Donnees.refermerSeance(abandonnees[i].ligne.id);
          console.warn('Séance restée ouverte en base refermée : ' + abandonnees[i].ligne.id);
        } catch (e) { console.warn('Séance distante non refermée :', texteErreur(e)); }
      }
      return;
    }

    // Aucun brouillon, et une VIVANTE : on DEMANDE (la feuille du cas 1). Les
    // abandonnées se referment ; la vivante reste telle quelle jusqu'à la
    // réponse — « Pas maintenant » ne touche à rien, la question reviendra.
    if (vivantes.length) {
      vivantes.sort(function (a, b) { return String(b.activite).localeCompare(String(a.activite)); });
      for (var k = 0; k < abandonnees.length; k++) {
        try { await Donnees.refermerSeance(abandonnees[k].ligne.id); }
        catch (e) { console.warn('Séance distante non refermée :', texteErreur(e)); }
      }
      if (!generationValide(g)) return;
      var v = vivantes[0];
      var mots = Seance.feuilleAutreAppareil(v.ligne, v.series, 'reprendre');
      Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
        titre: mots.titre, aide: mots.aide, libelle: mots.libelle, libelleAnnuler: mots.libelleAnnuler,
        surConfirmer: async function () {
          fermerVoile();
          await reprendreDistante(v.ligne, v.series, g);
          rendreSaisie();
        },
        surAnnuler: fermerVoile
      });
      ouvrirVoile($('feuille-seance'));
      return;
    }

    // Aucun brouillon, aucune vivante : on REPREND la plus récente, et on
    // referme les autres (le cas du plantage, comme avant).
    var triees = abandonnees.slice().sort(function (a, b) {
      return String(b.ligne.debut).localeCompare(String(a.ligne.debut));
    });
    for (var j = 1; j < triees.length; j++) {
      try { await Donnees.refermerSeance(triees[j].ligne.id); }
      catch (e) { console.warn('Séance distante non refermée :', texteErreur(e)); }
    }
    await reprendreDistante(triees[0].ligne, triees[0].series, g);
  }

  // La reprise d'une séance de la base sur cet appareil : ses séries (déjà
  // lues, sinon relues), CONNUES de lui (83), puis la séance locale.
  async function reprendreDistante(distante, deja, g) {
    try {
      var series = deja || await Donnees.seriesDeSeance(distante.id);
      if (!generationValide(g)) return;
      // 83 — les séries chargées depuis la base sont connues de cet appareil.
      connaitre(distante.id, (series || []).map(function (x) { return x.id; }));
      seance = Seance.reprendre(distante, Modele.construireBlocs(series, local.exercices));
      // Les tours se recalculent depuis ce qu'on vient de lire : `sessions` ne
      // les porte pas, et sans ça un superset repris repartirait au tour 0.
      seance = Seance.avancerTours(seance,
        Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
      chrono = null;
      await sauverSeance();
      // 136 (E13) — la même reprise du repos que celle de la page rechargée : depuis la dernière série validée.
      reprendreChrono();
      rendreChrono();
    } catch (e) { console.warn('Séance distante non reprise :', texteErreur(e)); }
  }

  // 84 — L'ACTIVITÉ DES SÉANCES D'UN AUTRE APPAREIL : pour chacune, ses séries
  // (`Donnees.seriesDeSeance`, qui rend `validee_a`), sa dernière activité et
  // son verdict. Des séries illisibles : VIVANTE par prudence — on ne ferme ni
  // ne reprend sans savoir, on demande.
  async function lireActivite(lignes) {
    var maintenant = new Date().toISOString();
    var sortie = [];
    for (var i = 0; i < (lignes || []).length; i++) {
      var l = lignes[i], series = null, lisible = true;
      try { series = await Donnees.seriesDeSeance(l.id); } catch (e) { lisible = false; }
      sortie.push({ ligne: l, series: series, activite: Seance.derniereActivite(l, series),
                    vivante: !lisible || Seance.estVivante(l, series, maintenant) });
    }
    return sortie;
  }

  // ⚠️ 84 — AVANT DE COMMENCER UNE SÉANCE (ECRAN-SAISIE §7 duovicies.1 ter) : une
  // séance VIVANTE d'un autre appareil se termine sur une réponse, jamais en
  // silence (la feuille du cas 2). Lecture impossible — hors ligne, ou plus de
  // `DELAI_AVANT_COMMENCER` ms — : on commence comme avant, sans question (la
  // limite assumée : l'envoi refermera l'autre, `refermerSeancesSauf`). Les
  // abandonnées : comme avant, l'envoi les referme.
  var DELAI_AVANT_COMMENCER = 1500;
  async function avantDeCommencer(commencer) {
    if (!sessionActive || (racine.navigator && racine.navigator.onLine === false)) return commencer();
    var lues;
    try {
      lues = await Promise.race([
        Donnees.seancesEnCours().then(function (ouvertes) {
          return lireActivite((ouvertes || []).filter(function (x) {
            return x && x.id && !(seance && seance.id === x.id);
          }));
        }),
        new Promise(function (_, refuser) {
          setTimeout(function () { refuser(new Error('lecture trop lente')); }, DELAI_AVANT_COMMENCER);
        })
      ]);
    } catch (e) {
      console.warn('Séances en cours illisibles avant de commencer :', texteErreur(e));
      return commencer();
    }
    var vivantes = (lues || []).filter(function (x) { return x.vivante; })
      .sort(function (a, b) { return String(b.activite).localeCompare(String(a.activite)); });
    if (!vivantes.length) return commencer();
    var v = vivantes[0];
    var mots = Seance.feuilleAutreAppareil(v.ligne, v.series, 'commencer');
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: mots.titre, aide: mots.aide, libelle: mots.libelle, libelleAnnuler: mots.libelleAnnuler,
      surConfirmer: async function () {
        fermerVoile();
        for (var i = 0; i < vivantes.length; i++) {
          try { await Donnees.refermerSeance(vivantes[i].ligne.id); }
          catch (e) { console.warn('Séance de l\u2019autre appareil non refermée :', texteErreur(e)); }
        }
        await commencer();
      },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // Une seule séance en cours à la fois. Au lancement, si un brouillon existe,
  // on le REPREND — on n'en crée pas une seconde.
  // La vérification de la séance en cours en base, lancée au démarrage.
  // Toujours résolue (jamais rejetée) : on l'attend sans jamais en dépendre.
  var verificationSeance = null;

  async function chargerSeanceLocale() {
    try {
      seance = await Cache.lireBrouillon('seance');
      attente = await Cache.lireAttente();
    } catch (e) {
      console.warn('Séance locale illisible :', texteErreur(e));
      seance = null; attente = [];
    }
    // §9.13 bis (49-U3) — les consignes figées de CETTE séance, relues avec
    // elle. Une lecture qui échoue ne coûte qu'un recalcul : on n'invente rien.
    try { consignesSauvees = await Cache.lireBrouillon(CLE_CONSIGNES); }
    catch (e) { consignesSauvees = null; }
  }

  // ══ LE JOURNAL DES RECORDS (MOTEUR §9.23, 58-2) ═══════════════════════════
  //
  // Chaque record battu s'écrit UNE fois dans la table `records`. Le journal
  // ne calcule rien : ses lignes viennent du module des faits (`journalDuJour`
  // à « Terminer » et en Édition — la fonction de la feuille « Terminer » —,
  // `journalDeLaSeance` pour l'historique), et ne partent que par la file.
  // Les écrans (médaille, « Terminer », Progression, bilan) n'en lisent rien :
  // ils calculent comme avant. Le journal est pour le jeu, qui viendra.
  //
  //   « Terminer »  → les lignes de la séance, une entrée de file (après ses séries) ;
  //   Édition       → les lignes de la séance corrigée, la même entrée, reposée en fin de file ;
  //   remplissage   → l'historique, une fois, par lots, en tranches qui rendent la main.
  var CLE_JOURNAL = 'journalRecords';           // meta : { etat: commence | pose | rempli }
  var CLE_CURSEUR_RECORDS = 'curseurRecords';   // meta : le dernier `created_at` reçu
  var journalDecide = false;   // le remplissage est-il décidé pour ce compte ?
  var remplissage = null;      // le remplissage en cours (ou le dernier), pour la mesure
  // Une tranche : au plus 10 séances, et pas plus de 25 ms au-delà de la
  // première — puis la main revient à l'écran. Un lot : 500 lignes, une requête.
  var SEANCES_PAR_TRANCHE = 10, BUDGET_TRANCHE_MS = 25, LIGNES_PAR_LOT = 500;
  var PREFIXE_LOT = 'remplissage-';

  // ⚠️ LE SEUL CHEMIN D'ÉCRITURE DU JOURNAL. Les lignes entrent dans la copie
  // locale comme la base les prendra (`ON CONFLICT DO NOTHING` : une ligne déjà
  // là reste), puis partent par la file. `id` : la séance, ou le lot ;
  // `depend` : la séance (ses séries montent avant). Reposée EN FIN DE FILE à
  // chaque fois : derrière les séries qu'elle désigne. Sans ligne, l'entrée de
  // cette séance qui attendait encore est retirée — elle porterait des records
  // que la correction vient d'effacer.
  async function poserJournal(lignes, id, depend) {
    if (!lignes || !lignes.length) {
      var avant = attente.length;
      attente = Attente.retirer(attente, Attente.cleDe(Attente.RECORDS, id));
      if (attente.length !== avant) await Cache.ecrireAttente(attente).catch(function () {});
      return;
    }
    var r = Sync.ajouterAuJournal(local.records, lignes);
    local.records = r.journal;
    if (r.ajoutees.length) await Cache.ecrireLot('records', r.ajoutees).catch(function () {});
    await poser({ table: Attente.RECORDS, op: Attente.AJOUTER, id: id, depend: depend || null,
                  donnees: lignes, alaFin: true });
  }

  // « Terminer », et l'enregistrement d'une Édition : les records de CETTE
  // séance, et d'elle seule — un record est un record à sa date, rien d'autre
  // ne se recalcule. `avant` (Édition) : ses séries telles qu'elles étaient.
  // Celles qui changent sur un champ qui fait un record perdent leurs lignes
  // ici comme en base (`sets_efface_records`), et l'ajout qui suit les réécrit.
  async function ecrireJournalDeSeance(s, avant) {
    var lignes = faits.journalDuJour(corpus(), s, s.user_id || userId());
    if (avant) {
      var effacees = Sync.seriesQuiEffacent(avant, Seance.lignes(s));
      if (effacees.length) {
        var partent = local.records.filter(function (l) { return effacees.indexOf(l.set_id) >= 0; });
        local.records = Sync.retirerDuJournal(local.records, effacees);
        if (partent.length) {
          await Cache.supprimer('records', partent.map(function (l) { return [l.set_id, l.type]; }))
            .catch(function () {});
        }
      }
    }
    await poserJournal(lignes, s.id, s.id);
  }

  // Les lignes encore dans la file (pas encore en base), par clé.
  function lignesEnFile() {
    var out = {};
    (attente || []).forEach(function (e) {
      if (!e || e.table !== Attente.RECORDS) return;
      (e.donnees || []).forEach(function (l) { out[Sync.cleJournal(l)] = l; });
    });
    return out;
  }

  // ── La synchronisation du journal ───────────────────────────────────────
  //
  // ACCESSOIRE, comme les zones : un échec garde ce qu'on a et n'emporte rien.
  // INCRÉMENTALE sur `created_at` (une ligne ne se modifie jamais). Ce qui
  // DISPARAÎT en base — une série corrigée ou supprimée sur un autre appareil —
  // ne revient pas par l'incrément : c'est le COMPTE qui le révèle. Les lignes
  // hors file doivent être exactement celles que le serveur compte ; sinon on
  // relit le journal en entier, et la file garde les siennes.
  async function synchroniserJournal(listeComplete) {
    var g = generation;
    try {
      var compte = await Donnees.compterRecords();
      var curseur = await Cache.lireMeta(CLE_CURSEUR_RECORDS);
      var nouvelles = await Donnees.recordsDepuis(curseur);
      if (!generationValide(g)) return;
      var avant = local.records;
      var journal = Sync.purgerJournal(Sync.fondreJournal(avant, nouvelles), local.series, listeComplete);
      var enFile = lignesEnFile();
      var horsFile = journal.filter(function (l) { return !enFile[Sync.cleJournal(l)]; }).length;
      var relu = false;
      if (typeof compte === 'number' && horsFile !== compte) {
        var tout = await Donnees.recordsDepuis(null);
        if (!generationValide(g)) return;
        journal = Sync.fondreJournal(Object.keys(enFile).map(function (k) { return enFile[k]; }), tout);
        relu = true;
      }
      local.records = journal;
      if (relu) {
        await Cache.remplacerTout('records', journal);
      } else {
        var restent = {};
        journal.forEach(function (l) { restent[Sync.cleJournal(l)] = true; });
        var parties = (avant || []).filter(function (l) { return !restent[Sync.cleJournal(l)]; });
        if (parties.length) await Cache.supprimer('records', parties.map(function (l) { return [l.set_id, l.type]; }));
        if (!generationValide(g)) return;
        await Cache.ecrireLot('records', nouvelles);
      }
      if (!generationValide(g)) return;
      // LE COMPTE AUTORISE le curseur, comme pour les séries.
      if (typeof compte === 'number') {
        var avance = Sync.curseurDe(journal, ['created_at']);
        if (avance) await Cache.ecrireMeta(CLE_CURSEUR_RECORDS, avance);
      }
      if (!generationValide(g)) return;
      await deciderJournal(compte);
    } catch (e) {
      console.warn('Journal des records : synchronisation impossible :', texteErreur(e));
    }
  }

  // ── Le remplissage de l'historique, une fois ────────────────────────────
  //
  // Décidé UNE fois par compte, sur le compte du serveur : vide, et des séances
  // à remplir → on remplit ; sinon le journal est réputé rempli (un autre
  // appareil l'a fait, ou il n'y a rien). Un compte illisible ne décide rien.
  // Reprise : `commence` relance tout (l'unicité absorbe les renvois) ; `pose`
  // attend que la file ait tout monté ; `rempli` ne se pose qu'alors.
  async function deciderJournal(compte) {
    var g = generation;
    var m = await Cache.lireMeta(CLE_JOURNAL).catch(function () { return null; });
    if (!generationValide(g)) return;
    if (m && m.etat === 'rempli') { journalDecide = true; return; }
    if (m && m.etat === 'pose') { journalDecide = true; vidanger(); return; }
    if (m && m.etat === 'commence') {
      journalDecide = true;
      remplirJournal().catch(function (e) { console.warn('Remplissage du journal :', texteErreur(e)); });
      return;
    }
    if (typeof compte !== 'number') return;
    if (compte > 0 || !seancesARemplir().length) {
      await Cache.ecrireMeta(CLE_JOURNAL, { etat: 'rempli', le: new Date().toISOString(), lignes: 0 });
      journalDecide = true;
      vidanger();
      return;
    }
    await Cache.ecrireMeta(CLE_JOURNAL, { etat: 'commence', le: new Date().toISOString() });
    journalDecide = true;
    remplirJournal().catch(function (e) { console.warn('Remplissage du journal :', texteErreur(e)); });
  }

  // Les séances à remplir : toutes les terminées, de la plus ancienne à la
  // plus récente.
  function seancesARemplir() {
    return faits.seancesAvecSeries(corpus()).filter(Boolean).slice()
      .sort(function (a, b) { return String(a.debut).localeCompare(String(b.debut)); });
  }

  function laisserLaMain() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // ⚠️ EN TRANCHES, ET LA MAIN REVIENT À L'ÉCRAN ENTRE DEUX. Rejouer les records
  // d'une vie prend des secondes (relevé 58-0) : d'un bloc, l'app serait figée
  // pendant tout ce temps. Chaque tranche est bornée (`SEANCES_PAR_TRANCHE`,
  // `BUDGET_TRANCHE_MS`) ; entre deux, un `setTimeout` rend la main — un geste,
  // un rendu, la vidange passent. Un lot plein part aussitôt par la file.
  async function remplirJournal() {
    if (remplissage && !remplissage.fin) return;
    var uid = userId();
    if (!uid) return;
    var c = corpus();
    var liste = seancesARemplir();
    var enAttente = Attente.seancesEnAttente(attente);
    var etatR = remplissage = { debut: Date.now(), fin: null, total: liste.length, seances: 0,
      tranches: 0, lignes: 0, lots: 0, plusLongueTranche: 0 };
    var lot = [];
    var poserLot = function (lignes) {
      etatR.lots++;
      etatR.lignes += lignes.length;
      return poserJournal(lignes, PREFIXE_LOT + etatR.lots, null);
    };
    var g = generation;
    var i = 0;
    while (i < liste.length) {
      var t0 = Date.now(), n = 0;
      var aPart = [];
      while (i < liste.length && n < SEANCES_PAR_TRANCHE && (n === 0 || Date.now() - t0 < BUDGET_TRANCHE_MS)) {
        var lignes = faits.journalDeLaSeance(c, liste[i], uid);
        // ⚠️ UNE SÉANCE QUI ATTEND ENCORE DANS LA FILE (terminée hors ligne,
        // peut-être avant cette version) : ses séries ne sont peut-être pas en
        // base. Ses lignes partent dans SON entrée, derrière elle — jamais dans
        // un lot, qu'une clé étrangère manquante bloquerait tout entier.
        if (enAttente[liste[i].id]) aPart.push({ id: liste[i].id, lignes: lignes });
        else lignes.forEach(function (l) { lot.push(l); });
        i++; n++;
      }
      etatR.tranches++;
      etatR.seances = i;
      etatR.plusLongueTranche = Math.max(etatR.plusLongueTranche, Date.now() - t0);
      for (var k = 0; k < aPart.length; k++) {
        etatR.lignes += aPart[k].lignes.length;
        if (!generationValide(g)) return;
        await poserJournal(aPart[k].lignes, aPart[k].id, aPart[k].id);
      }
      while (lot.length >= LIGNES_PAR_LOT) {
        if (!generationValide(g)) return;
        await poserLot(lot.splice(0, LIGNES_PAR_LOT));
      }
      if (i < liste.length) {
        await laisserLaMain();
        // Le compte est parti (« Quitter », « Supprimer mon compte ») : on
        // s'arrête là, sans rien écrire de plus.
        if (!generationValide(g)) return;
      }
    }
    if (!generationValide(g)) return;
    if (lot.length) await poserLot(lot);
    if (!generationValide(g)) return;
    await Cache.ecrireMeta(CLE_JOURNAL, { etat: 'pose', le: new Date().toISOString(),
      lots: etatR.lots, lignes: etatR.lignes });
    etatR.fin = Date.now();
    vidanger();
  }

  // Le journal est rempli quand tous ses lots sont montés — pas avant.
  async function constaterJournalRempli() {
    if (!sessionActive) return;
    var g = generation;
    var m = await Cache.lireMeta(CLE_JOURNAL);
    if (!generationValide(g)) return;
    if (!m || m.etat !== 'pose') return;
    var reste = (attente || []).some(function (e) {
      return e && e.table === Attente.RECORDS && String(e.id).indexOf(PREFIXE_LOT) === 0;
    });
    if (reste) return;
    await Cache.ecrireMeta(CLE_JOURNAL, Object.assign({}, m, { etat: 'rempli', rempli_le: new Date().toISOString() }));
  }

  // Ce que le banc (et un relevé sur l'appareil) lit du journal : rien d'affiché.
  function etatDuJournal() {
    return { decide: journalDecide, lignes: (local.records || []).length,
             remplissage: remplissage ? Object.assign({}, remplissage) : null };
  }

  async function terminerSeance(verdict, fin) {
    // 71 — LE BLOC « LE JEU » DU RÉCAP, calculé ICI, comme la feuille le calculait : l'état du jeu AVANT la
    // séance (elle n'est pas encore dans le cache) contre l'état avec elle. Après l'adoption, « avant »
    // la contiendrait déjà, et l'apport serait nul.
    var jeuDuRecap = jeuDeLaFeuille();
    seance = Seance.terminer(seance, fin || new Date());
    await sauverSeance();
    await poserSeries();
    await poserSeance(false);
    // 58-2 — les records de la séance, ceux que la feuille vient d'afficher :
    // dans la file, derrière la séance et ses séries.
    await ecrireJournalDeSeance(seance, null);
    // §9.11 (27/09/2026) — LE RATTRAPAGE, en filet : chaque pari dont la copie
    // locale porte une observation sur une série encore validée la renvoie,
    // derrière les séries. Idempotent ; il répare toute divergence restante
    // entre la base et l'appareil, quelle qu'en soit l'origine.
    var aRenvoyer = Seance.observationsARenvoyer(local.predictions, seance);
    for (var r = 0; r < aRenvoyer.length; r++) await poserObservation(aRenvoyer[r]);
    // §6 — le report sur la routine, seulement s'il a été demandé, et APRÈS la
    // séance : la séance ne dépend pas de lui, et l'ordre de la file le dit.
    if (majRoutineVoulue) await reporterSurRoutine(verdict);
    majRoutineVoulue = false;
    var finie = seance;
    // La séance rejoint la liste TOUT DE SUITE, sans attendre le réseau : hors
    // ligne, elle serait sinon invisible entre « terminée » et « montée ».
    adopterLocalement(finie);
    // 109 (MOTEUR §9.25) — un objectif atteint dans cette séance : son pari s'observe (les jours réellement mis),
    // derrière la séance et ses séries.
    await observerObjectifs().catch(function (err) { console.warn('Observation des objectifs :', texteErreur(err)); });
    // 87 — le niveau publié suit la séance (seulement s'il a changé).
    publierJeu(null);
    // 89 — mes scores de force aussi (seulement s'ils ont changé) ; hors ligne, ils partiront à la prochaine ouverture.
    publierScoresForce().catch(function (err) { console.warn('Les scores de force attendent le réseau :', texteErreur(err)); });
    // 90 — mes nombres de guilde aussi. 121 (05 #5) : par la file, que l'écran Guilde ait été ouvert ou non (la vidange
    // ne les écrit que si je suis membre).
    poserScoresGuilde().catch(function (err) { console.warn('Les nombres de guilde ne se posent pas :', texteErreur(err)); });
    // 91 — mon XP de la séance part au groupe (nulle jeu éteint) ; le récap du groupe viendra après le mien.
    publierFinPourLeGroupe(finie, jeuDuRecap);
    seance = null; chrono = null; arreterMinuteur();
    // La barre s'efface AVEC la séance : la laisser affichée lui ferait
    // traverser la fin, et la réserve du bas la suivrait.
    rendreChrono();
    await Cache.ecrireBrouillon('seance', null);
    await oublierConnues(finie.id);
    await oublierConsignes();
    // 71 — LE RÉCAP, UNE FOIS, JUSTE APRÈS « TERMINER » (ECRAN-SAISIE §7 septies.4 bis). Il vit en mémoire
    // seulement : ni l'abandon, ni l'Édition, ni un rechargement ne le rouvrent.
    ouvrirRecap(finie, jeuDuRecap);
  }

  // ══ LE RÉCAP DE FIN DE SÉANCE (71, ECRAN-SAISIE §7 septies.4 bis) ════════
  //
  // Plein écran, hors barre d'onglets. ⚠️ LE RENDU NE MODIFIE RIEN : il lit la séance terminée et le corpus
  // (`faits.recapDeLaSeance`) ; aucune écriture, aucune pose dans la file — les records sont partis à
  // « Terminer ». Le bloc du jeu est celui de 64B, calculé à « Terminer » (`jeuDuRecap`).
  var recap = null;          // { seance, jeu } — en mémoire, jamais sur disque
  var gardeRecap = null;
  function ouvrirRecap(finie, jeu) {
    oublierRecap();
    recap = { seance: finie, jeu: jeu || null };
    // Le retour d'Android ferme le récap, comme « Fermer » — tant qu'il est l'écran affiché. Un autre écran
    // posé par-dessus (un onglet, un rechargement) le laisse derrière : rien ne le rouvre.
    gardeRecap = function () { return recap && ecranCourant === 'recap' ? { raison: 'recap', afficher: fermerRecap } : null; };
    ajouterGarde(gardeRecap);
    rendreRecap();
  }
  function oublierRecap() {
    recap = null;
    if (gardeRecap) { retirerGarde(gardeRecap); gardeRecap = null; }
  }
  function fermerRecap() {
    oublierRecap();
    allerA(Routeur.RACINE, {});
    rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
    // 91 — puis, si toutes les séances du groupe sont terminées, le récap du groupe.
    apresRecapDeSeance();
  }
  function voirLaSeanceDuRecap() {
    var id = recap && recap.seance && recap.seance.id;
    oublierRecap();
    if (!id) return fermerRecap();
    allerA(Routeur.SEANCE, { id: id });
    rendreDetail(id);
  }
  function rendreRecap() {
    if (!recap) return;
    var r = faits.recapDeLaSeance(corpus(), recap.seance, parisDeConsigneConnus());
    montrer('recap');
    Rendu.rendreRecap($('recap-corps'), {
      recap: r,
      jeu: recap.jeu,
      surFermer: fermerRecap,
      surVoir: voirLaSeanceDuRecap
    });
  }

  // Verse la séance terminée dans le cache de lecture, pour qu'elle s'affiche
  // comme n'importe quelle autre. `Sync.remplacer` ne l'effacera pas tant
  // qu'elle est dans la file — c'est la garde de `sync.js`.
  // ⚠️ LE CACHE DE LECTURE DOIT APPRENDRE LES SUPPRESSIONS (chantier 35, D1).
  //
  // `Sync.fusionner` FUSIONNE : même identifiant → la nouveauté remplace. Rien
  // n'en sort jamais. Et `sets` se synchronise à l'INCRÉMENT, sur `created_at`
  // et `modifie_a` : une ligne effacée en base ne revient, par définition,
  // jamais dire qu'elle n'est plus là. Une série supprimée restait donc dans le
  // cache pour toujours.
  //
  // C'est la BOUCLE DE RÉSURRECTION, mesurée au banc d'écran :
  //   1. on supprime le curl, on enregistre → la base passe bien à 4 séries ;
  //   2. on recharge → l'écran relit le cache et remontre les 6 ;
  //   3. la correction suivante repose ces 6 → `remplacerSeries` les UPSERTE →
  //      la base repasse à 6.
  // Vu de l'utilisateur : « la suppression ne s'écrit pas ». Vu de la base :
  // elle s'écrivait, puis l'app la défaisait elle-même.
  //
  // La symétrie manquante : `Donnees.remplacerSeries` met la BASE à l'image de
  // la séance ; ici on met le CACHE à l'image de la même séance. Le périmètre
  // est la séance et rien qu'elle — on ne retire jamais une série d'une autre.
  function adopterLocalement(finie) {
    var ligne = Seance.ligneSession(finie);
    var restantes = Seance.lignes(finie);
    var retirees = Seance.idsRetires(local.series, finie);
    var partantes = {};
    retirees.forEach(function (id) { partantes[id] = true; });

    local.seances = Sync.fusionner(local.seances, [ligne]);
    local.series = Sync.fusionner(
      (local.series || []).filter(function (s) { return !s || !partantes[s.id]; }),
      restantes);
    rangerSeances();
    indexerParSeance();
    recalculerEtats();
    Cache.remplacerTout('seances', local.seances).catch(function () {});
    Cache.ecrireLot('series', restantes).catch(function () {});
    // Le disque APRÈS la mémoire, et seulement s'il y a quelque chose à retirer :
    // `Cache.supprimer` ouvre une transaction par lot, et une liste vide en
    // ouvrirait une pour rien.
    if (retirees.length) Cache.supprimer('series', retirees).catch(function () {});
  }

  // Abandonner SUPPRIME la séance. Sans ça, une séance `en_cours` fantôme
  // resterait en base et se rouvrirait au prochain lancement.
  // Les identifiants des séries d'une séance de la saisie (toutes, validées ou non).
  function idsSeriesDe(s) {
    var ids = [];
    ((s && s.exercices) || []).forEach(function (x) {
      ((x && x.series) || []).forEach(function (r) { if (r && r.id) ids.push(r.id); });
    });
    return ids;
  }

  async function abandonnerSeance() {
    // 115 (E2) — une suppression en attente part d'abord, comme au glissement d'avant : son observation vidée
    // reste dans la file (la séance qui part l'emporte en base de toute façon).
    await solderSuppression();
    var id = seance.id;
    // L'ordre compte : on retire d'abord les intentions d'écriture des séries,
    // sinon la vidange essaierait d'écrire des séries d'une séance supprimée.
    // 117 (audit du 16/10, 06 #2) — et TOUT ce qui dépend d'elle : ses paris, leurs observations, son journal. Un pari
    // resté seul était refusé à vie par la base (sa séance n'existe pas) : « 1 envoi refusé » pour toujours.
    attente = Attente.retirerSeance(attente, id, idsSeriesDe(seance));
    seance = null; chrono = null; arreterMinuteur();
    rendreChrono();
    await Cache.ecrireBrouillon('seance', null);
    await oublierConnues(id);
    await oublierConsignes();
    await poser({ table: Attente.SESSIONS, op: Attente.SUPPRIMER, id: id });
    // 91 — une séance abandonnée sort du groupe, sans récap.
    quitterLeGroupeSiMembre({ id: id });
    rendreSaisie();
  }

  // ── Le chronomètre (§7 ter) ─────────────────────────────────────────────
  //
  // Il part à la VALIDATION d'une série et court jusqu'à la suivante. Le temps
  // d'exécution n'entre donc pas dans la mesure — elle est juste par
  // construction, là où un écart entre deux validations contiendrait les deux.
  //
  // Il INFORME, il ne commande pas : pas d'alarme au dépassement, pas de
  // blocage, aucun décompte qui presse.
  // ⚠️ UN REPOS DÉSACTIVÉ N'ARME RIEN (§7 sexdecies.3, défaut du §7 novodecies).
  //
  // La décision est dans `Seance.cibleArmable`, pas dans une condition écrite
  // ici : au point d'appel, elle ne se teste qu'en pilotant tout l'écran, et
  // c'est exactement pour ça que le défaut a vécu — le test du chantier 44
  // annonçait l'armement dans son nom et ne vérifiait que le stockage.
  //
  // ⚠️ ET VALIDER ARRÊTE TOUJOURS LE REPOS PRÉCÉDENT. Sans cible, on ne laisse
  // pas courir celui d'avant : commencer une série met fin au repos, qu'il y
  // ait quelque chose à compter ensuite ou non.
  // ⚠️ IL RETIENT QUI L'A ARMÉ (§7 quatervicies.2). Sans ça, régler le repos de
  // l'exercice B retargerait le décompte lancé par A — pire que le trou qu'on
  // bouche. L'identité est le COUPLE (indice, slug), et pas l'un des deux :
  // la séance n'a pas d'identifiant par exercice, l'indice bouge à la
  // réorganisation, et le slug ne distingue pas deux fois le même exercice.
  // Les deux ensemble échouent FERMÉ : dès qu'ils divergent, on ne retarge rien.
  function demarrerChrono(cible, iExo, slug, iSerie) {
    var c = Seance.cibleArmable(cible);
    // C'est `rendreChrono` qui décide si le minuteur tourne — ici on repart
    // juste de zéro. Deux endroits qui lancent des `setInterval` finissent
    // toujours par en laisser un derrière.
    arreterMinuteur();
    chrono = c === null ? null
      : { depuis: Date.now(), cible: c, sonne: false, exo: { i: iExo, slug: slug },
          // MOTEUR §17.2 bis (78) — la question de réserve de CE repos, décidée à l'armement : le plan la porte sur
          // cette série, et son effort n'est pas déjà noté. Elle part avec le repos (la fin, ou la série suivante).
          question: questionDuRepos(iExo, iSerie) };
    // Le contexte audio doit NAÎTRE dans le geste utilisateur : une politique
    // d'autoplay refuse un contexte créé une minute plus tard, dans un
    // `setInterval`. On le réveille donc à la validation, pas à l'échéance —
    // et seulement s'il y a une échéance à annoncer.
    if (chrono) reveillerAudio();
    rendreChrono();
  }

  // 136 (audit du 16/10, E13 ; audit iPhone I-06) — À LA REPRISE D'UNE SÉANCE EN COURS (la page rechargée, l'app
  // rouverte après qu'iOS l'a fermée), le repos se RÉARME depuis `validee_a` de la dernière série validée et la cible
  // du plan (`Seance.reposAReprendre`) : `depuis` est cet instant, donc le décompte affiché est le même calcul que
  // pendant le repos — jamais un compteur repris de zéro. Un repos déjà échu ne revient pas. La question de réserve
  // (MOTEUR §17.2 bis) revient avec lui si elle était due (`questionDuRepos`, la règle de l'armement). Le son de
  // l'échéance dépend ici de la plateforme : le contexte audio ne naît que d'un geste, et une reprise n'en est pas un.
  function reprendreChrono() {
    var r = Seance.reposAReprendre(seance, function (iExo, iSerie) {
      var exo = seance.exercices[iExo];
      return Plan.reposApres(planDeLExercice(iExo), iSerie, exo && exo.repos_cible_s);
    }, Date.now());
    if (!r) return;
    var exo = seance.exercices[r.iExo];
    chrono = { depuis: r.depuis, cible: r.cible, sonne: false, exo: { i: r.iExo, slug: exo.exercise_slug },
               question: questionDuRepos(r.iExo, r.iSerie) };
  }

  // MOTEUR §17.2 bis (78) — « Il t'en restait combien ? ». L'écran ne décide rien : le plan dit sur quelle série
  // (`x.serieReserve`), l'écran vérifie seulement que c'est celle qu'on vient de valider et que son effort n'est
  // pas déjà noté (une série notée par la feuille d'effort ne se redemande pas).
  function questionDuRepos(iExo, iSerie) {
    var x = planDeLExercice(iExo);
    // 187 — le calage pose la même question après chaque série (sauf la dernière), sans pari : le plan dit sur quelle série.
    var duCalage = !!(x && x.calage && x.calage.question === iSerie);
    if (!x || (!duCalage && (!x.questionReserve || x.serieReserve !== iSerie))) return null;
    var s = seance && seance.exercices[iExo] && seance.exercices[iExo].series[iSerie];
    if (!s || !Seance.partEnBase(s)) return null;
    if ((s.rpe !== null && s.rpe !== undefined) || s.ressenti) return null;
    return { iExo: iExo, iSerie: iSerie, id: s.id };
  }

  // 187 (A4) — les zones à ménager que charge chaque exercice de la séance : `{ slug: { zones, choisie } }`. `choisie` : la zone
  // que la PERSONNE a posée (le moteur ne la remplace jamais). Lu sur le profil et la table du générateur.
  function zonesMenageesDeLaSeance(exos) {
    var sortie = {};
    (exos || []).forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (!slug || Object.prototype.hasOwnProperty.call(sortie, slug)) return;
      var zones = Generateur.zonesQueChargeLExercice(slug, profil && profil.zones_a_menager);
      if (zones.length) sortie[slug] = { zones: zones, choisie: zoneDe(slug) || null };
    });
    return Object.keys(sortie).length ? sortie : null;
  }

  // 187 (MOTEUR §9.21) — « Ta charge habituelle ? » : ce que l'écran en lit sur le plan, et les deux gestes.
  function habituelleDe(iExo) {
    var x = planDeLExercice(iExo);
    var k = x && x.calage;
    if (!k || !k.demandeHabituelle || !k.libelles) return null;
    return {
      question: k.libelles.question, pour: k.libelles.pour, passer: k.libelles.passer,
      surValider: async function (texte) {
        var v = Modele.lireNombre(texte);
        if (v === null || !(v > 0) || v > 600) return false;
        seance = Seance.poserHabituelle(seance, x.slug, v);
        await apresGeste({ structure: false });
        return true;
      },
      surPasser: async function () {
        seance = Seance.poserHabituelle(seance, x.slug, 0);
        // « Je ne sais pas » : 2 approches de 5 en montant, des CHAUFFES (mécanisme du chantier 49) — aucune série de travail
        // prise, aucune retirée. Si l'exercice a déjà ses chauffes, on n'en ajoute pas.
        var deja = seance.exercices[iExo].series.some(function (sr) { return Seance.typeDe(sr) === 'echauffement'; });
        if (!deja) seance = Seance.insererChauffes(seance, iExo, [[null, 5], [null, 5]], uuid);
        await apresGeste({ structure: true });
      }
    };
  }

  // 154 (MOTEUR §9.26) — LES PUCES DE L'EFFORT VISÉ. Le plan dit sur quelle série (`x.effortVise.serie`), si elles se
  // posent (`demande`) et la phrase d'après ; l'écran n'ajoute que « Passer », qui ne se retient que pour la session
  // et n'écrit RIEN (jamais une réserve présumée).
  var effortPasse = {};
  function effortViseSurLigne(iExo, iSerie) {
    var x = planDeLExercice(iExo);
    var e = x && x.effortVise;
    if (!e || e.serie !== iSerie) return null;
    var s = seance && seance.exercices[iExo] && seance.exercices[iExo].series[iSerie];
    if (!s || !Seance.partEnBase(s)) return null;
    var demande = e.demande && !effortPasse[s.id];
    if (!demande && !e.phrase) return null;
    return {
      cle: s.id, demande: demande, phrase: e.phrase,
      surChoix: function (ressenti) { noterEffort(iExo, iSerie, { ressenti: ressenti }); },
      surPasser: async function () { effortPasse[s.id] = true; await apresGeste(); rendreChrono(); }
    };
  }

  // Ce que la carte de repos montre de la question : la série telle qu'elle est À CET INSTANT (le bouton choisi
  // s'allume, on peut changer d'avis). Une série retirée ou déplacée entre-temps : plus de question.
  function vueDeLaQuestion(q) {
    if (!q || !seance) return null;
    var exo = seance.exercices[q.iExo];
    var s = exo && exo.series[q.iSerie];
    if (!s || s.id !== q.id || !Seance.partEnBase(s)) return null;
    return {
      cle: q.id,
      serie: Modele.serieFaite(s.charge_kg, s.reps),
      choisi: s.ressenti || null,
      surChoix: function (ressenti) { noterEffort(q.iExo, q.iSerie, { ressenti: ressenti }); }
    };
  }

  function arreterMinuteur() {
    if (minuteur) { racine.clearInterval(minuteur); minuteur = null; }
  }

  // ⚠️ UNE SEULE RÈGLE DÉCIDE SI LE MINUTEUR TOURNE, ET ELLE VIT DANS
  // `rendreChrono` : il tourne tant qu'il reste quelque chose à compter.
  //
  // Sans ce point de reprise, le +15 qui repousse une cible déjà franchie
  // n'aurait relancé personne : le chronomètre serait resté figé pour toujours,
  // et le repos suivant n'aurait plus jamais avancé. C'est le coût habituel
  // d'un arrêt — il faut aussi savoir repartir.
  function assurerMinuteur() {
    if (!minuteur) minuteur = racine.setInterval(rendreChrono, 1000);
  }

  function secondesDeRepos() {
    return Math.max(0, Math.round((Date.now() - chrono.depuis) / 1000));
  }

  // ══ LA DURÉE DE LA BARRE DE SÉANCE (62, ECRAN-SAISIE §7 octies bis) ═════════
  //
  // ⚠️ UN SEUL RÉVEIL, ET IL N'EST PAS UN `setInterval`. Le chronomètre de repos a
  // le sien (`minuteur`, une seconde, seulement tant qu'il y a un repos) et sa règle
  // écrite : « deux endroits qui lancent des `setInterval` finissent toujours par en
  // laisser un derrière ». La durée à la minute n'en ajoute donc pas un second : un
  // `setTimeout` posé exactement sur le prochain changement du texte, qui se rearme
  // lui-même — donc qui ne peut pas tourner à vide quand plus rien ne l'arme.
  //
  //   · ARMÉ par `rendreSeance` (et par le retour d'arrière-plan), jamais ailleurs ;
  //   · COUPÉ par `montrer` dès qu'un autre écran s'affiche (Terminer, Annuler, un
  //     onglet, la déconnexion y passent tous), et par sa propre garde si la séance
  //     n'existe plus ou se corrige (`enEdition` : pas de durée écoulée à montrer) ;
  //   · il RÉÉCRIT LE TEXTE DU NŒUD (`Rendu.majDureeBandeau`), il ne rappelle jamais
  //     `rendreSeance` : celle-ci reconstruirait les blocs, ferait perdre le focus d'un
  //     champ en cours de saisie et rejouerait les mesures.
  //   · et la durée se RECALCULE depuis `seance.debut` à chaque réveil, jamais par un
  //     compteur : une app endormie deux minutes affiche le bon chiffre au réveil.
  function arreterDuree() {
    if (dureeTimer !== null) { racine.clearTimeout(dureeTimer); dureeTimer = null; }
  }

  function rafraichirDuree() {
    if (!seance || enEdition()) return;
    Rendu.majDureeBandeau($('bandeau-seance'), seance.debut, Date.now());
  }

  function armerDuree() {
    arreterDuree();
    if (!seance || enEdition()) return;
    dureeTimer = racine.setTimeout(function () {
      dureeTimer = null;
      if (!seance || enEdition() || ecranCourant !== 'seance') return;
      rafraichirDuree();
      armerDuree();
    }, Seance.delaiProchaineMinute(seance.debut, Date.now()));
  }

  // ══ RIEN D'INTERACTIF NE DOIT RESTER SOUS UNE BARRE FIXE ════════════════
  //
  // Constaté sur device au chantier 24 : la barre de repos RECOUVRAIT
  // « + Série » et « Ajouter un exercice ». On ne pouvait plus rien ajouter
  // pendant un repos — c'est-à-dire pendant les deux minutes où l'on a
  // justement le temps de le faire. Le chronomètre INFORME, il ne commande
  // pas (§7 ter.3) : masquer une commande, c'est commander.
  //
  // Deux hauteurs étaient écrites en dur et toutes deux fausses :
  //   · `.tel` réservait 88 px, alors que la barre d'onglets fait ~68 px PLUS
  //     l'encoche du bas, et que la barre de repos en ajoute ~65 de plus ;
  //   · `.repos` se posait à `bottom: 56px`, donc PAR-DESSUS les 12 px hauts
  //     de la barre d'onglets — qu'elle masquait aussi, z-index 50 contre 10.
  //
  // On MESURE les deux barres et on réserve exactement ce qu'elles occupent.
  // Une hauteur mesurée suit tout : l'encoche, le repli des commandes à 360 px,
  // une barre qu'on rendrait plus haute demain.
  var barresMesurees = { onglets: null, repos: null, pied: null, toast: null, seance: null };

  function mesurerBarres() {
    var style = doc.documentElement.style;
    var onglets = doc.querySelector('.onglets');
    var repos = $('repos');
    var pied = $('pied-reorg');
    // Une barre cachée — par elle-même ou par sa vue — rend un rectangle nul :
    // c'est le bon zéro, il n'y a rien à réserver pour ce qu'on ne voit pas.
    var hOnglets = onglets ? Math.ceil(onglets.getBoundingClientRect().height) : 0;
    // ⚠️ LES DEUX S'EMPILENT, ILS NE SE REMPLACENT PAS (corrigé le 18/09).
    // Le premier jet posait « les deux ne coexistent jamais — on ne range pas
    // pendant un repos » : c'est faux. Valider une série arme le chronomètre,
    // et remettre de l'ordre juste après est le geste le plus normal du monde.
    // Les deux barres étaient alors au même `bottom`, superposées au pixel près.
    //
    // La réserve du bas vaut donc leur SOMME, et le pied se pose au-dessus du
    // repos (`bottom: calc(--h-onglets + --h-repos)`, styles.css). La leçon est
    // celle du §7 sexies : ce qui est `position: fixed` n'ajoute aucune course
    // de défilement — ce qu'il couvre est perdu si la réserve ne le compte pas.
    var hRepos = (repos && !repos.hidden) ? Math.ceil(repos.getBoundingClientRect().height) : 0;
    var hPied = (pied && !pied.hidden) ? Math.ceil(pied.getBoundingClientRect().height) : 0;
    // 115 (E2) — le toast « Série supprimée · Annuler » est fixe lui aussi, au-dessus du repos et du pied : la
    // réserve le compte, rien d'interactif ne reste dessous (§3 bis.9).
    var toast = $('toast-seance');
    var hToast = (toast && !toast.hidden) ? Math.ceil(toast.getBoundingClientRect().height) : 0;
    // 62 — la barre de séance, collée EN HAUT. Elle ne couvre rien tant qu'elle est
    // dans le flux, mais un champ qui prend le focus ou un bloc amené en vue peut
    // glisser SOUS elle : `scroll-padding-top` (styles.css) se règle sur cette hauteur.
    // Cachée avec sa vue, elle rend un rectangle nul — le bon zéro.
    var barreS = $('bandeau-seance');
    var hBarreS = barreS ? Math.ceil(barreS.getBoundingClientRect().height) : 0;
    // On n'écrit QUE ce qui change. `rendreChrono` passe ici chaque seconde ;
    // réécrire la même valeur salirait le style pour rien, et une mesure suivie
    // d'une écriture qui change la mise en page est le début d'une boucle.
    if (hOnglets && hOnglets !== barresMesurees.onglets) {
      barresMesurees.onglets = hOnglets;
      style.setProperty('--h-onglets', hOnglets + 'px');
    }
    if (hRepos !== barresMesurees.repos) {
      barresMesurees.repos = hRepos;
      style.setProperty('--h-repos', hRepos + 'px');
    }
    if (hPied !== barresMesurees.pied) {
      barresMesurees.pied = hPied;
      style.setProperty('--h-pied', hPied + 'px');
    }
    if (hToast !== barresMesurees.toast) {
      barresMesurees.toast = hToast;
      style.setProperty('--h-toast', hToast + 'px');
    }
    if (hBarreS !== barresMesurees.seance) {
      barresMesurees.seance = hBarreS;
      style.setProperty('--h-barre-seance', hBarreS + 'px');
    }
  }

  // ══ LA RÈGLE DU REPOS FINI VIT ICI, ET NULLE PART AILLEURS (§7 quinvicies) ═
  //
  // ⚠️ DÉFAUT CONSTATÉ SUR DEVICE : « −15 » jusqu'à zéro faisait disparaître la
  // barre, mais un décompte qui arrivait à zéro TOUT SEUL la laissait figée.
  // L'extinction était branchée sur le GESTE, dans `ajusterRepos`, et pas sur
  // l'ÉTAT — deux chemins vers le même zéro, un seul l'éteignait.
  //
  // Elle est donc remontée ICI, au SEUL endroit qui voit l'état à chaque
  // seconde. `appliquerCible` n'en sait plus rien : elle pose la cible et
  // redessine, et c'est ce passage-ci qui conclut. Un « −15 » n'est plus qu'un
  // moyen d'arriver à zéro plus vite.
  function rendreChrono() {
    var noeud = $('repos');
    if (!noeud) return;
    if (!chrono) { noeud.hidden = true; mesurerBarres(); return; }
    var secondes = secondesDeRepos();
    // UNE SEULE FOIS : `echeanceAtteinte` retourne faux dès que `sonne` est
    // posé, et rien ne le repose tant que la cible n'est pas repoussée.
    //
    // ⚠️ AVANT L'EXTINCTION, ET C'EST L'ORDRE QUI COMPTE : le repos qui se
    // termine s'ANNONCE, puis la barre s'en va. Éteindre d'abord avalerait le
    // bip du dernier passage — celui, justement, qui dit que c'est fini. Une
    // cible tombée à zéro par un « −15 » ne sonne pas, elle : `echeanceAtteinte`
    // répond faux sous une cible nulle, et quelqu'un qui coupe son repos n'a pas
    // besoin qu'on le lui annonce.
    if (Seance.echeanceAtteinte(chrono.cible, secondes, chrono.sonne)) {
      chrono.sonne = true;
      signalerEcheance();
    }
    // ⚠️ LA RÈGLE, ET ELLE EST SEULE. `eteindreChrono` rappelle cette fonction :
    // la récursion est bornée à UN niveau, parce que `chrono` y devient nul et
    // que le passage suivant sort sur la garde du dessus.
    if (Seance.reposTermine(chrono.cible, secondes)) { eteindreChrono(); return; }
    noeud.hidden = false;
    // Tant qu'il reste quelque chose à décompter, le minuteur tourne. Il n'y a
    // plus de troisième état à gérer : une barre affichée est une barre qui
    // compte, et une barre qui ne compte plus n'est plus affichée.
    assurerMinuteur();
    Rendu.rendreRepos(noeud, {
      // ⚠️ CE QU'ON PASSE AU RENDU EST LE TEMPS QUI RESTE (§7 quatervicies), pas
      // le temps écoulé. `secondes` reste la mesure interne — elle sert à
      // `echeanceAtteinte` et à `reposTermine` juste au-dessus — et ne sort plus
      // d'ici : l'écran ne montre que le décompte.
      //
      // Et `repos_s`, lui, se mesure à la validation suivante depuis l'écart
      // entre deux `validee_a` : il porte le repos RÉEL, même s'il a duré trois
      // fois la cible. La barre s'en va, l'observation continue.
      restant: Seance.secondesRestantes(chrono.cible, secondes),
      cible: chrono.cible,
      sourdine: sourdine,
      pas: Seance.PAS_REPOS,
      surAjuster: function (delta) { ajusterRepos(delta); },
      surSourdine: function () { basculerSourdine(); },
      surPasser: function () { eteindreChrono(); },
      question: vueDeLaQuestion(chrono.question)
    });
    // APRÈS le rendu : la barre vient de prendre sa hauteur définitive.
    mesurerBarres();
  }

  // Une cible mal réglée est le cas courant : on la corrige par pas de 15 s,
  // en séance, sans rien enregistrer — le réglage vaut pour le repos en cours,
  // pas pour la routine.
  //
  // Repousser la cible au-delà du temps écoulé RÉARME l'échéance : c'est une
  // nouvelle échéance, posée à la main, pas une répétition de la précédente.
  // Le réglage vaut pour le REPOS EN COURS, jamais pour la routine — le repos
  // cible d'un exercice se change sous son nom (§7 septies.2), et la routine ne
  // bouge qu'à la fin, sur question (§6).
  function ajusterRepos(delta) {
    if (!chrono) return;
    // ⚠️ UN « −15 » N'EST QU'UN MOYEN D'ARRIVER À ZÉRO PLUS VITE (§7 quinvicies).
    //
    // Cette fonction portait la conclusion — « si la cible tombe à zéro, éteins »
    // — et c'est précisément pour ça que le décompte qui arrivait à zéro TOUT
    // SEUL restait affiché : personne ne concluait sur ce chemin-là. Elle ne
    // fait donc plus que de l'arithmétique bornée, et `rendreChrono` conclut.
    //
    // Ce qui ne change pas : le réglage vaut pour le REPOS EN COURS, jamais pour
    // la routine — le repos cible d'un exercice se change sous son nom
    // (§7 septies.2), et la routine ne bouge qu'à la fin, sur question (§6).
    appliquerCible(Seance.ajusterCible(chrono.cible, delta));
  }

  // La règle est ICI, et elle est UNE (§7 quatervicies.2) : deux gestes changent
  // la cible d'un repos qui court — les « −15/+15 » de la barre et la molette
  // sous le nom de l'exercice — et ils doivent en tirer les MÊMES conséquences.
  // Deux copies de ces quatre lignes, c'est la garantie qu'un chantier futur en
  // corrigera une sur deux ; c'est la maladie que ce dépôt passe son temps à
  // soigner.
  function appliquerCible(cible) {
    if (!chrono) return;
    chrono.cible = cible;
    // Une cible repoussée AU-DELÀ de l'écoulé réarme l'échéance : c'est une
    // échéance neuve, posée à la main, pas une répétition de la précédente.
    if (chrono.cible > secondesDeRepos()) chrono.sonne = false;
    // ⚠️ ELLE NE DÉCIDE PLUS DE L'EXTINCTION (ch. 51). Elle posait ici son
    // propre `if (reposEcoule(cible)) eteindreChrono()`, et c'était la moitié
    // du défaut : la même conclusion vivait à deux endroits, et seul celui-ci
    // était atteint par un geste. `rendreChrono` conclut désormais pour tout le
    // monde — y compris pour la cible à zéro qu'on vient peut-être de poser.
    rendreChrono();
  }

  // ══ LA MOLETTE RETARGE LE DÉCOMPTE EN COURS (§7 quatervicies.2) ═════════
  //
  // Constaté sur device : régler le repos d'un exercice pendant qu'on se repose
  // ne changeait RIEN à la barre. Le chronomètre avait copié sa cible à
  // l'armement, et plus personne ne la relisait — `repos_cible_s` n'était lu que
  // par `demarrerChrono`, à la validation SUIVANTE.
  //
  // ⚠️ LE §7 TERVICIES N'EST PAS CONTREDIT, IL EST ORIENTÉ. Il sépare deux objets
  // pour empêcher un « −15 » de désactiver une CONSIGNE ; il ne dit pas qu'un
  // geste doit rester sans effet. Le fil ne va donc que dans un sens :
  //
  //     −15 / +15 sur la barre  →  le décompte seul. La consigne ne bouge pas.
  //     molette sous l'exercice  →  la consigne ET le décompte, s'il est à lui.
  //
  // Et désactiver le repos pendant qu'il court, c'est dire « pas de repos ici » :
  // `appliquerCible(0)` éteint, exactement comme le −15 arrivé à zéro.
  function chronoDeCetExo(iExo) {
    if (!chrono || !chrono.exo) return false;
    var exo = seance && seance.exercices ? seance.exercices[iExo] : null;
    if (!exo) return false;
    return chrono.exo.i === iExo && chrono.exo.slug === exo.exercise_slug;
  }

  function retargeterChrono(iExo, cible) {
    if (!chronoDeCetExo(iExo)) return;
    // `cible` est relue depuis la séance APRÈS écriture : elle a donc déjà passé
    // les bornes de `definirReposCible`, ou elle vaut ce qu'elle valait si la
    // valeur a été refusée. `null` — repos désactivé — devient zéro, donc une
    // extinction.
    //
    // ⚠️ LE `|| 0` EST REDONDANT AUJOURD'HUI, ET IL RESTE EXPRÈS. Sa mutation
    // survit : `reposTermine` répond déjà « fini » sur `NaN` comme sur zéro
    // (via `secondesRestantes`, qui normalise), donc `Number(cible)` seul
    // éteindrait pareil. Ce n'est vrai QUE grâce à ce contrat, qui est épinglé
    // par un test (`v2-statut-seance`, §8) : le jour où il changerait, cette
    // normalisation serait la seule chose empêchant `chrono.cible = NaN` — une
    // barre qui ne finit jamais, le troisième état que le §7 novodecies interdit.
    appliquerCible(Number(cible) || 0);
  }

  // Le repos n'existe plus : ni objet, ni minuteur, ni barre. Les trois vont
  // ENSEMBLE — oublier `arreterMinuteur` laisse un `setInterval` qui rend un
  // chronomètre absent une fois par seconde, pour toujours.
  function eteindreChrono() {
    chrono = null;
    arreterMinuteur();
    rendreChrono();
  }

  function basculerSourdine() {
    sourdine = !sourdine;
    try { racine.localStorage.setItem('th-v2-sourdine', sourdine ? '1' : '0'); }
    catch (e) { /* stockage refusé : le choix vaut pour la session, pas au-delà */ }
    rendreChrono();
  }

  function lireSourdine() {
    try { sourdine = racine.localStorage.getItem('th-v2-sourdine') === '1'; }
    catch (e) { sourdine = false; }
  }

  // À l'échéance : un son court et unique, et une vibration unique (§3 bis.8).
  //
  // La SOURDINE coupe le son, pas la vibration. C'est délibéré : on met son
  // téléphone en silencieux dans une salle, on ne renonce pas pour autant à
  // savoir que le repos est fini. Couper les deux reviendrait à retirer le
  // chronomètre.
  //
  // ⚠️ LA VIBRATION D'ÉCHÉANCE — CE QUI EST MESURÉ, ET CE QUI NE L'EST PAS.
  //
  // Signalé sur device, écran ALLUMÉ : le son part, la vibration non — ce n'est
  // donc pas la limite de Chrome sur écran éteint. Ce qui EST mesuré (banc
  // d'écran § 5 ter, navigateur réel) : l'app émet exactement UN
  // `navigator.vibrate(120)` à l'échéance, et rien ne le supprime ni ne le
  // double. Le défaut n'est pas dans l'émission.
  //
  // Ce que le banc ne peut PAS mesurer, et c'est le §2 quater à la lettre :
  // Chromium de bureau n'a pas de vibreur. `vibrate()` y rend `true` quoi qu'il
  // arrive — avec geste, sans geste, depuis un minuteur — et n'écrit rien en
  // console. « Accepté » et « refusé » y sont INDISTINGUABLES.
  //
  // On ne devine donc pas la suite : on rend la réponse de la plateforme
  // LISIBLE, pour que la mesure qui compte — sur l'appareil — tranche. Aucun
  // correctif spéculatif ici ; la proposition est dans le rapport du chantier.
  function signalerEcheance() {
    if (!sourdine) biper();
    if (vibrer(VIBRATION_ECHEANCE) === false) {
      console.warn('Vibration d’échéance refusée par la plateforme ' +
        '(activation utilisateur, visibilité, ou réglage système).');
    }
  }

  function contexteAudio() {
    if (audio) return audio;
    var C = racine.AudioContext || racine.webkitAudioContext;
    if (!C) return null;
    try { audio = new C(); } catch (e) { audio = null; }
    return audio;
  }

  function reveillerAudio() {
    if (sourdine) return;
    var a = contexteAudio();
    if (a && a.state === 'suspended' && typeof a.resume === 'function') {
      try { a.resume(); } catch (e) { /* rien à faire */ }
    }
  }

  // Le son est SYNTHÉTISÉ, pas chargé : pas de fichier binaire au dépôt, pas
  // de CDN, rien à précacher. Une sinusoïde de 880 Hz sur 200 ms, avec une
  // rampe d'attaque et d'extinction — un créneau coupé net claque.
  function biper() {
    var a = contexteAudio();
    if (!a || typeof a.createOscillator !== 'function') return;
    try {
      var t = a.currentTime;
      var osc = a.createOscillator();
      var gain = a.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) { /* le son est un confort, pas une garantie */ }
  }

  // ── Les gestes de saisie ────────────────────────────────────────────────
  // 184 (S-double-tap-devalide) — L'ANTI-REBOND DU ✓. Un second toucher sur la MÊME case dans les 500 ms est un
  // double toucher, pas un geste : il ne dévalide pas la série qu'on vient de valider (30 % des validations du
  // testeur 7). Le toucher écarté ne relance pas la fenêtre ; le suivant, passé 500 ms, est un vrai geste
  // (dévalider reste possible). Aucune règle du coach : seulement le geste.
  var ANTI_REBOND_OK_MS = 500;
  var dernierToucherOk = { cle: null, quand: 0 };
  function validerSerieSansRebond(iExo, iSerie) {
    var cle = iExo + ':' + iSerie, maintenant = Date.now();
    if (dernierToucherOk.cle === cle && maintenant - dernierToucherOk.quand < ANTI_REBOND_OK_MS) return Promise.resolve();
    dernierToucherOk = { cle: cle, quand: maintenant };
    return validerSerie(iExo, iSerie);
  }

  // ══ 185 — LA SAISIE VÉRIFIÉE (ECRAN-SAISIE « La question de vraisemblance ») ══════════════════════════════════════
  //
  // Une saisie n'est pas forcément vraie. Quand on valide une série dont la charge ou les reps sortent de ce que l'exercice a
  // toujours été, UNE ligne apparaît SOUS la série, AVANT qu'elle soit écrite : la question et ses boutons. Jamais une fenêtre,
  // jamais un blocage : « Oui » écrit ce qui a été tapé. La règle est `faits.vraisemblanceDeLaSerie` (aucun seuil ici) ; l'app
  // pose la question, exécute le bouton touché, et garde de quoi apprendre (deux « Oui » au même genre, sur le même exercice :
  // on ne le demande plus). L'apprentissage est gardé SUR L'APPAREIL (meta `reponsesSaisie`) : une table en base demande une
  // migration, que Claude.ai écrit — signalé dans la PR 185.
  var CLE_REPONSES_SAISIE = 'reponsesSaisie';
  var reponsesDeSaisie = {};                       // { 'slug|genre' : nombre de « Oui » }
  var questionsDeSaisie = { seance: null, liste: {} };   // 'iExo:iSerie' -> { mode, q, champ }
  var CHAMP_DE_LA_QUESTION = { hausse: 'charge_kg', double_halteres: 'charge_kg', baisse: 'charge_kg', zero: 'reps',
    reps_haut: 'reps', reps_bas: 'reps', reps_invalides: 'reps', record: 'charge_kg' };

  // Une question tient à UNE série, par son identifiant : les indices bougent (série ajoutée, supprimée), pas l'identifiant.
  function cleDeQuestion(iExo, iSerie) {
    var exo = seance && (seance.exercices || [])[iExo];
    var s = exo && (exo.series || [])[iSerie];
    return s && s.id ? s.id : null;
  }
  function questionDe(iExo, iSerie) {
    var cle = cleDeQuestion(iExo, iSerie);
    if (!cle || questionsDeSaisie.seance !== seance.id) return null;
    return questionsDeSaisie.liste[cle] || null;
  }
  function poserQuestionDeSaisie(iExo, iSerie, mode, q) {
    semerSeance();       // une série n'a son identifiant qu'une fois semé : la question s'y accroche
    var cle = cleDeQuestion(iExo, iSerie);
    if (!cle) return;
    if (questionsDeSaisie.seance !== seance.id) questionsDeSaisie = { seance: seance.id, liste: {} };
    questionsDeSaisie.liste[cle] = { mode: mode, q: q, champ: CHAMP_DE_LA_QUESTION[q.genre] || null };
  }
  function retirerQuestionDeSaisie(iExo, iSerie) {
    var cle = cleDeQuestion(iExo, iSerie);
    if (cle && questionsDeSaisie.liste) delete questionsDeSaisie.liste[cle];
  }
  // Ce que l'écran lit : la question et ses boutons (le texte vient de la règle), rien d'autre.
  function questionSurLigne(iExo, iSerie) {
    var e = questionDe(iExo, iSerie);
    if (!e) return null;
    return { texte: e.q.texte, genre: e.q.genre, mode: e.mode, champ: e.champ, refus: e.q.refus === true,
             boutons: e.q.boutons.map(function (b) { return { texte: b.texte, principal: b.principal === true }; }) };
  }

  function confirmationsDe(slug) {
    var out = {};
    faits.GENRES_DE_QUESTION.forEach(function (g) { out[g] = Number(reponsesDeSaisie[slug + '|' + g]) || 0; });
    return out;
  }
  async function compterUnOui(slug, genre) {
    var cle = slug + '|' + genre;
    reponsesDeSaisie[cle] = (Number(reponsesDeSaisie[cle]) || 0) + 1;
    try { await Cache.ecrireMeta(CLE_REPONSES_SAISIE, reponsesDeSaisie); } catch (e) { /* l'apprentissage est un confort */ }
  }

  // L'historique de l'exercice AVANT cette séance, les séries déjà validées du jour, la consigne du jour.
  function contexteDeVraisemblance(iExo, iSerie) {
    var exo = seance.exercices[iExo];
    var slug = exo.exercise_slug;
    var debut = String(seance.debut || '');
    var historique = faits.seancesDeLExercice(corpus(), slug).filter(function (g) {
      return g.seance.id !== seance.id && String(g.seance.debut || '') < debut;
    }).map(function (g) { return { series: g.series }; });
    var duJour = (exo.series || []).filter(function (x, k) { return k !== iSerie && Seance.partEnBase(x); });
    var ligne = (planDeLExercice(iExo) || { lignes: [] }).lignes[iSerie];
    var charge = ligne && ligne.role !== 'hors' ? Number(ligne.charge) : NaN;
    var cible = ligne ? Number(ligne.vise) : NaN;
    return { historique: historique, seance: duJour, confirmations: confirmationsDe(slug),
             chargeVisee: isFinite(charge) && ligne.charge !== null ? charge : null,
             cible: isFinite(cible) && ligne && ligne.vise !== null ? cible : null };
  }
  function saisieDeLaSerie(iExo, iSerie) {
    var exo = seance.exercices[iExo], s = exo.series[iSerie];
    var def = catalogueIndexe()[exo.exercise_slug];
    return { charge: s.charge_kg, reps: s.reps, type: s.type_serie || 'travail', equipement: def ? def.equipement || null : null };
  }
  // Avant l'écriture : `null`, ou la question (et rien n'est écrit). Un exercice noté par nom (élastique) n'a pas de charge à
  // comparer.
  function questionAvantEcriture(iExo, iSerie) {
    var exo = seance.exercices[iExo];
    if (elastiqueDeLaGrille(exo.exercise_slug)) return null;
    return faits.vraisemblanceDeLaSerie(saisieDeLaSerie(iExo, iSerie), contexteDeVraisemblance(iExo, iSerie));
  }
  // Après l'écriture : le record qui dépasse le meilleur de plus de 20 % demande un mot de plus, avant le journal (immuable).
  function questionDuRecordApres(iExo, iSerie) {
    var exo = seance.exercices[iExo];
    if (elastiqueDeLaGrille(exo.exercise_slug)) return null;
    return faits.questionDuRecord(saisieDeLaSerie(iExo, iSerie), contexteDeVraisemblance(iExo, iSerie));
  }

  // Le toucher d'un bouton de la question. `k` : l'index du bouton dans `q.boutons`.
  async function repondreQuestionDeSaisie(iExo, iSerie, k) {
    var e = questionDe(iExo, iSerie);
    if (!e || !seance) return;
    var b = e.q.boutons[k];
    if (!b) return;
    var slug = seance.exercices[iExo].exercise_slug;
    retirerQuestionDeSaisie(iExo, iSerie);
    if (e.mode === 'record') {
      // Après l'écriture : « Non, ne compte pas » garde la série au journal et la sort du calcul ; « Oui » ne change rien.
      if (b.action === 'hors_calcul') {
        seance = Seance.marquerHorsCalcul(seance, iExo, iSerie, true);
        var vidage = oublierObservationDe(iExo, iSerie);
        await apresGeste();
        await vidage;
      } else {
        await apresGeste({ structure: false });
      }
      return;
    }
    if (b.action === 'corriger') {
      await apresGeste({ structure: false });
      Rendu.focusChamp($('blocs-seance'), iExo, iSerie, e.champ || 'charge_kg');
      return;
    }
    if (b.action === 'garder') await compterUnOui(slug, e.q.genre);
    if (b.action === 'charge') seance = Seance.modifierSerie(seance, iExo, iSerie, { charge_kg: b.valeur });
    if (b.action === 'reps') seance = Seance.modifierSerie(seance, iExo, iSerie, { reps: b.valeur });
    // 0 rep : « manquée » écrit la série comme une tentative manquée (le chemin de `echec` à 0 rep, `palier.js`), « J'ai eu mal »
    // aussi, et ouvre le geste « J'ai mal » de l'exercice.
    if (b.action === 'manquee' || b.action === 'mal') seance = Seance.changerType(seance, iExo, iSerie, 'echec');
    await validerSerie(iExo, iSerie, { sansQuestion: true });
    if (b.action === 'mal') {
      var iBloc = -1;
      Modele.blocsDeSeance(seance, local.exercices).forEach(function (bl, n) { if (iBloc < 0 && indicesDe(bl).indexOf(iExo) >= 0) iBloc = n; });
      if (iBloc >= 0) ouvrirFeuilleBloc('douleur', iBloc, iExo);
    }
  }

  async function validerSerie(iExo, iSerie, options) {
    var exo = seance.exercices[iExo];
    var serie = exo.series[iSerie];
    // ⚠️ `partEnBase`, PAS `validee_a` (chantier 35, D3). La case affichée cochée
    // et l'action du tap doivent dire la MÊME chose : une série importée
    // s'affiche cochée (elle a été faite) alors que son `validee_a` est NULL.
    // Tester `validee_a` ici ferait VALIDER une case déjà cochée — un tap qui
    // fait l'inverse de ce que l'écran annonce.
    if (Seance.partEnBase(serie)) {
      // Dévalider RETIRE la ligne : une série non validée ne peut pas exister
      // en base (`sets_validee_si_saisie`).
      // 185 — dévalider emporte la question du record posée sur cette série.
      retirerQuestionDeSaisie(iExo, iSerie);
      seance = Seance.devalider(seance, iExo, iSerie);
      // R2 (49-18) — l'observation se vide SUR L'APPAREIL AVANT LE REDESSIN,
      // comme pour A et B : la partie synchrone d'`oublierObservationDe` est
      // faite dès l'appel. Avant, `apresGeste` dessinait un plan où la série
      // dévalidée portait encore l'observation de son pari (I7), et rien ne le
      // redessinait avant le geste suivant.
      var vidage = oublierObservationDe(iExo, iSerie);
      await apresGeste();
      await vidage;
      return observerSerie(iExo, iSerie);
    }
    // Ce qui est affiché en gris devient réel à la validation : on valide sans
    // rien taper quand c'est juste (§3 bis.3).
    //
    // ⚠️ SEULEMENT LES CHAMPS DU GABARIT. Recopier aveuglément les quatre
    // écrirait une charge sur une planche et une durée sur un développé — la
    // « planche à 0 kg × 45 » que ce chantier supprime, réintroduite par la
    // porte de derrière.
    var g = Modele.gabaritDe((local.exercices || []).filter(function (e) {
      return e && e.slug === exo.exercise_slug;
    })[0]);
    // 132 (ECRAN-SAISIE §3 ter.6) — un exercice noté par nom : la grille « ÉLASTIQUE × REPS » ; la case de l'élastique
    // est obligatoire (le gris du coach se valide) ; la série s'écrit par `Profil.ecrireSerie`.
    var elg = elastiqueDeLaGrille(exo.exercise_slug);
    if (elg) g = Modele.grilleElastique(g);
    var ligneDuPlan = (planDeLExercice(iExo) || { lignes: [] }).lignes[iSerie];
    // ECRAN §3 ter.5 (prompt 131, audit 130 n°3) — en cardio, le gris n'est validé
    // que si TOUTES les cases de la série sont vides : une case tapée laisse les
    // autres vides. La règle vit dans `Seance.grisValide`, lue aussi par
    // `casesManquantes` : la recopie ci-dessous ne peut pas la contredire.
    var f = Seance.grisValide(g, serie, fantomeDe(iExo, iSerie));
    // ECRAN §3 bis.3 bis (prompts 100 puis 105) — AUCUNE CASE OBLIGATOIRE VIDE :
    // une case ni tapée ni grisée par le coach, et la série ne se valide pas.
    // Le test « le cran au-dessus × 3 » sans chiffre validait « charge inconnue
    // × 3 », et le constat inventait le fait du jour (I26) ; des reps vides
    // validaient une série sans reps. Toutes les cases manquantes passent au
    // rouge, le clavier s'ouvre sur la première de la ligne.
    //
    // §9.14 (ECRAN §3.2, 25/09/2026) — SAUF LES REPS DE LA LIGNE PROPOSÉE. Elles
    // ne sont pas un fantôme (valider sans les taper enregistrerait le bas de la
    // zone, et le pari serait jugé exact d'office), mais la fourchette du coach
    // est dans la case : on ne valide pas, on met le curseur dans les reps, et
    // on le dit — sans alarme ni rouge. MOTEUR §9.14 bis (68A) — la ligne
    // d'élan non plus : ses reps se tapent.
    var aTaper = !!(ligneDuPlan && (ligneDuPlan.proposee || ligneDuPlan.role === 'elan'));
    var manquantes = Seance.casesManquantes(g, serie, f).filter(function (nom) {
      return !(aTaper && nom === 'reps');
    });
    if (manquantes.length) {
      Rendu.demanderCases($('blocs-seance'), iExo, iSerie, manquantes);
      return;
    }
    if (aTaper && (serie.reps === null || serie.reps === undefined)) {
      Rendu.demanderReps($('blocs-seance'), iExo, iSerie);
      return;
    }
    var champs = {};
    if (elg) {
      // Le nom tapé, sinon le gris ; les reps tapées, sinon le gris. Puis ce qui part en base : le nom, et le kg déclaré
      // d'une aide (sinon NULL) — jamais la charge virtuelle.
      var nomEl = serie.elastique || f.elastique;
      var repsEl = serie.reps === null || serie.reps === undefined ? f.reps : serie.reps;
      var ecrit = Profil.ecrireSerie(elg.fiche, elg.ma, nomEl, repsEl);
      champs = { elastique: ecrit.elastique, charge_kg: ecrit.charge_kg, reps: ecrit.reps };
    }
    //
    // La seule condition qui compte est « le champ est VIDE » : ce qui a été
    // tapé n'est jamais écrasé. Un fantôme absent se normalise en `null` dans
    // `modifierSerie`, donc le tester ici ne changerait rien — un garde-fou
    // qu'aucune mutation ne peut tuer est un garde-fou mort (leçon de
    // `palier.js`, chantier 17).
    if (!elg) g.champs.forEach(function (nom) {
      var c = Modele.champDeMesure(nom);
      // §9.17 — UNE AIDE SE RANGE EN NÉGATIF, par `rangerAide` et nulle part ailleurs,
      // aussi pour ce que la validation recopie : le fantôme d'une aide est
      // négatif (le coach, la séance d'avant), mais la CIBLE d'une routine se
      // tape en positif sous « AIDE (KG) ». `rangerAide` est idempotente.
      if (c && serie[c.cle] === null) {
        champs[c.cle] = g.nature === 'aide' && c.cle === 'charge_kg' ? Modele.rangerAide(f[c.cle]) : f[c.cle];
      }
    });
    if (Object.keys(champs).length) seance = Seance.modifierSerie(seance, iExo, iSerie, champs);
    // 185 — UNE SAISIE N'EST PAS FORCÉMENT VRAIE : la question vient SOUS la série, AVANT qu'elle soit écrite ; elle ne bloque
    // jamais (« Oui » écrit ce qui est tapé, ci-dessous, par `repondreQuestionDeSaisie`).
    var enAttente = questionDe(iExo, iSerie);
    if (enAttente && enAttente.q.refus) return;     // des reps refusées sur place : rien ne s'écrit tant qu'elles ne sont pas un entier
    if (!(options && options.sansQuestion)) {
      var qv = questionAvantEcriture(iExo, iSerie);
      if (qv) {
        poserQuestionDeSaisie(iExo, iSerie, 'avant', qv);
        await apresGeste({ structure: false });
        return;
      }
    }

    // ⚠️ EN CORRECTION, ON HORODATE LA SÉANCE, PAS L'INSTANT. Une ligne
    // ajoutée en rouvrant une séance d'avant-hier porterait sinon la date
    // d'aujourd'hui : un fait faux en base, dans la colonne même qui dit
    // quand la série a été faite.
    //
    // 183 — LA GARDE DE DÉVELOPPEMENT ATTEND L'OBSERVATION. Dès la validation, la ligne n'est pas encore figée (`set_observe`
    // manque) : le repos (`reposApres`) et `apresGeste` calculent un plan où I7 lisait « 0 pari de sa révision ». Les plans se
    // calculent comme avant (même ordre, mêmes écritures) ; seule leur VÉRIFICATION passe après `observerSerie`.
    // (Le bloc `try` court jusqu'à la fin de la fonction.)
    var reprendreGarde = suspendreGarde();
    try {
    // 193-6 — la série « Au max » écrit la réserve qui lui était DEMANDÉE (la ligne du plan la porte) : un fait d'intention, comme `repos_s`.
    var lAuMax = planDeLExercice(iExo);
    lAuMax = lAuMax && lAuMax.lignes && lAuMax.lignes[iSerie] ? lAuMax.lignes[iSerie].auMax : null;
    if (lAuMax) seance = Seance.poserAuMaxReserve(seance, iExo, iSerie, lAuMax.reserve);
    seance = Seance.valider(seance, iExo, iSerie,
      enEdition() ? new Date(seance.fin || seance.debut) : new Date());
    // §2.7 — le tour avance ICI, au geste, et jamais au rendu : une marque qui
    // se recalculerait à l'affichage reculerait à la première dévalidation,
    // et c'est précisément ce que l'asymétrie assumée interdit.
    seance = Seance.avancerTours(seance,
      Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
    // §9.11, I7 G2 (49-17) — le pari de CETTE série est enregistré sur
    // l'appareil AVANT tout plan suivant, dans le même geste synchrone que la
    // validation : aucun plan ne voit la série validée sans son pari.
    var pariProvisoire = enregistrerPari(iExo, iSerie);
    vibrer();
    // ⚠️ PAS DE REPOS EN CORRECTION. Le chronomètre mesure le temps entre deux
    // séries RÉELLES ; en rouvrant une séance d'avant-hier, il compterait un
    // repos qui n'a pas eu lieu et l'écrirait dans `repos_s`.
    //
    // MOTEUR §9.15 (49-U10) — LE REPOS APRÈS CETTE SÉRIE VIENT DU PLAN
    // (`THPlan.reposApres`) : 60 s après une chauffe, 120 s après la dernière,
    // AUCUN avant la dégressive que le coach a remplie (« sans repos »), et le
    // repos de l'exercice pour une série de travail. Une cible nulle n'arme
    // rien ET arrête le repos d'avant — valider met toujours fin au repos
    // précédent.
    if (!enEdition()) demarrerChrono(Plan.reposApres(planDeLExercice(iExo), iSerie, exo.repos_cible_s), iExo, exo.exercise_slug, iSerie);
    // ⚠️ L'OBSERVATION VIENT APRÈS `apresGeste`, ET C'EST L'ORDRE QUI COMPTE :
    // `poserSeries` y pose l'entrée des séries, donc avec un `seq` plus petit
    // que celui de la prédiction. `set_observe` trouve alors toujours sa série.
    await apresGeste();
    // §9.11 (49-C) — le pari de CETTE série, AVANT son observation : il doit
    // exister pour être observé. C'est aussi lui qui la fige (§9.13). Déjà sur
    // l'appareil ; il entre dans la file ICI, derrière les séries.
    if (pariProvisoire) await poserPari(await finirPari(pariProvisoire));
    await observerSerie(iExo, iSerie);
    // 185 — le record qui dépasse le meilleur de plus de 20 % : un mot de plus, AVANT le journal des records (il ne s'écrit
    // qu'à « Terminer », par `ecrireJournalDeSeance` : « Non, ne compte pas » passe par là avant lui).
    var qr = questionDuRecordApres(iExo, iSerie);
    if (qr) {
      poserQuestionDeSaisie(iExo, iSerie, 'record', qr);
      await apresGeste({ structure: false });
    }
    montrerLeReculSuivant(iExo, iSerie);
    } finally {
      reprendreGarde();
    }
  }

  // 200-8 — après une validation, la ligne de recul qui suit reste visible au-dessus de la barre du bas : si la carte posée sous la
  // série (la question de réserve) la pousse derrière les onglets, l'écran défile du juste nécessaire. Rien n'est calculé : une position.
  function montrerLeReculSuivant(iExo, iSerie) {
    try {
      var suivante = seance && seance.exercices[iExo] && seance.exercices[iExo].series[iSerie + 1];
      if (!suivante || Modele.typeDe(suivante) !== 'recul') return;
      var n = doc.querySelector('#blocs-seance .serie[data-iexo="' + iExo + '"][data-iserie="' + (iSerie + 1) + '"]');
      var ong = doc.querySelector('.onglets');
      if (!n || !racine.scrollBy) return;
      var haut = ong ? ong.getBoundingClientRect().top : racine.innerHeight;
      var bas = n.getBoundingClientRect().bottom;
      if (bas > haut - 8) racine.scrollBy(0, Math.ceil(bas - haut + 16));
    } catch (e) { /* un confort de lecture : jamais un geste cassé */ }
  }

  // 183 — SUSPENDRE LA VÉRIFICATION d'un plan le temps d'un geste en deux temps. Rien ne s'écrit ici : `planActuel` calcule
  // et mémorise le plan comme toujours, la garde (développement seulement) garde en attente le dernier plan non vérifié ;
  // `reprendre()` le vérifie, avec les paris tels que l'observation les a laissés. Plusieurs gestes peuvent se croiser.
  function suspendreGarde() {
    gardeSuspendue += 1;
    var rendue = false;
    return function reprendre() {
      if (rendue) return;
      rendue = true;
      gardeSuspendue -= 1;
      if (gardeSuspendue > 0 || !planNonVerifie) return;
      var attente = planNonVerifie;
      planNonVerifie = null;
      if (!garde.active || rejeuEnCours) return;
      try {
        // Un plan recalculé depuis (l'observation a changé les paris) a déjà été vérifié par `planActuel` lui-même.
        var plan = planActuel();
        if (plan === attente.plan) garde.verifier(plan, entreesDuPlan());
      } catch (e) { /* la garde ne casse jamais un geste */ }
    };
  }

  // Le retour haptique : aucun pixel, et il confirme la validation même avec
  // les mains moites (§3 bis.4). `vibrate` n'existe pas partout et peut être
  // refusé.
  //
  // ⚠️ 18 ms — la valeur d'avant — est SOUS le seuil utile : le moteur à masse
  // excentrée d'un téléphone met une vingtaine de millisecondes rien qu'à
  // démarrer, si bien que l'appel réussissait sans que rien ne se sente. C'est
  // l'explication la plus probable du « spécifié mais absent » relevé sur
  // device le 11/09 ; la vérification au banc est dans le rapport.
  var VIBRATION_VALIDATION = 35;
  var VIBRATION_ECHEANCE = 120;   // à travers une poche, il faut plus long

  // Rend CE QUE LA PLATEFORME A RÉPONDU — `false` quand elle refuse, `null`
  // quand l'API n'existe pas. Ignorer ce booléen, c'était se priver du seul
  // signal qui distingue « l'app n'a pas demandé » de « le téléphone a dit
  // non » : les deux se ressemblent exactement au poignet.
  function vibrer(duree) {
    try {
      if (racine.navigator && typeof racine.navigator.vibrate === 'function') {
        return racine.navigator.vibrate(duree || VIBRATION_VALIDATION);
      }
    } catch (e) { /* rien à faire : c'est un confort, pas une garantie */ }
    return null;
  }

  function precedentDe(slug) {
    return Seance.precedent(slug, local.seances, seriesDe, seance ? seance.id : null);
  }

  // ── §9.13 — LA CONSIGNE DE CHAQUE EXERCICE DE LA SÉANCE OUVERTE ────────────
  //
  // ⚠️ UNE FOIS PAR EXERCICE, JAMAIS À LA FRAPPE. Le mémo suit exactement le
  // patron de `datesExercices` : paresseux (le premier rendu suit l'ouverture,
  // donc « calculé à l'ouverture »), remis à `null` quand le CORPUS change
  // (`recalculerEtats`), et clé sur ce qui change la consigne sans toucher au
  // corpus : la séance ouverte et le profil (intention, rythme). Un slug qui
  // n'y est pas encore — un exercice ajouté en séance — se calcule seul.
  //
  // Tout est en mémoire (`local`, `seancesDeLExercice`) : aucun réseau, et en
  // salle il n'y en a pas. Le plan, lui, se dérive à chaque rendu depuis cette
  // consigne et la liste ACTUELLE des séries — c'est `Seance.planDe`, et c'est
  // de l'arithmétique sur trois entiers, pas le moteur.
  var consignes = null;   // { cle, index, parSlug }

  // ⚠️ LA RÉPONSE AU LEST N'EST PLUS DANS LA CLÉ (prérequis d'« adapter »,
  // 04/10/2026). Elle y était : répondre à la carte recalculait TOUTES les
  // consignes de la séance — un geste sur un exercice défigeait les autres.
  // Seule la consigne qui ATTENDAIT la réponse (`carte_lest`) en dépend : elle
  // se recalcule seule (`consigneDe`), et la version lestée, absente du mémo,
  // se calcule à son arrivée.
  function cleConsignes() {
    return (seance ? seance.id : '') + '|' + ((profil && profil.intention) || '') +
      '|' + Profil.rythmeDe(profil);
  }

  // Une consigne sauvée sous l'ANCIENNE clé (avec la réponse au lest en
  // dernier) vaut pour la nouvelle : une mise à jour de l'app en pleine séance
  // ne défige rien. La consigne qui attendait la carte se recalcule de toute
  // façon dès qu'une réponse existe.
  function cleSauveeValable(sauvee, cle) {
    if (sauvee === cle) return true;
    return typeof sauvee === 'string' && /^\|(null|oui|non)$/.test(sauvee.slice(cle.length)) &&
      sauvee.slice(0, cle.length) === cle;
  }

  // ⚠️ LA CONSIGNE EST FIGÉE POUR LA SÉANCE dès son premier calcul (MOTEUR
  // §9.13 bis, 49-U1, D7) : une synchronisation, un import, une séance
  // corrigée ailleurs pendant la séance servent à la séance SUIVANTE — le mémo
  // n'est plus remis à zéro par `recalculerEtats`. Il se recalcule quand la
  // CLÉ change (une autre séance, l'intention ou le rythme changés par
  // l'utilisateur), et pour UN exercice quand l'utilisateur corrige sa zone
  // (`poserZone`). `versionConsignes` dit au plan que le mémo a bougé.
  //
  // ⚠️ ON NE FIGE PAS SANS CATALOGUE : un exercice encore inconnu donnerait
  // une mesure inconnue, donc une consigne nulle, figée pour toute la séance.
  var versionConsignes = 0;

  // ⚠️ ET ELLE SURVIT AU RECHARGEMENT (MOTEUR §9.13 bis, 49-U3). Sur Android,
  // le système ferme souvent une PWA restée en arrière-plan pendant un repos :
  // un gel qui ne vivait qu'en mémoire recalculait la consigne à la
  // réouverture — sur un historique qu'une synchronisation avait pu changer.
  //
  // OÙ : dans le magasin `brouillon`, sous sa propre clé, à côté de la séance
  // en cours (`'seance'`) — même base, même durée de vie : relue avec elle au
  // démarrage (`chargerSeanceLocale`), effacée avec elle à la fin, à l'abandon,
  // à l'enregistrement d'une correction, et par `viderTout` (déconnexion,
  // changement de compte). PAS DANS L'OBJET `seance` : il part tel quel dans
  // la file et en base, et une consigne n'est pas une propriété de la séance
  // (« la proposition n'est jamais écrite », §7 septendecies.3).
  //
  // Liée à l'identifiant de la séance ET à la clé du mémo : une autre séance,
  // ou l'intention ou le rythme changés par l'utilisateur, la font ignorer.
  var CLE_CONSIGNES = 'consignes';
  var consignesSauvees = null;   // { seanceId, cle, parSlug }, tel que sur le disque

  function sauverConsignes() {
    // L'outil de rejeu (développement) ne fige rien sur le disque.
    if (!seance || !consignes || rejeuEnCours) return;
    consignesSauvees = { seanceId: seance.id, cle: consignes.cle, parSlug: consignes.parSlug,
                         phase: phaseDeLaSeance(), objectif: objectifDeLaSeance(),
                         priorites: prioritesDeLaSeance(), debutant: debutantDeLaSeance(),
                         prudence: prudenceDeLaSeance() };
    Cache.ecrireBrouillon(CLE_CONSIGNES, consignesSauvees)
      .catch(function (e) { console.warn('Consignes non sauvées :', texteErreur(e)); });
  }

  async function oublierConsignes() {
    consignesSauvees = null;
    phaseGelee = null;
    objectifGele = null;
    prioritesGelees = null;
    debutantGele = null;
    prudenceGelee = null;
    await Cache.ecrireBrouillon(CLE_CONSIGNES, null).catch(function () {});
  }

  // ── MOTEUR §9.16 (49-U11) — LA PHASE, GELÉE AVEC LA CONSIGNE ─────────────
  //
  // Lue UNE FOIS dans le profil (le cache, hors ligne compris), au moment où la
  // consigne de la séance se fige, et gelée pour la séance : changer de phase
  // dans Profil en pleine séance ne change ni la séance en cours ni ses paris
  // suivants — elle vaut à partir de la séance suivante. Elle ne suit PAS la
  // clé des consignes (un rythme changé recalcule la consigne, pas la phase) :
  // elle ne dépend que de la séance. Elle survit au rechargement avec les
  // consignes (`consignesSauvees.phase`). Jamais vide : `Profil.phaseDe`.
  var phaseGelee = null;   // { seanceId, phase }
  // MOTEUR §9.16 (60-2b, I40) — L'OBJECTIF, gelé de la même façon, au même moment,
  // avec la même durée de vie : lu une fois dans le profil, il ne change ni la séance
  // en cours ni ses paris. Il ne change AUCUNE consigne — il n'entre que dans le
  // fondement des paris. `null` est une valeur (« sans réponse »).
  var objectifGele = null;   // { seanceId, objectif }
  // MOTEUR §14.6 (60-2b) — LES PRIORITÉS, gelées de la même façon, au même moment :
  // elles décident si un muscle a de la place pour une série de plus (jusqu'à son plus
  // haut volume) — une carte ne doit ni apparaître ni disparaître parce qu'on a
  // coché autre chose dans Profil en pleine séance (I12 : le mémo du plan ne voit
  // pas le profil).
  var prioritesGelees = null;   // { seanceId, priorites }
  // MOTEUR §14 (111) — LE DÉBUTANT, gelé de la même façon, au même moment : la
  // dégressive proposée ne lui est jamais faite ; une carte ne doit ni apparaître
  // ni disparaître parce qu'on a changé son ancienneté en pleine séance.
  var debutantGele = null;   // { seanceId, debutant }
  // 191 (MOTEUR §9.1.2 bis) — LA PRUDENCE DE MONTÉE (le plafond du saut, « un cran à la fois »), gelée de la même façon : l'âge et
  // l'ancienneté lus UNE fois, au moment où la consigne se fige — changer sa date de naissance ou son ancienneté en pleine séance ne
  // change ni la séance en cours ni ses paris. Le plan, le calage, le dépassement et I71/I73 lisent cette même valeur.
  var prudenceGelee = null;   // { seanceId, prudence }

  // MOTEUR §14.6 (49-U16) — LA RÈGLE DE VOLUME, UNE FOIS PAR SÉANCE, à côté
  // de la phase : le volume de chaque semaine par muscle sur TOUT l'historique
  // (`Semaine.semainesDeVolume`, importées comprises), puis la place de chaque
  // muscle (`Moteur.placeDeVolume`). Gelée en mémoire pour la séance : une
  // synchronisation en cours de séance ne la change pas ; au rechargement, le
  // même historique la redonne. Aucun affichage.
  var volumeGele = null;   // { seanceId, volume }
  function volumeDeLaSeance() {
    if (!seance) return null;
    if (volumeGele && volumeGele.seanceId === seance.id) return volumeGele.volume;
    var volume = volumeDuCoach(seance.debut);
    volumeGele = { seanceId: seance.id, volume: volume };
    return volume;
  }

  // MOTEUR §17.2 bis (78) — LE PASSÉ DE CHAQUE EXERCICE POUR LA QUESTION DE RÉSERVE, FIGÉ POUR LA SÉANCE comme la
  // consigne : lu une fois par exercice (un exercice ajouté en séance se lit à son arrivée), sur les séances
  // terminées d'avant (`Reserve.passeDeReserve`). Le plan décide ; ceci n'est que son entrée.
  var reserveGelee = null;   // { seanceId, passes: { [slug]: passe } }
  function reserveDeLaSeance() {
    if (!seance) return null;
    if (!reserveGelee || reserveGelee.seanceId !== seance.id) reserveGelee = { seanceId: seance.id, passes: {} };
    var passes = reserveGelee.passes;
    (seance.exercices || []).forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (slug && !Object.prototype.hasOwnProperty.call(passes, slug)) {
        passes[slug] = Reserve.passeDeReserve(slug, local.seances, seriesDe, seance.id);
      }
    });
    // Une copie : les entrées d'un plan déjà calculé ne grandissent pas quand un exercice s'ajoute.
    return { lancement: Reserve.LANCEMENT_RESERVE, passes: Object.assign({}, passes) };
  }

  // LE FAIT DU COACH PAR MUSCLE (MOTEUR §14.6) : `{ muscle: { moyenne, seuil, max, fenetres } | null }`, sur tout
  // l'historique, avant l'instant `avant`. UNE fonction, deux lecteurs (66B, QUESTIONNAIRE §5 ter.4 bis) : la série de
  // plus (`volumeDeLaSeance`, avec le début de la séance, et son gel) et « Le coach relit ta semaine » (maintenant).
  function volumeDuCoach(avant) {
    var semaines = Semaine.semainesDeVolume(local.seances, local.series, local.exercices, avant);
    var volume = {};
    Object.keys(semaines).forEach(function (m) { volume[m] = Moteur.placeDeVolume(semaines[m]); });
    return volume;
  }

  function phaseDeLaSeance() {
    if (!seance) return null;
    var sauvee = consignesSauvees && consignesSauvees.seanceId === seance.id
      ? consignesSauvees.phase : null;
    phaseGelee = Profil.phaseGelee(phaseGelee, seance.id, sauvee, profil);
    return phaseGelee.phase;
  }

  // `undefined` : rien de sauvé pour cette séance (gelée avant 60-2b) — le gel
  // retombe alors sur le profil d'aujourd'hui ; `null` est un objectif sauvé.
  function objectifDeLaSeance() {
    if (!seance) return null;
    var sauvee = consignesSauvees && consignesSauvees.seanceId === seance.id
      ? consignesSauvees.objectif : undefined;
    objectifGele = Profil.objectifGele(objectifGele, seance.id, sauvee, profil);
    return objectifGele.objectif;
  }

  // `undefined` à la relecture : rien de sauvé pour cette séance (gelée avant
  // 60-2b) — les priorités du profil d'aujourd'hui ; `[]` est une liste sauvée.
  function prioritesDeLaSeance() {
    if (!seance) return [];
    var sauvee = consignesSauvees && consignesSauvees.seanceId === seance.id
      ? consignesSauvees.priorites : undefined;
    prioritesGelees = Profil.prioritesGelees(prioritesGelees, seance.id, sauvee, profil);
    return prioritesGelees.priorites;
  }

  // `undefined` à la relecture (gelée avant 111) : le profil d'aujourd'hui.
  function debutantDeLaSeance() {
    if (!seance) return false;
    if (debutantGele && debutantGele.seanceId === seance.id) return debutantGele.debutant;
    var sauve = consignesSauvees && consignesSauvees.seanceId === seance.id &&
      typeof consignesSauvees.debutant === 'boolean' ? consignesSauvees.debutant : null;
    debutantGele = { seanceId: seance.id, debutant: sauve !== null ? sauve : Profil.estDebutant(profil) };
    return debutantGele.debutant;
  }

  // `undefined` à la relecture (gelée avant 191) : le profil d'aujourd'hui, au jour de la séance.
  function prudenceDeLaSeance() {
    if (!seance) return Profil.prudenceDuProfil(profil, new Date(instantDuCalcul()));
    if (prudenceGelee && prudenceGelee.seanceId === seance.id) return prudenceGelee.prudence;
    var sauve = consignesSauvees && consignesSauvees.seanceId === seance.id &&
      consignesSauvees.prudence && typeof consignesSauvees.prudence === 'object' ? consignesSauvees.prudence : null;
    prudenceGelee = { seanceId: seance.id, prudence: sauve !== null ? sauve : Profil.prudenceDuProfil(profil, new Date(instantDuCalcul())) };
    return prudenceGelee.prudence;
  }

  // §12.9 (49-U13) — « sous consigne », dans l'app : une séance qui porte au
  // moins un pari sur l'exercice (table `predictions`, le fondement dit la
  // séance). Deux sources, réunies : les paris du serveur (tous appareils,
  // relus à la synchronisation, `local.sousConsigne`) et ceux de cet appareil
  // pas encore montés (`local.predictions`).
  var CLE_SOUS_CONSIGNE = 'sous-consigne';
  var CLE_PARIS_LEGERS = 'paris-legers';
  var CLE_PARIS_ESCALIER = 'paris-escalier';
  // MOTEUR §9.22 (53-2).
  var CLE_BLOCS = 'blocs';
  var CLE_PARIS_PROGRAMME = 'paris-programme';
  // 83 — les séries que cet appareil connaît, par séance.
  var CLE_CONNUES = 'connues-series';

  // `{ [slug]: [identifiants de séance] }`, à partir de lignes `predictions` —
  // celles du serveur (`session_id`, colonne générée) ou celles de l'appareil
  // (le fondement).
  function seancesAvecPari(lignes) {
    var parSlug = {}, vus = {};
    (lignes || []).forEach(function (l) {
      var slug = l && l.exercise_slug;
      var id = !slug ? null : l.session_id || (l.fondement ? l.fondement.seance : null);
      if (!id || vus[slug + '|' + id]) return;
      vus[slug + '|' + id] = true;
      (parSlug[slug] || (parSlug[slug] = [])).push(id);
    });
    return parSlug;
  }

  function seancesSousConsigne(slug) {
    var ids = ((local.sousConsigne || {})[slug] || []).slice();
    var vus = {};
    ids.forEach(function (id) { vus[id] = true; });
    (local.predictions || []).forEach(function (l) {
      var id = l && l.exercise_slug === slug && l.fondement ? l.fondement.seance : null;
      if (id && !vus[id]) { vus[id] = true; ids.push(id); }
    });
    return ids;
  }

  // ── MOTEUR §14.4 (49-U14) — L'ESCALIER : CE QUE L'APP LIT POUR LE PLAN ──
  //
  // Les paris de l'escalier : ceux du serveur (`local.escalier`) et ceux de cet
  // appareil (`local.predictions`, `module = 'escalier'`), une fois chacun — la
  // copie de l'appareil l'emporte (elle porte la dernière observation posée).
  function parisEscalierConnus() {
    var parId = {};
    (local.escalier || []).forEach(function (l) { if (l && l.id) parId[l.id] = l; });
    (local.predictions || []).forEach(function (l) {
      if (l && l.id && l.module === Moteur.MODULE_ESCALIER) parId[l.id] = l;
    });
    return Object.keys(parId).map(function (k) { return parId[k]; });
  }

  // Les compteurs à l'ouverture, lus dans le fondement des paris de consigne :
  // ceux du serveur (`local.parisLegers`, la colonne `compteur`) et ceux de
  // l'appareil. Une entrée par (séance, exercice). La date est celle de la
  // séance (`local.seances`, ou la séance ouverte).
  function compteursDesParis() {
    var debutDe = {};
    (local.seances || []).forEach(function (s) { if (s && s.id) debutDe[s.id] = s.debut; });
    if (seance && seance.id) debutDe[seance.id] = seance.debut;
    var vus = {}, sortie = [];
    var ajouter = function (slug, sid, c) {
      if (!slug || !sid || typeof c !== 'number' || !debutDe[sid] || vus[sid + '|' + slug]) return;
      vus[sid + '|' + slug] = true;
      sortie.push({ exercice: slug, seance: sid, compteur: c, debut: debutDe[sid],
                    jour: Moteur.jourCivil(debutDe[sid]) });
    };
    (local.predictions || []).forEach(function (l) {
      if (!l || l.module === Moteur.MODULE_ESCALIER || !l.fondement) return;
      ajouter(l.exercise_slug, l.fondement.seance, l.fondement.compteur);
    });
    (local.parisLegers || []).forEach(function (l) {
      var c = l && typeof l.compteur === 'string' ? Number(l.compteur) : l && l.compteur;
      ajouter(l && l.exercise_slug, l && l.session_id, typeof c === 'number' && isFinite(c) ? c : null);
    });
    return sortie;
  }

  // Les semaines allégées ACCEPTÉES, `[{ debut, fin }]` : le compteur ne compte
  // ni ne juge leurs séances (décharge déclarée, §9.10).
  // §14.7 (49-U17) — les périodes de série de plus d'un exercice, lues dans les
  // paris de l'escalier et les compteurs figés : `[{ debut, fin, n }]`.
  function periodesSerieDePlusDe(slug) {
    var p = Moteur.periodesSerieDePlus(Moteur.marchesDesParis(parisEscalierConnus()), compteursDesParis());
    return p[slug] || [];
  }

  function periodesAllegees() {
    return Moteur.cartesDesParis(parisEscalierConnus()).filter(function (c) {
      return c.reponse === 'acceptee' && c.debut && c.fin;
    }).map(function (c) { return { debut: c.debut, fin: c.fin }; })
      // §9.22 (53-2) — et les décharges planifiées : leurs séances, comme
      // celles d'une semaine allégée, ne sont ni comptées ni jugées.
      .concat(Moteur.periodesDecharge(local.blocs, finsAllegeesConnues()));
  }

  // Les séries de travail d'un exercice dans la séance ouverte : à l'ouverture,
  // celles de la routine (ou du pré-remplissage). Figées avec la consigne.
  function aUneLigneDegressive(slug) {
    return ((seance && seance.exercices) || []).some(function (x) {
      return x && x.exercise_slug === slug && (x.series || []).some(function (s) { return s && s.type_serie === 'degressive'; });
    });
  }

  function nombreDeSeriesDeTravail(slug) {
    var exo = ((seance && seance.exercices) || []).filter(function (x) { return x && x.exercise_slug === slug; })[0];
    return exo ? (exo.series || []).filter(function (s) { return Modele.estTravail(s) && !Modele.estRecul(s); }).length : 0;
  }

  // §14.4 (consolidation 4/7, décision du 02/10/2026) — UN REMPLACEMENT
  // PENDANT UNE SEMAINE ALLÉGÉE. Le nouvel exercice reprend la place, donc
  // les lignes DÉJÀ ALLÉGÉES de l'exercice remplacé. Figer sa routine à ces
  // lignes allégerait deux fois (2 lignes → 60 % → 1). L'allègement
  // s'applique une seule fois, sur la routine de l'exercice remplacé : le
  // nouvel exercice en hérite, et sa consigne la fige.
  var routinesHeritees = {};
  function heriterRoutine(iExo, slug) {
    var p = planActuel();
    var x = p && p.allegee ? (p.exercices || []).filter(function (e) { return e.iExo === iExo; })[0] : null;
    if (!x || !x.consigne || !x.consigne.allegee || !seance) return;
    var deja = consignes && consignes.parSlug && consignes.parSlug[slug];
    if (deja && deja.seriesRoutine > 0) return;
    routinesHeritees[seance.id + '|' + slug] = nombreDeSeriesRoutine(x.slug);
  }
  // Les séries de la routine à figer avec la consigne : l'héritage d'un
  // remplacement, sinon les séries de travail de la séance ouverte.
  function routineAFiger(slug) {
    var cle = seance.id + '|' + slug;
    if (Object.prototype.hasOwnProperty.call(routinesHeritees, cle)) {
      var n = routinesHeritees[cle];
      delete routinesHeritees[cle];
      return n;
    }
    return nombreDeSeriesDeTravail(slug);
  }

  function consigneDe(slug) {
    if (!seance) return null;
    var cle = cleConsignes();
    if (!consignes || consignes.cle !== cle) {
      var sauvees = consignesSauvees && consignesSauvees.seanceId === seance.id &&
        cleSauveeValable(consignesSauvees.cle, cle) && consignesSauvees.parSlug ? consignesSauvees.parSlug : null;
      consignes = { cle: cle, index: Modele.indexerExercices(local.exercices),
                    parSlug: sauvees ? Object.assign({}, sauvees) : {} };
      versionConsignes++;
    }
    // §9.17 (prérequis d'« adapter ») — LA RÉPONSE AU LEST NE RECALCULE QUE
    // L'EXERCICE QUI L'ATTENDAIT : une consigne figée en `carte_lest` (la seule
    // que la réponse change — sans elle, comme avec « Pas de lest », le moteur
    // étire les reps) se recalcule une fois qu'une réponse existe, qu'elle
    // vienne de cet appareil ou d'un autre. Les séries de sa routine restent
    // celles figées à l'ouverture. Les autres exercices ne bougent pas.
    var seriesFigees;
    var attendait = consignes.parSlug[slug];
    if (attendait && attendait.consigne && attendait.consigne.etat === 'carte_lest' &&
        lestReponseDeLExercice(slug) !== null) {
      seriesFigees = attendait.seriesRoutine;
      delete consignes.parSlug[slug];
    }
    // 175 (MOTEUR §10 bis) — DE MÊME, LE LEVIER « VISER N REPS » : une consigne figée au maintien (la plus lourde, au plafond
    // des reps) se recalcule une fois la visée acceptée, à cette charge, plus haute que son plafond. Les séries de sa
    // routine restent celles figées à l'ouverture.
    else if (attendait && attendait.consigne && attendait.consigne.etat === 'salle_max' && attendait.consigne.fondement &&
             attendait.consigne.fondement.salle && attendait.consigne.fondement.salle.maintien === true) {
      var rl = rallongeDe(slug), fs = attendait.consigne.fondement.salle;
      if (Moteur.rallongeChangeLePlafond(rl, fs)) {
        seriesFigees = attendait.seriesRoutine;
        delete consignes.parSlug[slug];
      }
    }
    if (!Object.prototype.hasOwnProperty.call(consignes.parSlug, slug)) {
      var exo = consignes.index[slug];
      if (!exo && (local.exercices || []).length) {
        consignes.index = Modele.indexerExercices(local.exercices);
        exo = consignes.index[slug];
      }
      var options = optionsDeConsigne(slug, exo, instantDuCalcul());
      // MOTEUR §13.6 (49-U20) — LES FRÈRES, à la demande : le moteur ne les
      // demande (et ne rejoue leur compteur) que si celui de l'exercice est à 4
      // ou plus. Seule la consigne de la séance les reçoit, figés avec elle —
      // ni la suite du constat, ni la page d'exercice.
      if (exo) options.freres = function () { return freresPourLeMoteur(slug, consignes.index); };
      var groupesM = groupesDuMoteur(slug, options.salle);
      var calculee = Moteur.consigneDExercice(groupesM, etatDuMoteur(slug, options.salle, groupesM), seance.debut, options);
      if (!exo) return calculee;
      // §14.4 (49-U14) — les séries de travail de la routine, FIGÉES avec la
      // consigne : la semaine allégée en couvre 60 %, et « + Série » ne change
      // pas ce compte en cours de séance.
      if (calculee) calculee.seriesRoutine = seriesFigees !== undefined ? seriesFigees : routineAFiger(slug);
      // §14 (111) — la ligne dégressive de la routine (ou de la saisie), FIGÉE
      // avec la consigne : « Ajouter une dégressive » n'en fait pas une ligne
      // de la routine en pleine séance.
      if (calculee) calculee.degressiveRoutine = aUneLigneDegressive(slug);
      consignes.parSlug[slug] = calculee;
      versionConsignes++;
      sauverConsignes();
    }
    // §14.7 (delta 49-35) — un exercice ajouté hors routine : sa consigne a
    // servi au pré-remplissage AVANT ses séries (figée à 0). Sa routine se fige
    // à ses premières séries — sinon le compte suivrait « + Série », et la
    // ligne de plus se fondrait dans la routine.
    var figee = consignes.parSlug[slug];
    if (figee && figee.seriesRoutine === 0) {
      var premieres = routineAFiger(slug);
      if (premieres > 0) {
        figee.seriesRoutine = premieres;
        versionConsignes++;
        sauverConsignes();
      }
    }
    return consignes.parSlug[slug];
  }

  // 175 (MOTEUR §10 bis) — la visée acceptée d'un exercice (le levier « Viser N reps »), `{ charge, visee }`, ou `null` :
  // elle rallonge le plafond de sa plus lourde (`Moteur.avecRallonge`), dans les options de la consigne.
  function rallongeDe(slug) {
    return Moteur.rallongeAcceptee(slug, Moteur.marchesDesParis(parisEscalierConnus()));
  }

  // §9.17 bis (127) — la marche suivante d'un exercice, quand le coach peut la proposer (`Modele.marcheSuivante`,
  // la seule définition), sinon `null`.
  // 195 — l'objectif qui ouvre les marches d'habileté : celui, gelé, de la séance ; hors séance (la page d'exercice, la semaine),
  // celui du profil. Un `calisthenie` seulement : toute autre valeur laisse la règle d'avant.
  function objectifDeLEchelle() { return seance ? objectifDeLaSeance() : Profil.objectifDe(profil); }
  function marcheAProposer(index, slug) {
    // 175 — « Pas de lest » (le profil, ou la réponse de l'exercice) : la variante sans matériel devient la marche.
    var m = Modele.marcheSuivante(index, slug, { lestRefuse: lestReponseDeLExercice(slug) === 'non', objectif: objectifDeLEchelle() });
    if (!m || !m.proposable) return null;
    // 190 — Ma salle dit « pas de barre de traction » : une marche qui en demande une (la stricte, l'archer, le muscle-up…) ne se
    // propose pas ; les marches qui n'en demandent pas restent.
    if (Profil.sansBarreDeTraction(profil)) {
      var sans = m.cible.filter(function (c) { return !Profil.demandeUneBarreDeTraction(c, index[c]); });
      if (!sans.length) return null;
      if (sans.length < m.cible.length) m = Object.assign({}, m, { cible: sans });
    }
    return m;
  }

  // §13.6 (49-U20) — les frères d'un exercice (`Modele.freresDe`, le même
  // `mouvement`), avec ce que le moteur demande pour rejouer leur compteur :
  // les MÊMES entrées que leur propre consigne (`optionsDeConsigne`).
  function freresPourLeMoteur(slug, index) {
    return Modele.freresDe(index, slug).map(function (f) {
      var o = optionsDeConsigne(f, index[f], instantDuCalcul()), g = groupesDuMoteur(f, o.salle);
      return { slug: f, nom: Modele.nommer(index, f), groupes: g, etat: etatDuMoteur(f, o.salle, g), options: o };
    });
  }

  // ⚠️ LES OPTIONS DE LA CONSIGNE, UNE SEULE FOIS (49-U18, 01/10/2026). La
  // consigne de la séance (`consigneDe`) et la consigne de la PROCHAINE séance
  // que le constat annonce (`suiteDe`) sont le même calcul
  // (`Moteur.consigneDExercice`) : elles reçoivent les mêmes entrées. La suite
  // en recevait moins (ni les séances sous consigne, ni les zones par date, ni
  // les périodes) — sa « cible de la prochaine fois » pouvait ne pas être la
  // consigne de la fois d'après (« le coach ne fait qu'un »).
  // 132 (MOTEUR §10 ter) — CE QUE LE MOTEUR LIT D'UN EXERCICE NOTÉ PAR NOM : sa salle est la liste de ses élastiques
  // (`Profil.salleDeLExercice`, `materiel: 'elastique'`) ; son historique entre avec les charges VIRTUELLES, les séries
  // neutres en sortent (`Profil.seancesPourLeMoteur`) ; son état d'exercice (« monte » ou non, `Palier`) se lit sur ces
  // mêmes séries. Tout le reste ne change pas. Sans salle d'élastiques : l'historique et l'état tels quels.
  function estSalleElastique(salle) { return !!salle && salle.materiel === 'elastique'; }
  function groupesDuMoteur(slug, salle) {
    var g = faits.seancesDeLExercice(corpus(), slug);
    return estSalleElastique(salle) ? Profil.seancesPourLeMoteur(salle, g) : g;
  }
  // 132 (ECRAN-SAISIE §3 ter.6) — LA GRILLE D'UN EXERCICE NOTÉ PAR NOM : sa salle d'élastiques (la liste, le sens, et de
  // quoi écrire une série), ou `null` — la grille de sa mesure, comme avant.
  // 132 (MOTEUR §10 ter) — LE MEILLEUR D'UN EXERCICE NOTÉ PAR NOM, à l'affichage : `Profil.meilleurElastique` sur l'ordre
  // de Ma salle (le plus dur, puis le plus de reps ; les neutres exclues), ou `null`. Passé au modèle (`nomme`) : la
  // carte de séance, « Dernière séance », la page d'exercice et le sommaire disent le même.
  function meilleurNomme(slug, series) {
    var fiche = catalogueIndexe()[slug];
    return fiche ? Profil.meilleurElastique(fiche, Profil.salleDe(profil), series) : null;
  }
  function elastiqueDeLaGrille(slug) {
    var s = Profil.salleDeLExercice(profil, slug, catalogueIndexe());
    return estSalleElastique(s) ? s : null;
  }
  // 163 — L'exercice se note à l'élastique (grand ou mini) et sa liste est vide : « Ajoute tes élastiques ».
  function elastiqueAAjouter(slug) {
    var index = catalogueIndexe();
    var fiche = slug && Object.prototype.hasOwnProperty.call(index, slug) ? index[slug] : null;
    return !!fiche && Profil.elastiqueAAjouter(profil, fiche);
  }
  // 163 — « Ma salle » n'apparaît dans le Profil que si un exercice à l'élastique est dans une routine, l'historique
  // ou la séance en cours.
  function unExerciceALElastique() {
    var index = catalogueIndexe();
    var elastique = function (slug) {
      var f = slug && Object.prototype.hasOwnProperty.call(index, slug) ? index[slug] : null;
      return !!f && (f.type_elastique === 'grand' || f.type_elastique === 'mini');
    };
    var dans = function (l) { return (l || []).some(function (x) { return !!x && elastique(x.exercise_slug); }); };
    if (seance && dans(seance.exercices)) return true;
    if ((routines || []).some(function (r) { return !!r && !r.archivee_a && dans(r.exercices); })) return true;
    return dans(local.exercices);
  }
  // Le nom choisi dans la feuille, écrit dans la série par `Profil.ecrireSerie` : `elastique`, et `charge_kg` (−kg
  // déclaré d'une aide, sinon NULL). Une série déjà validée suit (la file la renvoie, la réaction se refait).
  async function poserElastique(iExo, iSerie, nom) {
    if (!seance) return;
    var exo = seance.exercices[iExo], s0 = exo && exo.series[iSerie];
    var elg = exo ? elastiqueDeLaGrille(exo.exercise_slug) : null;
    if (!s0 || !elg || elg.liste.indexOf(nom) < 0) return;
    var e = Profil.ecrireSerie(elg.fiche, elg.ma, nom, s0.reps);
    seance = Seance.modifierSerie(seance, iExo, iSerie, { elastique: e.elastique, charge_kg: e.charge_kg });
    if (Seance.partEnBase(s0)) reactionPerimee = true;
    await apresGeste();
    if (Seance.partEnBase(s0)) await observerSerie(iExo, iSerie);
  }
  function etatDuMoteur(slug, salle, groupes) {
    if (!estSalleElastique(salle)) return etatsExercices[slug];
    return Palier.etatsExercices((groupes || []).map(function (x) { return { slug: slug, series: x.series }; }))[slug];
  }
  // 179 (B-B7) — L'INSTANT D'UN CALCUL DE CONSIGNE : l'instant rejoué pendant un rejeu (`?rejouer=`), sinon « maintenant » — le seul
  // endroit où l'app lit l'horloge pour cela. `optionsDeConsigne` le reçoit en entrée (`instant`, ISO) et n'appelle plus `Date.now()` :
  // il décide quelles lignes de zone sont déjà en vigueur (une correction posée en séance l'est dès qu'elle est posée).
  function instantDuCalcul() {
    var i = rejeuEnCours && rejeuEnCours.instant ? Date.parse(rejeuEnCours.instant) : NaN;
    return new Date(isFinite(i) ? i : Date.now()).toISOString();
  }
  // 193-3 — la zone de plan du jour pour cet exercice : celle de sa PREMIÈRE ligne dans la séance en cours (la consigne est par
  // exercice, D6), `null` sans séance, sans ligne de routine ou en Automatique. Rien n'est lu dans une séance terminée.
  function zonePlanDe(slug) {
    if (!seance || rejeuEnCours) return null;
    var exo = (seance.exercices || []).filter(function (x) { return x && x.exercise_slug === slug; })[0];
    return exo && exo.zone_plan ? exo.zone_plan : null;
  }
  // 193-3 — « juste pour aujourd'hui » : la zone de plan de la séance n'est plus celle de la ligne de routine.
  function zonePlanOrigineDe(slug) {
    var zp = zonePlanDe(slug);
    if (!zp) return null;
    var exo = (seance.exercices || []).filter(function (x) { return x && x.exercise_slug === slug; })[0];
    var rt = routineDeLaSeance();
    var ligne = rt && exo && exo.routine_exercise_id ? (rt.exercices || []).filter(function (e) { return e && e.id === exo.routine_exercise_id; })[0] : null;
    return ligne && ligne.zone === zp ? 'routine' : 'aujourdhui';
  }
  // 193-3 — pour chaque routine, la zone de la ligne de cet exercice (la première qui en porte une) : { routine_id: zone }.
  function zonesDeRoutineDe(slug) {
    var sortie = {};
    (routines || []).forEach(function (r) {
      var l = r && (r.exercices || []).filter(function (e) { return e && e.exercise_slug === slug; })[0];
      if (l && l.zone) sortie[r.id] = l.zone;
    });
    return sortie;
  }
  function optionsDeConsigne(slug, exo, instant) {
    var g = Modele.gabaritDe(exo);
    var index = catalogueIndexe();
    var libreDuLeste = Modele.parentDe(index, slug);
    var salleX = Profil.salleDeLExercice(profil, slug, index);
    return {
      // 132 — un exercice noté par nom se charge (charges virtuelles) : le moteur le lit en charge × reps, même en
      // résistance (`reps` au catalogue).
      mesure: g.inconnue ? null : (estSalleElastique(salleX) ? 'charge_reps' : g.mesure),
      // §9.17 — le matériel EFFECTIF : une charge ajoutée est du lest (cran 2,5).
      equipement: Moteur.equipementEffectif(exo),
      // §9.17 — l'intention de l'EXERCICE : celle du profil, puis son mode
      // (`modes_exercice`). Une seule valeur ; le moteur ne sait pas d'où elle vient.
      intention: intentionDeLExercice(slug),
      // §9.17 — la réponse à la carte du lest (profil), et ce que le catalogue
      // sait livrer : sans version lestée, la carte ne se pose pas.
      lestReponse: lestReponseDeLExercice(slug),
      lestPossible: exo ? Modele.lesteDe(index, slug) !== null : false,
      // 175 (MOTEUR §10 bis) — la visée acceptée (le levier « Viser N reps »), qui rallonge le plafond de la plus lourde.
      rallonge: rallongeDe(slug),
      // 175 (MOTEUR §9.7) — l'exercice est-il une ISOLATION (la définition du moteur) ? Le plancher d'un gros cran ne descend
      // pas sous 8 reps.
      isolation: exo ? Moteur.estIsolation({ prim: exo.muscles_primaires || [], sec: exo.muscles_secondaires || [],
                                             stab: exo.muscles_stabilisateurs || [] }) === true : false,
      // §9.17 bis (127) — l'exercice est sur une échelle avec une marche à proposer : le fondement porte alors ses
      // deux dernières séances (`deuxSeances`), que lit la carte « marche suivante ».
      echelle: exo ? marcheAProposer(index, slug) !== null : false,
      // §8.4 — la version lestée part de l'exercice libre : le parent, à la
      // demande (le moteur ne le rejoue que pour une première fois lestée).
      libre: libreDuLeste ? function () {
        var px = index[libreDuLeste], pg = Modele.gabaritDe(px);
        return { groupes: faits.seancesDeLExercice(corpus(), libreDuLeste), etat: etatsExercices[libreDuLeste],
                 options: { mesure: pg.inconnue ? null : pg.mesure, equipement: Moteur.equipementEffectif(px),
                            reglage: Profil.rythmeDe(profil), correction: zoneDe(libreDuLeste) } };
      } : null,
      reglage: Profil.rythmeDe(profil),
      // 180 (C-F5, D3) — le débutant (`anciennete = moins_1_an`) : sa réserve basse (R < V) n'arrête pas la montée (le moteur).
      debutant: Profil.estDebutant(profil),
      // 191 — la prudence de montée (le plafond d'un saut ; « un cran à la fois »), au jour du calcul.
      prudence: Profil.prudenceDuProfil(profil, new Date(instant)),
      // 187 (A4) — l'exercice charge une zone à ménager (profil + la table du générateur) : aucune série lourde.
      menagee: Generateur.zonesQueChargeLExercice(slug, profil && profil.zones_a_menager).length > 0,
      // §9.1.1 — la zone choisie, ou `null`. Le mémo ne la porte pas dans
      // sa clé : `poserZone` le remet à zéro, et la synchronisation passe
      // par `recalculerEtats`, qui fait déjà de même.
      correction: zoneDe(slug),
      // 193-3 (MOTEUR §9.29) — LA ZONE QUE LA ROUTINE FIXE pour ce jour (`zone_plan` de l'exercice de la séance en cours, copiée de
      // la ligne de routine au démarrage, ou réécrite par « Juste pour aujourd'hui »), `null` : Automatique. Elle passe avant la
      // correction de l'exercice et le bloc ; `zonesDeRoutine` dit la zone de la ligne de chaque routine pour cet exercice
      // (l'appartenance d'une séance passée, C1).
      zonePlan: zonePlanDe(slug),
      zonePlanOrigine: zonePlanOrigineDe(slug),
      zonesDeRoutine: zonePlanDe(slug) ? zonesDeRoutineDe(slug) : null,
      // §9.10 (53-2 bis, D1) — la ligne qui pose cette zone : son origine
      // fait dire « Nouveau bloc » au lieu de « Nouvelle zone ».
      ligneDeZone: ligneDeZoneDe(slug),
      // §12.9 (49-U13) — les séances SOUS CONSIGNE de l'exercice : celles
      // qui portent au moins un pari sur lui. Le compteur de stagnation ne
      // compte qu'elles ; les séances importées ou d'avant le coach n'en
      // portent aucun.
      seancesSousConsigne: seancesSousConsigne(slug),
      // Et l'historique des zones choisies : chaque séance passée se rejoue
      // avec la zone en vigueur ce jour-là, pas celle d'aujourd'hui.
      // §9.22 (53-2) — sans les lignes pas encore en vigueur (un bloc à venir).
      correctionsDeZone: zonesLues().filter(function (l) {
        return l && l.exercise_slug === slug && !(Date.parse(l.corrigee_a) > Date.parse(instant));
      }),
      // §14.4 (49-U14) — les semaines allégées acceptées : leurs séances ne
      // sont ni comptées ni jugées par le compteur.
      periodesAllegees: periodesAllegees(),
      // §14.7 (49-U17) — les périodes où une série de plus était active :
      // le niveau de ces séances se lit sur les séries de la routine.
      periodesSerieDePlus: periodesSerieDePlusDe(slug),
      // §7 octies — une séance terminée rouverte est une séance FAITE : le
      // moteur n'y prescrit rien, ni en-tête ni plan.
      edition: enEdition(),
      // §9.21 (52-1) — la charge de départ de la routine, la première fois. 132 : jamais sur un exercice noté par nom
      // (l'éditeur de routine n'a pas de colonne d'élastique ; une aide de départ en kg n'est pas un nom).
      depart: estSalleElastique(salleX) ? null : chargeDeDepartDe(slug),
      // MOTEUR §10 bis (108) — la salle déclarée pour cet exercice (barre fixe,
      // haltères), ou `null` : non renseignée, rien ne change. 132 — ou la liste de ses élastiques (§10 ter).
      salle: salleX,
      // 132 (ECRAN-SAISIE §3 ter.6, écran 4) — l'élastique de la dernière séance qui n'est plus dans la liste, ou `null`.
      elastiqueRetire: estSalleElastique(salleX) ? Profil.elastiqueRetireDe(salleX, faits.seancesDeLExercice(corpus(), slug)) : null
    };
  }

  // ── §9.13 bis (49-U1) — LE PLAN DE SÉANCE, UN SEUL COACH ─────────────────
  //
  // Un seul calcul (`THPlan.planDeSeance`) décide de tout ce que le coach dit
  // et fait dans la séance ; la grille, l'en-tête, le « Donc » du « Pourquoi »
  // et la phrase du coach le LISENT. Mémoïsé sur ses entrées : la séance (un
  // nouvel objet à chaque geste), les paris (un nouveau tableau à chaque
  // écriture), la version du mémo des consignes et le mode Édition.
  var planMemo = null;

  // §9.13 bis (49-U7) — LA GARDE DU COACH. Hors production (machine locale,
  // prévisualisation Cloudflare, `?garde=1`), chaque plan calculé passe les
  // invariants ; une violation s'écrit en console et un petit marqueur
  // apparaît. En production, `verifier` ne fait rien (`THPlan.creerGarde`).
  var garde = Plan.creerGarde({
    location: racine.location,
    stockage: (function () { try { return racine.localStorage; } catch (e) { return null; } })(),
    journal: racine.console,
    marquer: marquerGarde
  });
  // Le banc lit ce que la garde a vu (le nombre de plans vérifiés) ; rien
  // d'autre ne le relit.
  Plan.garde = garde;
  // 121 (audit du 16/10/2026, 05 #18) — LA GARDE DU SOCIAL : hors production, chaque lecture d'un autre compte (les
  // fonctions `social_*`, `guilde_*`, `groupe_*`) passe `Social.champsInterditsDans` ; une donnée interdite (poids de
  // corps, note, RPE, ressenti, douleur) est une violation S1 de la garde (console, marqueur, et le banc la voit).
  Donnees.inspecterLectures(garde.active ? function (nom, donnees) {
    var trouves = Social.champsInterditsDans(donnees);
    if (trouves.length) garde.signaler(['S1 — « ' + nom + ' » rend une donnée interdite : ' + trouves.join(', ')], { lecture: nom });
  } : null);
  // §14.4 (49-U14) — `?escalier=demo` se lit AU DÉMARRAGE, avant que le
  // routeur ne réécrive l'adresse ; il est ensuite retenu pour la session.
  try { demoEscalier(); } catch (e) { /* rien à retenir */ }

  // ══ L'OUTIL DE REJEU (développement seulement, diagnostic du 01/10/2026) ══
  //
  // `…/saisie?rejouer=<id de séance>`, LÀ OÙ LA GARDE EST ACTIVE — jamais en
  // production (`THRejeu.demande`). Il rejoue le plan de la séance à
  // l'ouverture, puis après chaque série validée (ordre réel de `validee_a`),
  // chaque réponse de l'escalier et chaque zone corrigée, et l'écrit en texte
  // (`rejeu.js`).
  //
  // ⚠️ IL PASSE PAR LES FONCTIONS MÊMES DE L'APP — `consigneDe`,
  // `entreesDuPlan`, `fantomeDe` —, sur un état « tel qu'à l'ouverture » posé
  // à la place de l'état courant le temps d'un calcul SYNCHRONE, puis rendu
  // (`finally`). Aucune attente entre les deux : aucun geste, aucune
  // synchronisation, aucun rendu ne voit l'état du rejeu. Et pendant ce calcul
  // (`rejeuEnCours`), rien ne s'écrit : ni consigne figée sur le disque
  // (`sauverConsignes`), ni la garde, ni `Plan.dernier`. La séance en cours,
  // s'il y en a une, n'est ni lue ni touchée.
  var rejeuEnCours = null;    // { instant } pendant un calcul de rejeu
  var rejeuDemande = null;    // l'identifiant lu au démarrage
  var rejeuSortie = null;     // le dernier texte rendu
  try { rejeuDemande = Rejeu ? Rejeu.demande(racine.location, garde.active) : null; } catch (e) { rejeuDemande = null; }

  var ROLE_DU_PARI_REJEU = { ligne: 'ligne', test: 'haut', coach: 'coach', retour: 'retour', elan: 'elan' };

  async function rejouerSeance(id) {
    var ligne = (local.seances || []).filter(function (s) { return s && s.id === id; })[0] || null;
    if (!ligne) {
      return 'Séance ' + id + ' introuvable sur cet appareil : la synchronisation est-elle finie ? ' +
        '(Seules les séances terminées se rejouent.)\n';
    }
    var notes = [];
    var parId = {}, serveur = 0, appareil = 0;
    try {
      (await Donnees.parisDeSeance(id)).forEach(function (l) {
        if (l && l.id && l.fondement && l.fondement.seance === id) { parId[l.id] = l; serveur++; }
      });
    } catch (e) {
      notes.push('les paris du serveur n’ont pas pu être lus (' + texteErreur(e) + ') : seuls ceux de l’appareil le sont');
    }
    (local.predictions || []).forEach(function (l) {
      if (!l || !l.id || !l.fondement || l.fondement.seance !== id) return;
      if (!parId[l.id]) appareil++;
      parId[l.id] = l;
    });
    var paris = Object.keys(parId).map(function (k) { return parId[k]; }).sort(function (a, b) {
      var ta = Date.parse(a.emise_a), tb = Date.parse(b.emise_a);
      return ta !== tb ? ta - tb : (a.id < b.id ? -1 : 1);
    });
    var routine = null;
    if (ligne.routine_id) {
      if (etatRoutines.code !== 'ok') await chargerRoutines().catch(function () { return false; });
      routine = (routines || []).filter(function (r) { return r && r.id === ligne.routine_id; })[0] || null;
    }
    return calculerRejeu(ligne, paris, routine, notes, { serveur: serveur, appareil: appareil });
  }

  // L'état d'UNE étape posé à la place de l'état courant, `fn` calculée, puis
  // tout rendu. Le mémo des consignes du rejeu survit d'une étape à l'autre
  // (`memo`) : la consigne se fige à l'ouverture, comme dans la séance.
  function avecEtatDeRejeu(e, fn) {
    var avant = { seance: seance, local: local, consignes: consignes, sauvees: consignesSauvees,
                  version: versionConsignes, phaseGelee: phaseGelee, objectifGele: objectifGele,
                  prioritesGelees: prioritesGelees, volumeGele: volumeGele, reserveGelee: reserveGelee,
                  constats: constats, planMemo: planMemo, etats: etatsExercices, dernier: Plan.dernier };
    seance = e.seance; local = e.local;
    consignes = e.memo.consignes; consignesSauvees = null; versionConsignes = e.memo.version;
    phaseGelee = e.memo.phaseGelee; objectifGele = e.memo.objectifGele;
    prioritesGelees = e.memo.prioritesGelees; volumeGele = e.memo.volumeGele; reserveGelee = e.memo.reserveGelee || null; constats = null;
    planMemo = null; etatsExercices = e.etats;
    rejeuEnCours = { instant: e.instant };
    try {
      return fn();
    } finally {
      e.memo.consignes = consignes; e.memo.version = versionConsignes;
      e.memo.phaseGelee = phaseGelee; e.memo.objectifGele = objectifGele;
      e.memo.prioritesGelees = prioritesGelees; e.memo.volumeGele = volumeGele; e.memo.reserveGelee = reserveGelee;
      seance = avant.seance; local = avant.local; consignes = avant.consignes;
      consignesSauvees = avant.sauvees; versionConsignes = avant.version;
      phaseGelee = avant.phaseGelee; objectifGele = avant.objectifGele;
      prioritesGelees = avant.prioritesGelees; volumeGele = avant.volumeGele; reserveGelee = avant.reserveGelee; constats = avant.constats;
      planMemo = avant.planMemo; etatsExercices = avant.etats; Plan.dernier = avant.dernier;
      rejeuEnCours = null;
    }
  }

  function memeNombre(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return a === b || (a == null && b == null);
    return Number(a) === Number(b);
  }

  function calculerRejeu(ligne, paris, routine, notes, lus) {
    var id = ligne.id;
    var enBase = Seance.reprendre(ligne, Modele.construireBlocs(seriesDe(id), local.exercices));
    // La séance de l'ouverture : la routine (les lignes jamais validées
    // reconstruites, vides), puis ce que la base y ajoute (`THRejeu.structure`).
    var pres = {};
    var reconstruites = [];
    var finale = Object.assign({}, enBase, { statut: Seance.EN_COURS, fin: null,
      exercices: Rejeu.structure(enBase.exercices, routine ? { exercices: routine.exercices } : null).map(function (x) {
        var exo = x.iExo === null ? null : enBase.exercices[x.iExo];
        var parId = {};
        ((exo && exo.series) || []).forEach(function (s) { parId[s.id] = s; });
        return Object.assign({ exercise_slug: x.exercise_slug, routine_exercise_id: null, repos_cible_s: null,
                               note: null, groupe_superset: null }, exo || {}, {
          series: x.lignes.map(function (l) {
            pres[l.id] = l;
            if (l.reconstruite) reconstruites.push(x.exercise_slug);
            return parId[l.id] ? parId[l.id] : Object.assign(Seance.serieVide(l.id), { type_serie: l.type_serie });
          })
        });
      })
    });
    var debutMs = Date.parse(ligne.debut);
    var finMs = Date.parse(ligne.fin || '');
    if (!isFinite(finMs)) finMs = Infinity;
    var index = catalogueIndexe();
    var nomDe = function (slug) { return index[slug] && index[slug].nom ? index[slug].nom : slug; };

    // ── L'historique, tel que l'app l'avait à l'ouverture ──
    var seances = (local.seances || []).filter(function (s) { return s && s.id !== id && Date.parse(s.debut) < debutMs; });
    var ids = {};
    seances.forEach(function (s) { ids[s.id] = true; });
    var series = (local.series || []).filter(function (s) { return s && ids[s.session_id]; });
    var parSeance = new Map();
    series.forEach(function (s) {
      var l = parSeance.get(s.session_id);
      if (l) l.push(s); else parSeance.set(s.session_id, [s]);
    });
    var sousConsigne = {};
    Object.keys(local.sousConsigne || {}).forEach(function (slug) {
      var l = (local.sousConsigne[slug] || []).filter(function (sid) { return ids[sid]; });
      if (l.length) sousConsigne[slug] = l;
    });
    var dAvant = function (l) {
      var sid = l && (l.session_id || (l.fondement && l.fondement.seance));
      return !!sid && !!ids[sid];
    };
    var parisLegers = (local.parisLegers || []).filter(dAvant);
    var escalierAvant = (local.escalier || []).filter(dAvant);
    var predictionsAvant = (local.predictions || []).filter(dAvant);
    var etats = {};
    try { etats = Palier.etatsExercices(Palier.seanceExercices(series)); } catch (e) { etats = {}; }

    // ── Ce que les paris de la séance disent de l'ouverture ──
    var deConsigne = paris.filter(function (l) { return l.module !== Moteur.MODULE_ESCALIER && l.exercise_slug; });
    var phaseLue = null;
    deConsigne.forEach(function (l) { if (!phaseLue && l.fondement && l.fondement.phase) phaseLue = l.fondement.phase; });
    // L'objectif gelé (60-2b) : la CLÉ présente, `null` compris (« sans réponse ») ; un pari
    // d'avant 60-2b n'en porte pas — alors celui du profil actuel, et une note.
    var objectifLu, objectifTrouve = false;
    deConsigne.forEach(function (l) {
      if (!objectifTrouve && l.fondement && Object.prototype.hasOwnProperty.call(l.fondement, 'objectif')) {
        objectifLu = l.fondement.objectif; objectifTrouve = true;
      }
    });
    var reglageLu = null;
    deConsigne.forEach(function (l) { if (!reglageLu && l.fondement && l.fondement.reglage) reglageLu = l.fondement.reglage; });

    // ── Les événements, dans l'ordre réel ──
    var evts = [];
    Rejeu.etapes(finale.exercices).forEach(function (v) { evts.push({ a: v.a, ordre: 2, quoi: 'serie', v: v }); });
    paris.filter(function (l) { return l.module === Moteur.MODULE_ESCALIER && l.emise_a; }).forEach(function (l) {
      evts.push({ a: l.emise_a, ordre: 1, quoi: 'escalier', pari: l });
    });
    zonesLues().forEach(function (z) {
      var t = z && Date.parse(z.corrigee_a);
      if (isFinite(t) && t > debutMs && t <= finMs) evts.push({ a: z.corrigee_a, ordre: 0, quoi: 'zone', zone: z });
    });
    // §9.17 — le mode d'un exercice, choisi pendant la séance : même événement.
    (local.modes || []).forEach(function (m) {
      var t = m && Date.parse(m.choisi_a);
      if (isFinite(t) && t > debutMs && t <= finMs) evts.push({ a: m.choisi_a, ordre: 0, quoi: 'mode', mode: m });
    });
    evts.sort(function (x, y) {
      var tx = Date.parse(x.a), ty = Date.parse(y.a);
      return tx !== ty ? tx - ty : x.ordre - y.ordre;
    });

    var ajoutees = [];
    finale.exercices.forEach(function (exo) {
      (exo.series || []).forEach(function (s, i) {
        if (pres[s.id] && !pres[s.id].ouverture) ajoutees.push(nomDe(exo.exercise_slug) + ' #' + (i + 1));
      });
    });

    // ── La séance à une étape : les séries validées (leurs valeurs), et les
    // autres lignes de l'ouverture, VIDES (la base ne garde pas une saisie non
    // validée) ──
    var seanceA = function (validees) {
      var exos = finale.exercices.map(function (exo) {
        var siennes = (exo.series || []).filter(function (s) {
          return validees[s.id] || (pres[s.id] && pres[s.id].ouverture);
        }).map(function (s) {
          var p = pres[s.id] || {};
          var b = Object.assign({}, s, { reps_visees: p.reps_visees === undefined ? null : p.reps_visees,
                                         charge_cible_kg: p.charge_cible_kg === undefined ? null : p.charge_cible_kg });
          if (validees[s.id]) return b;
          // Prompt 131 — toutes les colonnes de mesure (D+ et étages compris), par la table des champs.
          Modele.colonnesDeSerie().forEach(function (c) { b[c] = null; });
          return Object.assign(b, { rpe: null, ressenti: null, validee_a: null, repos_s: null, source: null });
        });
        return Object.assign({}, exo, { series: siennes });
      }).filter(function (exo) { return exo.series.length; });
      return Object.assign({}, finale, { exercices: exos });
    };

    var memo = { consignes: null, version: 0, volumeGele: null, prioritesGelees: null,
                 phaseGelee: phaseLue ? { seanceId: id, phase: phaseLue } : null,
                 objectifGele: objectifTrouve ? { seanceId: id, objectif: objectifLu } : null };
    var validees = {};
    var zonesVues = {};
    var resultat = [];
    var precedent = null;
    for (var k = 0; k <= evts.length; k++) {
      var ev = k === 0 ? null : evts[k - 1];
      if (ev && ev.quoi === 'serie') validees[ev.v.id] = true;
      var t = ev ? ev.a : ligne.debut;
      var tMs = Date.parse(t);
      var loc = {
        seances: seances, series: series, exercices: local.exercices, pesees: local.pesees,
        zones: zonesLues().filter(function (z) { return z && Date.parse(z.corrigee_a) <= tMs; }),
        modes: (local.modes || []).filter(function (m) { return m && Date.parse(m.choisi_a) <= tMs; }),
        // Les paris de la séance déjà écrits à cet instant : celui d'une série
        // validée (sa série observée) ; sans série observée, par son heure
        // d'émission (une réponse de l'escalier, un pari dont l'observation n'a
        // pas été écrite — une seconde de marge après la validation).
        predictions: predictionsAvant.concat(paris.filter(function (l) {
          if (l.set_observe) return !!validees[l.set_observe];
          return Date.parse(l.emise_a) <= tMs + (ev && ev.quoi === 'serie' ? 1000 : 0);
        })),
        sousConsigne: sousConsigne, parisLegers: parisLegers, escalier: escalierAvant, parSeance: parSeance
      };
      var etape = avecEtatDeRejeu({ seance: seanceA(validees), local: loc, memo: memo, etats: etats, instant: t },
        function () {
          // Une zone corrigée en cours de séance : son exercice se recalcule,
          // lui seul (`poserZone`).
          if (consignes && consignes.parSlug) {
            Object.keys(consignes.parSlug).forEach(function (slug) {
              if (Object.prototype.hasOwnProperty.call(zonesVues, slug) && zonesVues[slug] !== zoneDe(slug) + '|' + modeDe(slug)) {
                delete consignes.parSlug[slug];
                versionConsignes++;
              }
            });
          }
          var entrees = entreesDuPlan();
          var plan = Plan.planDeSeance(entrees);
          var verification = Plan.verifierPlan(plan, entrees, precedent ? precedent.plan : null);
          var occ = {};
          var blocs = plan.exercices.map(function (x, i) {
            var exo = seance.exercices[i];
            occ[x.slug] = (occ[x.slug] || 0) + 1;
            zonesVues[x.slug] = zoneDe(x.slug) + '|' + modeDe(x.slug);
            var fantomes = {};
            x.lignes.forEach(function (l) { if (!l.validee) fantomes[l.iSerie] = fantomeDe(i, l.iSerie); });
            var controles = controlesRejeu(x, exo, ev, precedent, paris, k === 0);
            return { cle: x.slug + '#' + occ[x.slug], nom: nomDe(x.slug),
                     texte: Rejeu.texteExercice(x, { nom: nomDe(x.slug), series: exo.series, fantomes: fantomes, controles: controles }) };
          });
          return { plan: plan, verification: verification, blocs: blocs };
        });
      etape.titre = titreEtape(k, ev, t, finale, nomDe);
      resultat.push(etape);
      precedent = etape;
    }

    var entete = [
      finale.exercices.length + ' exercice(s) · ' + seriesDe(id).length + ' série(s) en base · ' +
        Rejeu.etapes(finale.exercices).length + ' validée(s) · ' + paris.length + ' pari(s) (' +
        lus.serveur + ' du serveur, ' + lus.appareil + ' de l’appareil seulement)',
      'historique lu : ' + seances.length + ' séance(s) terminée(s) avant le début, ' + series.length + ' série(s)',
      'phase gelée : ' + (phaseLue ? phaseLue + ' (lue dans les paris)' : (Profil.phaseDe(profil) + ' (profil actuel : aucun pari ne la porte)')),
      'objectif gelé : ' + (objectifTrouve ? (objectifLu || 'sans réponse') + ' (lu dans les paris)' : ((Profil.objectifDe(profil) || 'sans réponse') + ' (profil actuel : aucun pari ne le porte)')),
      'priorités : ' + (Profil.prioritesDe(profil).join(', ') || 'aucune') + ' (profil actuel : aucun pari ne les porte)',
      'rythme : ' + Profil.rythmeDe(profil) + ' (profil actuel)' +
        (reglageLu ? (reglageLu === Profil.rythmeDe(profil) ? ' = celui des paris ✓' : ' ≠ celui des paris (' + reglageLu + ') ✗') : ''),
      'intention : ' + ((profil && profil.intention) || '–') + ' (profil actuel)',
      'lest : ' + (lestReponseDe() || '–') + ' (profil actuel)',
      'routine : ' + (routine ? '« ' + (routine.nom || '?') + ' » (sa structure ACTUELLE)' : (ligne.routine_id ? 'introuvable' : 'aucune'))
    ];
    notes.push('l’historique est celui du cache d’aujourd’hui, coupé au début de la séance : une séance antérieure corrigée depuis l’est aussi ici');
    if (routine) {
      notes.push('les lignes présentes à l’ouverture viennent de la routine actuelle ; les autres (' +
        (ajoutees.length ? ajoutees.join(', ') : 'aucune') + ') n’apparaissent qu’à leur validation, en fin d’exercice — l’instant et la place d’un ajout ne sont pas en base');
      var parExo = {};
      reconstruites.forEach(function (slug) { parExo[slug] = (parExo[slug] || 0) + 1; });
      var dites = Object.keys(parExo).map(function (slug) { return nomDe(slug) + ' × ' + parExo[slug]; });
      notes.push('lignes de la routine jamais validées, reconstruites vides (elles ont pu être retirées pendant la séance) : ' +
        (dites.length ? dites.join(', ') : 'aucune'));
    } else {
      notes.push('sans routine, toutes les séries en base sont présentes dès l’ouverture');
    }
    notes.push('une ligne jamais validée n’est pas en base : elle manque au rejeu');
    notes.push('« pré-rempli » est le fantôme recalculé ; une valeur tapée puis effacée avant validation ne se voit pas');
    notes.push('les « Non merci » aux chauffes vivent sur l’appareil de la séance : supposés aucun');
    if (!phaseLue) notes.push('la phase est celle du profil actuel, pas celle gelée ce jour-là');
    if (!objectifTrouve) notes.push('l’objectif est celui du profil actuel, pas celui gelé ce jour-là');
    notes.push('le rythme et l’intention sont ceux du profil actuel');
    return Rejeu.texte({ seance: { id: id, titre: ligne.titre, debut: ligne.debut, fin: ligne.fin },
                         entete: entete, notes: notes, etapes: resultat });
  }

  function titreEtape(k, ev, t, finale, nomDe) {
    if (!ev) return 'Étape 0 — à l’ouverture (' + Rejeu.heure(t) + ')';
    var tete = 'Étape ' + k + ' — ' + Rejeu.heure(t) + ' — ';
    if (ev.quoi === 'serie') {
      var exo = finale.exercices[ev.v.iExo];
      var s = exo.series[ev.v.iSerie];
      return tete + nomDe(exo.exercise_slug) + ' #' + (ev.v.iSerie + 1) + ' validée : ' +
        Modele.nombre(s.charge_kg) + ' × ' + Modele.nombre(s.reps) + ' (' + Seance.typeDe(s) + ')';
    }
    if (ev.quoi === 'escalier') {
      var f = ev.pari.fondement || {};
      return tete + 'escalier : ' + (f.marche || '?') + ' « ' + (f.reponse || '?') + ' »' +
        (f.exercice ? ' (' + nomDe(f.exercice) + ')' : '');
    }
    if (ev.quoi === 'mode') {
      return tete + 'mode de ' + nomDe(ev.mode.exercise_slug) + ' choisi → ' + (ev.mode.mode || '?');
    }
    return tete + 'zone de ' + nomDe(ev.zone.exercise_slug) + ' corrigée → ' + (ev.zone.zone || 'déduite');
  }

  // Ce que les paris disent, en face de ce que le rejeu affiche : à
  // l'ouverture, la consigne figée et le compteur ; à chaque validation, la
  // ligne affichée JUSTE AVANT (étape précédente) et le pari écrit.
  function controlesRejeu(x, exo, ev, precedent, paris, ouverture) {
    var c = [];
    var siens = paris.filter(function (l) {
      return l.exercise_slug === x.slug && l.module !== Moteur.MODULE_ESCALIER && l.fondement;
    });
    if (ouverture && x.consigne && siens.length) {
      var f = siens[0].fondement;
      var ok = f.etat === x.consigne.etat && (f.zone || null) === (x.consigne.zone || null) &&
        memeNombre(f.palier, x.consigne.palier) && memeNombre(f.niveau, x.consigne.niveau);
      c.push('contrôle consigne (1er pari) : ' + f.etat + ' · zone ' + (f.zone || '–') + ' · palier ' +
        Modele.nombre(f.palier) + ' · niveau ' + Modele.nombre(f.niveau) + (ok ? ' ✓' : ' ✗ ÉCART avec le rejeu'));
      if (f.compteur !== undefined) {
        var cr = x.compteur ? x.compteur.compteur : null;
        c.push('contrôle compteur : pari ' + f.compteur + ' · rejeu ' + (cr === null ? '–' : cr) +
          (memeNombre(f.compteur, cr) ? ' ✓' : ' ✗'));
      }
    }
    if (!ev || ev.quoi !== 'serie') return c;
    var s = null;
    (exo.series || []).forEach(function (y) { if (y.id === ev.v.id) s = y; });
    if (!s) return c;
    var avant = null;
    if (precedent) {
      precedent.plan.exercices.forEach(function (px) {
        (px.lignes || []).forEach(function (l) { if (l.id === s.id) avant = l; });
      });
    }
    var leurs = siens.filter(function (l) { return l.set_observe === s.id; });
    if (!leurs.length && avant && avant.role !== 'hors') {
      leurs = siens.filter(function (l) { return !l.set_observe && Number(l.fondement.rang) === Number(avant.rang); });
    }
    var vu = avant ? (avant.role === 'hors' ? 'hors plan' :
      avant.role + ' ' + Modele.nombre(avant.charge) + ' × ' + Modele.nombre(avant.vise)) : 'absente (ligne ajoutée)';
    if (!leurs.length) {
      c.push('contrôle #' + (ev.v.iSerie + 1) + ' : ligne affichée juste avant : ' + vu + ' · aucun pari en base' +
        (avant && avant.role !== 'hors' ? ' ✗ (ligne couverte sans pari)' : ''));
      return c;
    }
    leurs.forEach(function (l) {
      var f = l.fondement;
      var rev = Number(f.revision) || 0;
      var ok = !!avant && avant.role !== 'hors' && ROLE_DU_PARI_REJEU[avant.role] === f.role &&
        memeNombre(f.charge, avant.charge) && (rev > 0 || memeNombre(l.valeur_predite, avant.vise));
      c.push('contrôle #' + (ev.v.iSerie + 1) + ' : pari en base ' + f.role + ' ' + Modele.nombre(f.charge) + ' × ' +
        Modele.nombre(l.valeur_predite) + (rev ? ' (révision ' + rev + ')' : '') + ' · ligne affichée juste avant : ' + vu +
        (ok ? ' ✓' : ' ✗ ÉCART'));
    });
    return c;
  }

  // La vue : un texte brut, « Copier », « Rejouer », « Fermer ». Rien d'autre.
  var rejeuBranche = false;
  async function ouvrirRejeu() {
    var vue = $('rejeu'), pre = $('rejeu-sortie');
    if (!rejeuDemande || !vue || !pre) return;
    if (!rejeuBranche) {
      rejeuBranche = true;
      $('rejeu-copier').addEventListener('click', function () {
        var t = rejeuSortie || pre.textContent || '';
        var dit = function (m) { $('rejeu-etat').textContent = m; };
        try {
          racine.navigator.clipboard.writeText(t).then(function () { dit('Copié.'); },
            function () { dit('Copie refusée : sélectionne le texte.'); });
        } catch (e) { dit('Copie indisponible : sélectionne le texte.'); }
      });
      $('rejeu-relancer').addEventListener('click', function () { ouvrirRejeu(); });
      $('rejeu-fermer').addEventListener('click', function () { vue.hidden = true; });
    }
    vue.hidden = false;
    $('rejeu-etat').textContent = 'Rejeu en cours…';
    var texte;
    try { texte = await rejouerSeance(rejeuDemande); }
    catch (e) { texte = 'Rejeu impossible : ' + texteErreur(e) + '\n' + ((e && e.stack) || '') + '\n'; }
    rejeuSortie = texte;
    pre.textContent = texte;
    $('rejeu-etat').textContent = '';
  }

  function marquerGarde(violations) {
    var doc = racine.document;
    if (!doc || !doc.body) return;
    var m = doc.getElementById('garde-coach');
    if (!m) {
      m = doc.createElement('button');
      m.id = 'garde-coach';
      m.type = 'button';
      m.className = 'garde-coach';
      m.addEventListener('click', function () {
        if (racine.console) racine.console.error('[garde du coach]', m.violations || []);
      });
      doc.body.appendChild(m);
    }
    m.violations = violations;
    var invariants = [];
    violations.forEach(function (v) {
      var i = String(v).split(' — ')[0];
      if (invariants.indexOf(i) < 0) invariants.push(i);
    });
    m.textContent = '⚠ ' + invariants.join(' ') + ' (' + violations.length + ')';
    m.title = violations[violations.length - 1] || '';
  }

  var catalogueMemo = null;
  function catalogueIndexe() {
    if (!catalogueMemo || catalogueMemo.source !== local.exercices) {
      catalogueMemo = { source: local.exercices, index: Modele.indexerExercices(local.exercices || []) };
    }
    return catalogueMemo.index;
  }

  // ── MOTEUR §9.15.2 (49-U10) — LA MÉMOIRE DES « NON MERCI » ───────────────
  //
  // ⚠️ SUR L'APPAREIL SEULEMENT, aucune colonne en base : `localStorage`,
  // clé `th-v2-refus-chauffes`, `{ [slug]: { n, seance } }`. La règle
  // (un refus par séance, trois d'affilée, « Ajouter » remet à zéro) vit dans
  // `THPlan` (fonctions pures) ; ici, seulement la lecture et l'écriture. Un
  // autre appareil repart de zéro : assumé, rien n'est perdu que trois « Non
  // merci ».
  var CLE_REFUS_CHAUFFES = 'th-v2-refus-chauffes';
  var refusChauffes = null;   // l'objet lu, remplacé (jamais modifié) à chaque écriture

  function lireRefusChauffes() {
    if (refusChauffes) return refusChauffes;
    var lu = null;
    try { lu = JSON.parse(racine.localStorage.getItem(CLE_REFUS_CHAUFFES) || 'null'); }
    catch (e) { lu = null; }
    refusChauffes = lu && typeof lu === 'object' ? lu : {};
    return refusChauffes;
  }

  function ecrireRefusChauffes(r) {
    refusChauffes = r;
    try { racine.localStorage.setItem(CLE_REFUS_CHAUFFES, JSON.stringify(r)); }
    catch (e) { /* stockage indisponible : la mémoire vit pour la session */ }
  }

  function refusChauffesDe(seanceId) { return Plan.refusChauffesDe(lireRefusChauffes(), seanceId); }
  function refuserChauffes(slug) { ecrireRefusChauffes(Plan.refuserChauffes(lireRefusChauffes(), slug, seance.id)); }
  function accepterChauffes(slug) { ecrireRefusChauffes(Plan.accepterChauffes(lireRefusChauffes(), slug)); }

  // Le plan de l'exercice `iExo`, avec ou sans consigne : les chauffes et la
  // dégressive existent aussi sans elle (§9.15).
  function planDeLExercice(iExo) {
    var p = planActuel();
    return p ? p.exercices[iExo] || null : null;
  }

  // Les entrées du plan de la séance ouverte. Les consignes et les suites se
  // lisent D'ABORD : leur mémo peut changer `versionConsignes`.
  function chutesDeRepsDeLaSeance(exos) {
    var sortie = {}, c = corpus();
    (exos || []).forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (slug && !Object.prototype.hasOwnProperty.call(sortie, slug)) sortie[slug] = faits.chutesDeReps(c, slug, Moteur.SEANCES_DE_CHUTE);
    });
    return sortie;
  }

  // 193-1 (MOTEUR §9.28) — LES RECULS DE CHAQUE EXERCICE de la séance qui en porte : la dernière séance de l'exercice qui avait des
  // reculs (`Seance.precedentAReculs`) et la cible de reps de CETTE séance — celle des reculs de sa routine (`routine_id`) quand
  // elle est chargée et les porte encore, sinon `null` (le plan prend alors celle d'aujourd'hui : une approximation, la routine a pu
  // changer depuis). Un fait lu sur l'historique ; le plan décide de l'écart.
  function reculsDeLaSeance(exos) {
    var sortie = {};
    (exos || []).forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (!slug || Object.prototype.hasOwnProperty.call(sortie, slug)) return;
      if (!(x.series || []).some(function (s) { return Modele.estRecul(s); })) return;
      var liste = Seance.seancesAReculs(slug, local.seances, seriesDe, seance ? seance.id : null, 12).map(function (prec) {
        var cible = null;
        var rt = prec.routine_id ? (routines || []).filter(function (r) { return r && r.id === prec.routine_id; })[0] : null;
        var dans = rt ? (rt.exercices || []).filter(function (e) { return e && e.exercise_slug === slug; })[0] : null;
        ((dans && dans.series) || []).forEach(function (r) {
          var v = r && r.type_serie === 'recul' ? Number(r.reps) : NaN;
          if (cible === null && isFinite(v) && v >= 1) cible = v;
        });
        return Object.assign({}, prec, { cible: cible });
      });
      if (!liste.length) return;
      // 193-5 — la plus récente en tête, et toutes derrière (`historique`) : l'écart de la 193-1 et la correction du max du jour y lisent.
      sortie[slug] = Object.assign({}, liste[0], { historique: liste });
    });
    return sortie;
  }

  function entreesDuPlan() {
    var edition = enEdition();
    var exos = seance.exercices || [];
    var cs = {};
    var suites = {};
    var precedents = {};
    exos.forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (slug && !Object.prototype.hasOwnProperty.call(cs, slug)) {
        cs[slug] = consigneDe(slug);
        suites[slug] = cs[slug] ? suiteDe(slug) : null;
        // PR 3 (relevé du 01/10) — la dernière séance de l'exercice : le plan
        // pré-remplit TOUTES les lignes, celles qu'il ne couvre pas comprises.
        precedents[slug] = precedentDe(slug);
      }
    });
    // §9.15 (49-U10) — le catalogue des exercices de la séance (matériel,
    // muscles primaires) et les propositions de chauffes retirées.
    var catalogue = {};
    var index = catalogueIndexe();
    exos.forEach(function (x) {
      var slug = x && x.exercise_slug;
      var f = slug && index[slug];
      if (f && !catalogue[slug]) {
        var gc = Modele.gabaritDe(f);
        catalogue[slug] = { equipement: Moteur.equipementEffectif(f) || null,
                            // §9.20 — le nom, pour la carte de reprise.
                            nom: f.nom || slug,
                            muscles_primaires: (f.muscles_primaires || []).slice(),
                            // §14 (111) — la classe de l'exercice (`estPolyarticulaire`,
                            // lue par le plan) : la dégressive proposée, en isolation seulement.
                            muscles_secondaires: (f.muscles_secondaires || []).slice(),
                            muscles_stabilisateurs: (f.muscles_stabilisateurs || []).slice(),
                            // §9.17 — la mesure (le plan la porte, I13/I28 la lisent) et
                            // la version lestée (la carte du lest ne promet que ce qu'elle livre).
                            mesure: gc.inconnue ? null : (estSalleElastique(Profil.salleDeLExercice(profil, slug, index))
                              ? 'charge_reps' : gc.mesure),
                            leste: Modele.lesteDe(index, slug),
                            // 175 (MOTEUR §9.17 bis) — la variante sans matériel que la carte du lest propose avec le lest.
                            variante: varianteDe(index, slug),
                            // MOTEUR §10 bis (108) — la salle déclarée (chauffes et
                            // dégressive d'un exercice sans consigne), ou `null`.
                            salle: Profil.salleDeLExercice(profil, slug, index) };
      }
    });
    var modes = {};
    exos.forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (slug && !Object.prototype.hasOwnProperty.call(modes, slug)) modes[slug] = modeDe(slug);
    });
    // §14.4 (49-U14) — la démonstration ne touche qu'aux ENTRÉES (une copie).
    if (demoEscalier()) cs = consignesDeDemo(cs);
    // MOTEUR §10 bis (113) — la salle inventée de la démonstration du plafond (chauffes, dégressive, I46, I47).
    if (demoModeEscalier() === 'plafond' && demoPlafond && catalogue[demoPlafond.slug]) {
      catalogue[demoPlafond.slug] = Object.assign({}, catalogue[demoPlafond.slug], { salle: demoPlafond.salle });
    }
    // §9.17 bis (127) — L'ÉCHELLE : pour chaque exercice qui a une marche à proposer, la marche (catalogue), le nom
    // et la nature de sa cible, l'aide, et la date de la dernière séance de la cible (`faits.datesDesExercices`).
    var echelles = {};
    var datesFaites = null;
    exos.forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (!slug || Object.prototype.hasOwnProperty.call(echelles, slug) || !index[slug]) return;
      var m = marcheAProposer(index, slug);
      if (!m) return;
      if (datesFaites === null) datesFaites = faits.datesDesExercices(corpus());
      var c = index[m.cible[0]] || {};
      echelles[slug] = { marche: m, nomCible: c.nom || m.cible[0], aide: index[slug].charge === 'assistance',
                         cibleHabilete: c.nature ? c.nature === 'habilete' : c.habilete === true,
                         cibleFaiteLe: datesFaites[m.cible[0]] || null };
    });
    // 149 (MOTEUR §9.17 ter) — LES FIGURES : pour chaque exercice d'une échelle de figures (marches en secondes, lues
    // au catalogue), la tenue max de chaque séance faite (`faits.tenuesDeLExercice`, la plus récente en dernier), le nom
    // de la marche d'en dessous et le seuil de la marche. Le plan décide ; l'app donne les faits.
    var figures = {};
    exos.forEach(function (x) {
      var slug = x && x.exercise_slug;
      if (!slug || Object.prototype.hasOwnProperty.call(figures, slug) || !index[slug] || !Modele.estUneFigure(index, slug)) return;
      var dessous = Modele.marcheDEnDessous(index, slug);
      figures[slug] = { tenues: faits.tenuesDeLExercice(corpus(), slug).map(function (t) { return t.max; }),
                        dessous: dessous ? (dessous.nom || dessous.slug) : null, seuil: Modele.seuilDeLaMarche(index[slug]) };
    });
    var lestPlan = lestReponseDe();
    if (demoModeEscalier() === 'lest') {
      lestPlan = demoLest;
      // §9.17 — l'exercice de la démonstration : une copie de sa fiche, en `reps`,
      // avec une version lestée inventée (la carte ne promet que ce qu'elle livre).
      if (demoLestSlug && catalogue[demoLestSlug]) {
        catalogue[demoLestSlug] = Object.assign({}, catalogue[demoLestSlug],
          { mesure: 'reps', equipement: null, leste: 'demo-leste' });
      }
    }
    return {
      seance: { id: seance.id, debut: seance.debut, edition: edition, exercices: exos,
                // §9.20 — les choix de la carte de reprise, dans le brouillon.
                reprises: seance.reprises || null },
      consignes: cs,
      // MOTEUR §9.16 — la phase GELÉE de la séance (lue après les consignes :
      // elle se fige avec elles).
      phase: phaseDeLaSeance(),
      // MOTEUR §9.16 (60-2b) — l'objectif GELÉ, avec la phase (I40).
      objectif: objectifDeLaSeance(),
      // MOTEUR §14.6 (60-2b) — les priorités GELÉES, avec la phase.
      priorites: prioritesDeLaSeance(),
      // MOTEUR §14 (111) — le débutant GELÉ, avec la phase.
      debutant: debutantDeLaSeance(),
      // 191 — la prudence de montée GELÉE, avec le débutant (I71, I73, le calage).
      prudence: prudenceDeLaSeance(),
      // 187 (MOTEUR §9.21 bis) — « Ta charge habituelle ? » : la réponse de la séance, par exercice (un nombre, ou 0).
      habituelles: seance.habituelles || null,
      // 187 (A4) — les zones à ménager que charge chaque exercice de la séance, et la zone que la personne a choisie.
      zonesMenagees: zonesMenageesDeLaSeance(exos),
      // MOTEUR §14.6 (49-U16) — la règle de volume, gelée pour la séance.
      volume: volumeDeDemo(volumeDeLaSeance(), catalogue),
      catalogue: catalogue,
      // Le rejeu (développement) : les « Non merci » vivent sur l'appareil de
      // la séance, pas en base — supposés aucun, et la sortie le dit.
      refusChauffes: rejeuEnCours ? {} : refusChauffesDe(seance.id),
      reglage: Profil.rythmeDe(profil),
      // §9.17 — ce que le plan porte pour qu'on puisse VÉRIFIER (I13, I28–I31) :
      // l'intention du profil, le mode de chaque exercice, la réponse du lest.
      intention: profil ? profil.intention : null,
      modes: modes,
      lestReponse: lestPlan,
      // MOTEUR §9.17 bis (127) — l'échelle : les marches à proposer et les réponses du profil.
      echelles: echelles,
      figures: figures,
      marcheReponses: marcheReponsesDe(),
      // MOTEUR §17.2 bis (78) — le passé de chaque exercice, figé : le plan décide de la question de réserve.
      reserve: reserveDeLaSeance(),
      // MOTEUR §9.22 (53-2) — les blocs des programmes (la décharge planifiée,
      // « Changer de schéma ») et les lignes de zone (I36, I37).
      programme: { blocs: local.blocs || [], lignes: local.zones || [] },
      // 165 (I60) — les périodes allégées : le plan vérifie qu'aucune consigne n'en cite une séance comme référence.
      periodesAllegees: periodesAllegees(),
      suites: suites,
      precedents: precedents,
      // 193-1 — la dernière séance à reculs de chaque exercice qui en porte, et la cible de reps de sa routine.
      reculs: reculsDeLaSeance(exos),
      // 193-6 (MOTEUR §9.30) — « J'ai mal » récent de chaque exercice (42 jours, un fait de `faits.js`) et les décisions déjà prises sur la
      // carte « Dernière série au max ? » (`profiles.cartes_semaine.au_max`, par exercice) : le plan décide, il ne relit rien.
      douleurs: faits.douleursParExercice(corpus(), seance.debut),
      // 202 (MOTEUR §9.20) — la douleur répétée : le nombre de séances avec douleur de chaque exercice (42 jours, un fait de `faits.js`)
      // et, pour ceux qui en ont 2 ou plus, le premier frère proposé : le plan décide de la carte de reprise, il ne relit rien.
      nbDouleurs: nbDouleursDesEntrees(),
      freresDeReprise: freresDeRepriseDesEntrees(),
      // 193-6b — les jours d'échec de chaque barre dans les 6 jours précédents (un fait de `faits.js`, par famille de barre).
      echecsDeBarre: faits.echecsDeBarre(corpus(), seance.debut),
      auMaxReponses: (reponsesDesCartes().au_max && typeof reponsesDesCartes().au_max === 'object') ? reponsesDesCartes().au_max : {},
      // 193-4 (MOTEUR §9.32) — la semaine de test (`profiles.cartes_semaine.test`) et le max estimé d'avant, par exercice : le plan décide.
      semaineDeTest: semaineDeTestDesEntrees(exos),
      // 188-2 (I76) — les chutes de reps de chaque exercice de la séance (les 3 dernières séances, un fait de `faits.js`) : le plan
      // décide de la ligne du repos, il ne relit pas l'historique.
      chutesDeReps: chutesDeRepsDeLaSeance(exos),
      paris: (local.predictions || []).filter(function (l) {
        return l && l.fondement && l.fondement.seance === seance.id;
      }),
      // MOTEUR §14.4 (49-U14) — l'escalier : les cartes passées, les compteurs
      // figés dans les paris des autres séances, les noms du catalogue et les
      // séries de la routine. Le plan décide de la carte et de la période.
      escalier: escalierDesEntrees(cs),
      // §9.18 (51-1) — la séance raccourcie : la structure complète, la
      // raccourcie et les exercices retirés, pour I32.
      raccourci: seance.raccourcie || null,
      // 194-1 (MOTEUR §9.31) — la mobilité : les zones raides du profil (`null` : pas répondu, `[]` : aucune), les minutes de la semaine par
      // zone (un fait de `faits.js`) et les zones à ménager du profil. Le plan décide du bloc ; il ne relit rien.
      zonesRaides: Array.isArray(profil && profil.zones_raides) ? profil.zones_raides : null,
      // 197 (MOTEUR §9.36) — 65 ans et plus (`true`), moins (`false`) ou inconnu (`null`) : le plan pose la consigne de puissance, il ne relit pas le profil.
      plus65: Profil.plus65DuProfil(profil, new Date(instantDuCalcul())),
      mobiliteFaite: faits.minutesDeMobiliteParZone(corpus(), seance.debut),
      menagerProfil: Profil.zonesAMenagerValides(profil && profil.zones_a_menager) || []
    };
  }

  // ── MOTEUR §14.4 (49-U14) — VOIR LA CARTE SUR LA PRÉVISUALISATION ────────
  //
  // `?escalier=demo` (et `?escalier=0` pour l'éteindre), SEULEMENT là où la
  // garde du coach est active — `localhost`, une prévisualisation `*.pages.dev`,
  // `?garde=1` ; JAMAIS en production. Retenu pour la session de l'onglet.
  // Tant qu'il est allumé : deux exercices TÉMOINS (« Exercice témoin A, B »)
  // calent depuis 4 et 5 séances aujourd'hui, et le premier exercice de la
  // séance qui a une consigne déclenche (compteur 4) — dans les ENTRÉES du plan
  // seulement, jamais dans le mémo des consignes. La réponse à la carte reste
  // EN MÉMOIRE, et AUCUN PARI NE S'ÉCRIT (ni de consigne, ni de l'escalier) :
  // la base ne voit rien de faux. ⚠️ On n'y valide donc AUCUNE SÉRIE (une série
  // validée sans son pari, la garde le dirait : I7) ; on abandonne la séance.
  //
  // §14.5 (49-U15) — `?escalier=isole` : le BLOCAGE ISOLÉ, sur une séance
  // quelconque. Le premier exercice qui a une consigne déclenche une première
  // fois (compteur 4, en zone force : la carte de schéma) ; le suivant, une
  // deuxième fois (compteur 8, avec un repli inventé à 5 % sous son meilleur).
  // Une valeur à part, et pas `demo` : la carte de semaine allégée cite tous
  // les exercices à 4 ou plus, et un exercice cité n'a pas de marche isolée
  // (I21) — les deux ne se montrent pas dans la même séance. La réponse au
  // schéma reste en mémoire : AUCUNE zone n'est posée, AUCUN pari n'est écrit.
  var demoReponse = null;   // la carte « répondue » de la démonstration, en mémoire
  var demoMarches = [];     // les schémas « répondus » de la démonstration, en mémoire
  var demoSerieDePlus = null;   // l'exercice de la série de plus de la démonstration
  // MOTEUR §14 (111) — `?escalier=degressive` : LA DÉGRESSIVE PROPOSÉE SUR LA
  // PRÉVISUALISATION. Le premier exercice d'ISOLATION de la séance qui a une
  // consigne (zone muscle, chargé) cale depuis 8 séances — le 2e déclenchement
  // isolé — et une série de plus « refusée » est inventée pour lui à ce
  // déclenchement : la carte de la dégressive. Les réponses restent EN MÉMOIRE
  // (`demoMarches`) : AUCUN pari ne s'écrit. « Ajouter une dégressive » pose la
  // ligne, que le coach remplit. On abandonne la séance ensuite.
  var demoDegressive = null;
  function degressiveDeDemo(cs, copie, avecConsigne, compteurDe) {
    demoDegressive = null;
    var ix = catalogueIndexe();
    var cible = avecConsigne.filter(function (s) {
      var f = ix[s];
      var k = cs[s].consigne;
      var l = k.ligne || k.haut;
      return f && l && typeof l.charge === 'number' && l.charge > 0 &&
        !Moteur.estPolyarticulaire({ prim: f.muscles_primaires || [], sec: f.muscles_secondaires || [],
                                     stab: f.muscles_stabilisateurs || [] });
    })[0];
    if (!cible) return copie;
    var kc = cs[cible].consigne;
    var l = kc.ligne || kc.haut;
    var zc = Moteur.estZoneForce(kc.zone) || !kc.zone ? 'volume' : kc.zone;
    copie[cible] = Object.assign({}, cs[cible], { consigne: Object.assign({}, kc, { zone: zc }),
      compteur: compteurDe(cible, 8, (cs[cible].compteur && cs[cible].compteur.meilleur) ||
        { palier: l.charge, niveau: typeof l.vise === 'number' ? l.vise : 10 }) });
    demoDegressive = cible;
    return copie;
  }
  // MOTEUR §10 bis (113) — `?escalier=plafond` : L'ESCALIER AU PLAFOND DE LA SALLE SUR LA PRÉVISUALISATION. Le
  // premier exercice d'ISOLATION de la séance qui a une consigne chargée est mis, DANS LES ENTRÉES DU PLAN seulement,
  // au plafond d'une salle inventée (une barre EZ à sa charge de travail, la plus lourde ; 15 reps) ; ses muscles ont
  // de la place. Son compteur avance d'un déclenchement à chaque réponse (4, 8, 12, 16) : la série de plus, puis la
  // dégressive, puis un frère plus chargeable (« Changer d'exercice » remplace dans la SÉANCE seule), puis le maintien.
  // Les réponses restent EN MÉMOIRE (`demoMarches`) : AUCUN pari ne s'écrit, la routine ne change pas. On abandonne
  // la séance ensuite.
  var demoPlafond = null;   // `{ slug, salle }` : l'exercice au plafond de la démonstration
  function plafondDeDemo(cs, copie, avecConsigne, compteurDe) {
    demoPlafond = null;
    var ix = catalogueIndexe();
    var cible = avecConsigne.filter(function (s) {
      var f = ix[s];
      var k = cs[s].consigne;
      var l = k.ligne || k.haut;
      return f && l && typeof l.charge === 'number' && l.charge >= 5 &&
        !Moteur.estPolyarticulaire({ prim: f.muscles_primaires || [], sec: f.muscles_secondaires || [],
                                     stab: f.muscles_stabilisateurs || [] });
    })[0];
    if (!cible) return copie;
    var kc = cs[cible].consigne;
    var P = (kc.ligne || kc.haut).charge;
    var charges = [];
    for (var v = P; v > 0 && charges.length < 12; v = Math.round((v - 2.5) * 100) / 100) charges.unshift(v);
    var salle = { materiel: 'barre_ez', charges: charges, isolation: true };
    var zc = Moteur.estZoneForce(kc.zone) || !kc.zone ? 'volume' : kc.zone;
    var reponses = demoMarches.filter(function (x) {
      return x && x.exercice === cible && Moteur.MARCHES_PLAFOND.indexOf(x.marche) >= 0;
    }).length;
    copie[cible] = Object.assign({}, cs[cible], {
      consigne: Object.assign({}, kc, { zone: zc, etat: 'salle_max', palier: P, niveau: 15,
        ligne: { charge: P, vise: 15 }, haut: null, repli: undefined,
        fondement: Object.assign({}, kc.fondement || {}, { salle: { materiel: 'barre_ez', max: P, plafond: 15, maintien: true } }) }),
      salle: salle, repli: null,
      compteur: compteurDe(cible, 4 * (reponses + 1), { palier: P, niveau: 15 }) });
    demoPlafond = { slug: cible, salle: salle };
    return copie;
  }
  // La place inventée de la démonstration : les muscles primaires de cet
  // exercice ont de la place (une copie de l'entrée, jamais le gel).
  function volumeDeDemo(volume, catalogue) {
    var mode = demoModeEscalier();
    var cible = mode === 'isole' ? demoSerieDePlus : mode === 'plafond' && demoPlafond ? demoPlafond.slug : null;
    if (!cible) return volume;
    var cat = catalogue && catalogue[cible];
    var copie = Object.assign({}, volume || {});
    ((cat && cat.muscles_primaires) || []).forEach(function (m) {
      copie[m] = { place: true, moyenne: 5, seuil: 6, fenetres: 6 };
    });
    return copie;
  }
  function demoModeEscalier() {
    // ⚠️ La clé est ICI, pas dans une `var` du module : la fonction est appelée
    // au démarrage, plus haut, avant que cette ligne ne soit exécutée.
    var CLE_DEMO_ESCALIER = 'th-v2-escalier-demo';
    if (!garde || !garde.active || rejeuEnCours) return null;
    var s = null;
    try { s = racine.sessionStorage; } catch (e) { s = null; }
    var m = /[?&]escalier=(demo|isole|lest|degressive|plafond|0)(?:&|$)/.exec(String((racine.location && racine.location.search) || ''));
    if (m) {
      try { if (s) s.setItem(CLE_DEMO_ESCALIER, m[1]); } catch (e) { /* fermé */ }
      return m[1] === '0' ? null : m[1];
    }
    var v = null;
    try { v = s ? s.getItem(CLE_DEMO_ESCALIER) : null; } catch (e) { v = null; }
    // `1` : la valeur d'avant 49-U15, pour `demo`.
    return v === 'demo' || v === '1' ? 'demo'
      : (v === 'isole' || v === 'lest' || v === 'degressive' || v === 'plafond' ? v : null);
  }
  function demoEscalier() { return !!demoModeEscalier(); }
  // MOTEUR §9.17 (50-1) — `?escalier=lest` : LA CARTE DU LEST SUR LA
  // PRÉVISUALISATION, sans rien écrire. Le premier exercice de la séance dont
  // aucune série n'est validée reçoit, DANS LES ENTRÉES DU PLAN seulement, une
  // consigne que le VRAI moteur calcule sur un historique inventé : trois
  // séances de trois séries de 8 reps au poids du corps, zone Mix (6 à 8) — les
  // deux dernières au haut, sans réponse. Le catalogue de cet exercice y est
  // une copie en `reps`, avec une version lestée inventée. La réponse reste EN
  // MÉMOIRE (`demoLest`) : ni le profil, ni aucun pari, ni la séance ne bougent.
  var demoLestSlug = null;   // l'exercice qui porte la carte de la démonstration
  function lestDeDemo(cs) {
    var copie = Object.assign({}, cs);
    var exos = (seance && seance.exercices) || [];
    var cible = null;
    for (var i = 0; i < exos.length && cible === null; i++) {
      var x = exos[i];
      if (x && x.exercise_slug && !(x.series || []).some(function (r) { return !!r.validee_a; })) {
        cible = x.exercise_slug;
      }
    }
    demoLestSlug = cible;
    if (!cible) return copie;
    var n = 0;
    var jour = function (d) { return new Date(Date.parse(seance.debut) - d * 86400000).toISOString(); };
    var seanceDe = function (d) {
      var series = [8, 8, 8].map(function (reps) {
        n++;
        return { id: 'demo-' + n, rang: n, charge_kg: null, reps: reps, rpe: null, ressenti: null,
                 type_serie: 'travail', exercise_slug: cible };
      });
      return { seance: { id: 'demo-s' + d, debut: jour(d) }, series: series };
    };
    var c = Moteur.consigneDExercice([seanceDe(21), seanceDe(14), seanceDe(7)], undefined, seance.debut,
      { mesure: 'reps', equipement: null, intention: 'progresser', reglage: Profil.rythmeDe(profil),
        correction: 'mix', lestPossible: true, lestReponse: demoLest });
    if (c) copie[cible] = c;
    return copie;
  }

  function consignesDeDemo(cs) {
    if (demoModeEscalier() === 'lest') return lestDeDemo(cs);
    var copie = Object.assign({}, cs);
    var avecConsigne = Object.keys(cs).filter(function (s) { return cs[s] && cs[s].consigne && cs[s].consigne.etat !== 'silence'; });
    var compteurDe = function (slug, n, meilleur) {
      return Object.assign({ meilleur: null, derniere: null, blocages: [] }, cs[slug].compteur || {},
        { compteur: n }, meilleur ? { meilleur: meilleur } : {});
    };
    if (demoModeEscalier() === 'degressive') return degressiveDeDemo(cs, copie, avecConsigne, compteurDe);
    if (demoModeEscalier() === 'plafond') return plafondDeDemo(cs, copie, avecConsigne, compteurDe);
    if (demoModeEscalier() !== 'isole') {
      var premier = avecConsigne[0];
      if (premier) copie[premier] = Object.assign({}, cs[premier], { compteur: compteurDe(premier, 4) });
      return copie;
    }
    var meilleurDe = function (k) {
      var l = k.ligne || k.haut;
      var P = l && typeof l.charge === 'number' ? l.charge : (typeof k.palier === 'number' ? k.palier : null);
      if (P === null) return null;
      var z = Moteur.zoneParCle(k.zone);
      return { palier: P, niveau: l && typeof l.vise === 'number' ? l.vise : (z ? z.bas : 5) };
    };
    var a = avecConsigne[0], b = avecConsigne[1], c = avecConsigne[2];
    // §14.7 (49-U17) — le troisième : une zone muscle qui cale (compteur 4),
    // ses muscles avec de la place (`volumeDeDemo`) — la carte de la série de plus.
    demoSerieDePlus = null;
    if (c) {
      var kc = cs[c].consigne;
      var zc = Moteur.estZoneForce(kc.zone) || !kc.zone ? 'volume' : kc.zone;
      copie[c] = Object.assign({}, cs[c], { consigne: Object.assign({}, kc, { zone: zc }),
        compteur: compteurDe(c, 4, (cs[c].compteur && cs[c].compteur.meilleur) || meilleurDe(kc)) });
      demoSerieDePlus = c;
    }
    if (a) {
      var ka = cs[a].consigne;
      var za = Moteur.estZoneForce(ka.zone) ? ka.zone : 'lourd';
      copie[a] = Object.assign({}, cs[a], { consigne: Object.assign({}, ka, { zone: za }),
        compteur: compteurDe(a, 4, (cs[a].compteur && cs[a].compteur.meilleur) || meilleurDe(ka)) });
      // §13.6 (49-U20) — SON FRÈRE INVENTÉ : un frère au catalogue s'il en a un
      // (sinon un témoin), monté d'un cran pendant le blocage — la phrase côte
      // à côte, et la carte de schéma quand même. Rien ne s'écrit.
      var ma = copie[a].compteur.meilleur;
      if (ma && typeof ma.palier === 'number' && typeof ma.niveau === 'number') {
        var ix = catalogueIndexe();
        var fa = Modele.freresDe(ix, a)[0] || null;
        var pa = Math.max(2.5, Math.round(ma.palier * 0.8 / 2.5) * 2.5);
        copie[a].frere = { id: fa || 'demo-frere', nom: fa ? Modele.nommer(ix, fa) : 'Exercice témoin (frère)',
                           avant: { palier: pa, niveau: ma.niveau }, maintenant: { palier: pa + 2.5, niveau: ma.niveau } };
      }
    }
    if (b) {
      var kb = cs[b].consigne;
      var mb = (cs[b].compteur && cs[b].compteur.meilleur) || meilleurDe(kb);
      var zb = Moteur.zoneParCle(kb.zone);
      if (mb && zb) {
        // Le repli inventé : 5 % sous le meilleur, au demi-kilo, tenu au bas de
        // la zone il y a 10 jours — dans les bornes de I22.
        var P = Math.round(mb.palier * 0.95 * 2) / 2;
        if (P >= mb.palier) P = mb.palier - 0.5;
        var il = new Date(new Date(seance.debut).getTime() - 10 * 86400000).toISOString();
        copie[b] = Object.assign({}, cs[b], { compteur: compteurDe(b, 8, mb),
          repli: { palier: P, niveau: zb.bas, debut: il, reps: [zb.bas, zb.bas, zb.bas], ligne: [P, zb.bas] } });
      }
    }
    return copie;
  }

  function escalierDesEntrees(cs) {
    var noms = {}, seriesRoutine = {}, degressivesRoutine = {};
    var index = catalogueIndexe();
    Object.keys(index).forEach(function (s) { if (index[s] && index[s].nom) noms[s] = index[s].nom; });
    Object.keys(cs).forEach(function (s) {
      var c = cs[s];
      // Figé à 0 (un exercice ajouté hors routine, avant ses séries) : le compte
      // d'aujourd'hui.
      seriesRoutine[s] = c && typeof c.seriesRoutine === 'number' && c.seriesRoutine > 0
        ? c.seriesRoutine : nombreDeSeriesDeTravail(s);
      // §14 (111) — figée avec la consigne ; une consigne figée avant 111 : la séance d'aujourd'hui.
      degressivesRoutine[s] = c && typeof c.degressiveRoutine === 'boolean' ? c.degressiveRoutine : aUneLigneDegressive(s);
    });
    var connus = parisEscalierConnus();
    var cartes = Moteur.cartesDesParis(connus);
    var compteurs = compteursDesParis();
    // §14.5 (49-U15) — les marches isolées déjà écrites (schéma, repli).
    var marches = Moteur.marchesDesParis(connus);
    if ((demoModeEscalier() === 'isole' || demoModeEscalier() === 'degressive' || demoModeEscalier() === 'plafond') && seance) {
      marches = marches.concat(demoMarches);
    }
    // §14 (111) — la série de plus « refusée » de la démonstration, au même déclenchement.
    if (demoModeEscalier() === 'degressive' && seance && demoDegressive) {
      marches = marches.concat([{ id: null, seance: 'demo', jour: Moteur.jourCivil(seance.debut), exercice: demoDegressive,
        marche: Moteur.MARCHE_SERIE_DE_PLUS, reponse: 'refusee', compteur: 4, debut: seance.debut, n: null }]);
    }
    if (demoModeEscalier() === 'demo' && seance) {
      var jour = Moteur.jourCivil(seance.debut);
      noms['demo-a'] = 'Exercice témoin A';
      noms['demo-b'] = 'Exercice témoin B';
      compteurs = compteurs.concat([
        { exercice: 'demo-a', jour: jour, compteur: 5, seance: 'demo', debut: seance.debut },
        { exercice: 'demo-b', jour: jour, compteur: 4, seance: 'demo', debut: seance.debut }]);
      if (demoReponse) cartes = cartes.concat([demoReponse]);
    }
    // 180 (A-F-02, D4) — LA MARCHE D'EN DESSOUS d'un exercice au poids du corps qui continue en reps : le catalogue la lit
    // (`Modele.marcheDEnDessous`, le rang juste en dessous de l'échelle), jamais une marche déjà dans la séance. Le plan décide.
    var dessous = {};
    var presentsD = seance ? (seance.exercices || []).map(function (x) { return x && x.exercise_slug; }) : [];
    Object.keys(cs).forEach(function (s) {
      var k = cs[s] && cs[s].consigne;
      if (!k || k.etat !== 'etirement_reps' || Number(k.palier) !== 0) return;
      var mD = Modele.marcheDEnDessous(index, s);
      if (mD && presentsD.indexOf(mD.slug) < 0) dessous[s] = { slug: mD.slug, nom: Modele.nommer(index, mD.slug) };
    });
    return { cartes: cartes, compteurs: compteurs, noms: noms, seriesRoutine: seriesRoutine, marches: marches,
             degressivesRoutine: degressivesRoutine, remplacants: remplacantsDesEntrees(cs, index), dessous: dessous,
             // 189 (MOTEUR §14.11) — la baisse générale (lue À LA DEMANDE : le plan la demande si une carte est possible), la
             // « série de moins » en cours et les priorités de la séance, que cette réponse ne touche jamais.
             baisse: function (jourDemande) { return entreeDeLaFatigue(jourDemande || Moteur.jourCivil(seance && seance.debut)); },
             serieDeMoins: { active: serieDeMoinsActive() },
             prioritaires: prioritairesDeLaSeance(),
             carteSuspendue: demoModeEscalier() === 'isole' || demoModeEscalier() === 'degressive' ||
               demoModeEscalier() === 'plafond' };
  }

  // MOTEUR §10 bis (113) — LES FRÈRES D'UN EXERCICE AU PLAFOND DE SA SALLE, pour la troisième marche : la liste de
  // « Remplacer » (`freresDe` : l'ordre de `Seance.freresProposes`, les écartés à la fin), avec ce que le plan lit
  // pour choisir — la mesure (`Modele.gabaritDe`), la salle déclarée du frère (`Profil.salleDeLExercice`, comme pour
  // l'exercice), et s'il est écarté, hors du matériel du profil ou déjà dans la séance. Le plan décide
  // (`Moteur.remplacantAuPlafond`) ; ici, aucun choix. Seulement pour un exercice dont la consigne dit le maintien au
  // plafond (`fondement.salle.maintien`, un fait de la consigne) : les frères ne se lisent pas pour rien.
  function remplacantsDesEntrees(cs, index) {
    var sortie = {};
    if (!seance) return sortie;
    var presents = (seance.exercices || []).map(function (x) { return x && x.exercise_slug; });
    var hors = horsDuMateriel(index);
    Object.keys(cs || {}).forEach(function (s) {
      var k = cs[s] && cs[s].consigne;
      var f = k && k.fondement;
      if (!f || !f.salle || f.salle.maintien !== true) return;
      sortie[s] = freresDe(s, presents).map(function (fr) {
        var fiche = index[fr.slug] || null;
        var g = Modele.gabaritDe(fiche);
        return { slug: fr.slug, nom: Modele.nommer(index, fr.slug), mesure: g.inconnue ? null : g.mesure,
                 salle: Profil.salleDeLExercice(profil, fr.slug, index), ecarte: !!fr.ecarte,
                 hors: typeof hors === 'function' ? !!hors(fr.slug) : false, deja: !!fr.deja_dans_la_seance };
      });
    });
    return sortie;
  }

  function nbDouleursDesEntrees() { return seance ? faits.seancesAvecDouleurParExercice(corpus(), seance.debut) : {}; }
  // Le premier frère de la feuille « Un frère » (`freresDe` : le même ordre), ni écarté, ni hors du matériel, ni déjà dans la séance.
  function freresDeRepriseDesEntrees() {
    var sortie = {};
    if (!seance) return sortie;
    var nb = nbDouleursDesEntrees();
    var presents = (seance.exercices || []).map(function (x) { return x && x.exercise_slug; });
    var index = Modele.indexerExercices(local.exercices);
    var hors = horsDuMateriel(index);
    // Les exercices de la séance qui ont eu une douleur : le plan décide s'il en fait une carte (la règle des 2 séances est au moteur).
    Object.keys(nb).forEach(function (slug) {
      if (presents.indexOf(slug) < 0) return;
      var f = freresDe(slug, presents).filter(function (q) {
        return !q.deja_dans_la_seance && !q.ecarte && !(typeof hors === 'function' && hors(q.slug));
      })[0];
      if (f) sortie[slug] = Modele.nommer(index, f.slug);
    });
    return sortie;
  }

  function planActuel() {
    if (!seance) return null;
    var entrees = entreesDuPlan();
    var edition = entrees.seance.edition;
    // `constats` porte les suites : une synchronisation le remet à zéro
    // (`recalculerEtats`) et la suite se recalcule sur le nouvel historique.
    if (planMemo && planMemo.seance === seance && planMemo.paris === local.predictions &&
        planMemo.version === versionConsignes && planMemo.edition === edition &&
        planMemo.constats === constats && planMemo.catalogue === local.exercices &&
        planMemo.refus === refusChauffes && planMemo.escalier === local.escalier &&
        planMemo.legers === local.parisLegers && planMemo.seances === local.seances &&
        planMemo.demo === demoReponse && planMemo.demoMarches === demoMarches &&
        planMemo.modes === local.modes && planMemo.lest === lestReponseDe() && planMemo.demoLest === demoLest &&
        planMemo.marches === (profil && profil.marche_reponses) && planMemo.demoMarche === demoMarche &&
        planMemo.blocs === local.blocs && planMemo.disque === Profil.plusPetitDisqueDe(profil) &&
        planMemo.moins === serieDeMoinsActive() && planMemo.cartes === (profil && profil.cartes_semaine) &&
        planMemo.raides === (profil && profil.zones_raides) && planMemo.menager === (profil && profil.zones_a_menager)) return planMemo.plan;
    var plan = Plan.planDeSeance(entrees);
    planMemo = { seance: seance, paris: local.predictions, version: versionConsignes,
                 edition: edition, constats: constats, catalogue: local.exercices,
                 refus: refusChauffes, escalier: local.escalier, legers: local.parisLegers,
                 seances: local.seances, demo: demoReponse, demoMarches: demoMarches,
                 modes: local.modes, lest: lestReponseDe(), demoLest: demoLest, blocs: local.blocs, plan: plan,
                 marches: profil && profil.marche_reponses, demoMarche: demoMarche, disque: Profil.plusPetitDisqueDe(profil),
                 moins: serieDeMoinsActive(), cartes: profil && profil.cartes_semaine,
                 raides: profil && profil.zones_raides, menager: profil && profil.zones_a_menager };
    // Le banc lit le dernier plan et ses entrées pour vérifier les invariants
    // après chaque geste (§9.13 bis) ; rien d'autre ne le relit. Un plan du
    // REJEU (développement) n'y entre pas : il vérifie ses invariants lui-même.
    if (!rejeuEnCours) {
      Plan.dernier = { entrees: entrees, plan: plan };
      if (gardeSuspendue > 0) planNonVerifie = { plan: plan };   // 183 — vérifié à la reprise (`suspendreGarde`)
      else garde.verifier(plan, entrees);
    }
    return plan;
  }

  // Prérequis d'« adapter » (04/10/2026) — UNE OCCURRENCE LIBRE : un exercice
  // présent deux fois dans la séance, sur l'occurrence que le coach ne suit
  // pas (`Seance.occurrenceCoachee`, la même règle que le plan). Elle n'a ni
  // en-tête, ni étiquette, ni constat — l'écran ne lui prête pas la voix de
  // l'autre. Sans indice (la page d'exercice, le menu des zones), l'occurrence
  // coachée, comme avant.
  function occurrenceLibre(iExo) {
    if (!seance || iExo === undefined || iExo === null) return false;
    var exo = (seance.exercices || [])[iExo];
    return !!exo && Seance.occurrenceCoachee(seance, exo.exercise_slug, local.predictions || []) !== iExo;
  }

  function planDuSlug(slug) {
    var p = planActuel();
    if (!p) return null;
    return p.exercices.filter(function (x) { return x.slug === slug && x.consigne; })[0] || null;
  }

  // PR 5 de la consolidation — LA CONSIGNE D'UN EXERCICE, HORS DE L'EN-TÊTE :
  // la page d'exercice (étiquette, ligne mise en avant) et le menu des zones
  // (la zone déduite). Une séance ouverte : SA consigne, figée à l'ouverture —
  // la page ne recalcule plus la sienne avec moins d'options (deux zones pour
  // un même exercice à la même seconde). Sans séance, ou en édition (le
  // moteur n'y prescrit rien) : le même calcul, avec les mêmes options, à
  // l'heure présente.
  function consigneDeLExercice(slug) {
    if (seance && !enEdition()) return consigneDe(slug);
    var exo = Modele.indexerExercices(local.exercices)[slug] || null;
    var instant = seance ? seance.debut : new Date().toISOString();
    var o = Object.assign(optionsDeConsigne(slug, exo, instantDuCalcul()), { edition: false }), g = groupesDuMoteur(slug, o.salle);
    return Moteur.consigneDExercice(g, etatDuMoteur(slug, o.salle, g), instant, o);
  }

  // §3.12 (49-U1) — l'en-tête LU SUR LE PLAN : il décrit les lignes de la
  // séance, plus le `n` de la consigne brute. Sans exercice dans la séance
  // (la page d'exercice), la consigne seule.
  function libellesDe(slug, iExo) {
    if (occurrenceLibre(iExo)) return null;
    var c = consigneDe(slug);
    if (!c) return null;
    var x = planDuSlug(slug);
    // 187 — le calage de la première séance : « On trouve ta charge » et la consigne de la suivante, lus sur le plan.
    if (x && x.calage && x.calage.libelles) {
      var lc = x.calage.libelles;
      return { jaune: [lc.titre], gris: [lc.consigne, lc.pourquoi].filter(Boolean).join(' '), compteur: null, frere: null,
               plus: null, moins: null, alleger: null, tempo: null, approchee: null };
    }
    return x ? { jaune: x.entete.jaune, gris: x.entete.gris, compteur: x.entete.compteur || null,
                 frere: x.entete.frere || null, plus: x.entete.plus || null, moins: x.entete.moins || null, alleger: x.entete.alleger || null,
                 tempo: x.entete.tempo || null,
                 approchee: x.approchee ? x.approchee.phrase : null } : c.libelles;
  }

  // §3.8 et §3.10 — l'étiquette de zone et le calcul, tirés du MÊME mémo que
  // les phrases. Trois lectures d'une consigne calculée une fois à l'ouverture.
  function etiquetteDe(slug, iExo) {
    if (occurrenceLibre(iExo)) return null;
    var c = consigneDe(slug);
    return c ? c.etiquette : null;
  }
  // ECRAN §3.10 — LA FEUILLE LIT LE PLAN, ENTIÈRE (relevé du 01/10, PR 1) :
  // « Donc », les lignes de la séance en cours ET les paragraphes, que le plan
  // rédige sur la consigne qu'il applique (`x.pourquoi`). L'app n'appelle plus
  // le moteur pour la feuille : elle la lisait sur une autre consigne que
  // l'en-tête, et plantait sous une semaine allégée ou un repli.
  function pourquoiDe(slug) {
    var x = planDuSlug(slug);
    if (!x || !x.consigne || !x.pourquoi) return null;
    return x.pourquoi;
  }

  // ── §3.9 — LE CONSTAT DE FIN DE BLOC ─────────────────────────────────────
  //
  // ⚠️ LA CONDITION EST « TOUTES LES SÉRIES DE TRAVAIL VALIDÉES », et elle se
  // lit sur ce que l'écran MONTRE : `partEnBase`, le même critère que la coche
  // (chantier 35, D3). Tester `validee_a` ferait diverger la case cochée et le
  // constat sur une séance importée.
  //
  // Les chauffes ne comptent pas : on peut finir un exercice sans en faire, et
  // en laisser une non validée ne doit pas retenir le constat. Un exercice sans
  // aucune série de travail n'a rien fini du tout.
  //
  // ⚠️ ET ELLES PORTENT LEUR RANG (20/09/2026). Une série en mémoire n'en a
  // pas : `rang` se calcule à l'écriture (`Seance.lignes`). Or le moteur trie
  // dessus (MOTEUR §1.2) — et sans lui, `Palier.trier` départageait sur
  // l'identifiant, un UUID tiré au hasard : le constat lisait la séance du jour
  // dans un ordre qu'aucun geste n'avait produit. Au squat du 20/09,
  // `120 → 130 → 130 → 130` (5, 4, 4 au palier) s'est lu « 4-5-4 ».
  //
  // La numérotation vient de `toutesLesSeries` — LA MÊME que celle qui partira
  // en base — pour que l'écran, la base et le moteur lisent la même séance.
  function seriesDeTravailDe(slug) {
    return Seance.toutesLesSeries(seance).filter(function (p) {
      return p.exo && p.exo.exercise_slug === slug &&
        Modele.estTravail(p.serie);
    }).map(function (p) { return Object.assign({}, p.serie, { rang: p.rang }); });
  }

  // « L'exercice est fini » et « le bloc est fini » : UNE définition, dans
  // `seance.js` (relevé du 01/10, PR 2) — le plan lit la même pour ouvrir le
  // constat. Le constat attend la fin du BLOC (un superset est un bloc, §3.9).
  function exerciceFini(slug) { return Seance.exerciceFini(seance, slug); }
  function blocFini(slug) { return Seance.blocFini(seance, slug); }

  // ⚠️ SON PROPRE MÉMO, ET SA PROPRE CLÉ. Celui des consignes a pour clé la
  // séance et le profil, qui ne bougent pas d'une validation à l'autre ; le
  // constat, lui, dépend de CE QUI EST VALIDÉ — il doit donc se recalculer
  // quand une série est validée ou dévalidée, et à ce moment-là seulement. Une
  // clé qui compte les séries de travail et les validées dit exactement ça :
  // ajouter une série la change, en dévalider une aussi, et taper dans un
  // champ ne la change pas.
  var constats = null;   // { cle, parSlug }

  // ⚠️ ET ELLE PORTE LES VALEURS, PAS SEULEMENT LE COMPTE (48b-6b-2). Compter
  // les séries et les validées suffisait à voir une validation ; corriger une
  // charge ou des reps SUR UNE SÉRIE DÉJÀ VALIDÉE laissait la clé identique,
  // donc le constat en cache — vu sur appareil. Les quatre colonnes que le
  // moteur lit : la charge, les reps, et l'effort sous ses deux formes (un RPE
  // de 10 vaut une rep de moins, §17.4).
  function empreinteSerie(s) {
    return [s.charge_kg, s.reps, s.rpe, s.ressenti].join('|');
  }

  function empreinteValidations() {
    var parts = [];
    (seance.exercices || []).forEach(function (exo) {
      var t = seriesDeTravailDe(exo.exercise_slug);
      var faites = t.filter(function (s) { return Seance.partEnBase(s); });
      parts.push(exo.exercise_slug + ':' + t.length + '/' + faites.length +
        ':' + faites.map(empreinteSerie).join(';'));
    });
    return parts.join(',');
  }

  // §3.9 (49-U4) — LA SUITE D'UN EXERCICE : la consigne de la PROCHAINE
  // séance, sur l'historique augmenté de la séance du jour (`consignePour`,
  // par `Moteur.suiteDExercice`), et le cran au-dessus de son palier. C'est
  // la seule chose que le plan ne peut pas calculer seul : il n'a pas
  // l'historique. Calculée quand les séries de travail de l'exercice sont
  // faites, jamais avant — le constat n'existe pas avant (I10 a).
  //
  // ⚠️ LA CLÉ PORTE AUSSI LES OPTIONS DE LA SUITE (relevé du 01/10, PR 2). Elle
  // ne portait que la séance, le profil et les validations : une zone choisie
  // sur un exercice fini (`poserZone`), ou une réponse à l'escalier (les
  // périodes allégées, les séries de plus), laissaient la suite d'AVANT en
  // cache — le constat comparait la consigne de la nouvelle zone à la suite de
  // l'ancienne (vu en base : couché haltères, 26/09, Volume → Hypertrophie en
  // pleine séance). Les options sont exactement celles que reçoit le moteur :
  // l'une change, la suite se recalcule. Et l'objet `constats` est REMPLACÉ, pas
  // modifié : le mémo du plan le reconnaît à son identité.
  function suiteDe(slug) {
    if (!seance || !exerciceFini(slug)) return null;
    var cle = cleConsignes() + '|' + empreinteValidations();
    if (!constats || constats.cle !== cle) constats = { cle: cle, parSlug: {} };
    var exo = catalogueIndexe()[slug];
    // Les MÊMES options que la consigne de la séance (49-U18).
    var options = optionsDeConsigne(slug, exo, instantDuCalcul());
    var cleOptions = JSON.stringify(options);
    var vu = constats.parSlug[slug];
    if (!vu || vu.options !== cleOptions) {
      var faites = seriesDeTravailDe(slug).filter(function (s) { return Seance.partEnBase(s); });
      // 132 — un exercice noté par nom : la séance du jour et l'historique en charges virtuelles (§10 ter).
      if (estSalleElastique(options.salle)) faites = Profil.seriesPourLeMoteur(options.salle, faites, false);
      // ⚠️ LA COUPURE D'APRÈS EST L'INSTANT PRÉSENT. Le moteur ne lit jamais
      // l'avenir : une coupure au début de la séance en exclurait la séance du
      // jour, et la suite raconterait la fois d'avant.
      // ⚠️ RIEN DE CE QUI A COMMENCÉ APRÈS ELLE. Une séance restée ouverte et
      // reprise des jours plus tard : les séances faites entre-temps ne sont
      // pas « aujourd'hui » (le constat racontait l'une d'elles).
      var debutDuJour = Date.parse(seance.debut);
      var anterieures = groupesDuMoteur(slug, options.salle).filter(function (g) {
        return g.seance.id === seance.id || !(Date.parse(g.seance.debut) > debutDuJour);
      });
      var r = Moteur.suiteDExercice(
        anterieures,
        { seance: { debut: seance.debut }, series: faites },
        etatDuMoteur(slug, options.salle, anterieures), rejeuEnCours ? rejeuEnCours.instant : new Date().toISOString(),
        options);
      var parSlug = Object.assign({}, constats.parSlug);
      parSlug[slug] = { options: cleOptions,
                        valeur: r ? { consigne: r.apres.consigne, cranSuivant: r.cranSuivant, cranSuivantApprochee: r.cranSuivantApprochee === true } : null };
      constats = { cle: cle, parSlug: parSlug };
    }
    return constats.parSlug[slug].valeur;
  }

  // ⚠️ LE CONSTAT SE LIT DANS LE PLAN (§9.13 bis, 49-U4, I10). Il y était
  // recalculé à part — deux consignes sur les séries BRUTES, sans les rôles du
  // jour — et disait « Pas de palier aujourd'hui » juste après une montée du
  // coach annoncée « dans ta zone ». Il s'affiche, comme avant, quand le BLOC
  // est fini (superset compris).
  function constatPour(slug, iExo) {
    if (!seance || occurrenceLibre(iExo) || !blocFini(slug)) return null;
    var x = planDuSlug(slug);
    if (!x || !x.constat) return null;
    // 193-1 — « Tes reculs tiennent 6-6-6. » : une ligne de plus sous le constat, du plan.
    var plus = {};
    if (x.reculs && x.reculs.constat) plus.reculs = x.reculs.constat;
    // 193-6 — « Ta dernière série me dit où tu en es : 12 reps à 112,5 kg, 2 de plus que prévu. » : une ligne de plus, du plan.
    if (x.auMax && x.auMax.constat) plus.auMax = x.auMax.constat.texte;
    return Object.keys(plus).length ? Object.assign({}, x.constat, plus) : x.constat;
  }

  // Taper dans un champ ne redessine pas la séance — le champ perdrait le
  // focus à chaque frappe. Le constat, lui, doit suivre : on réécrit ses deux
  // lignes par la porte étroite de `rendu.js`, et rien d'autre. Les exercices
  // dont le bloc n'est pas fini sortent tout de suite de `constatPour` : le
  // coût d'une frappe reste celui du seul bloc qui affiche un constat.
  function rafraichirConstats() {
    if (!seance) return;
    var racine = $('blocs-seance');
    if (!racine) return;
    var vus = {};
    (seance.exercices || []).forEach(function (exo) {
      var slug = exo && exo.exercise_slug;
      if (!slug || vus[slug]) return;
      vus[slug] = true;
      // L'occurrence que le coach suit : c'est sa légende qui porte le constat.
      var i = Seance.occurrenceCoachee(seance, slug, local.predictions || []);
      Rendu.majConstat(racine, slug, constatPour(slug, i), i);
    });
  }

  // ── §9.11 (48c) — CE QUE LE MOTEUR A PROPOSÉ S'ÉCRIT ─────────────────────
  //
  // ⚠️ À LA VALIDATION DE CHAQUE SÉRIE COUVERTE, JUSTE AVANT SON OBSERVATION
  // (révisé le 26/09/2026, 49-C). C'est ce que l'utilisateur a LU sur la ligne
  // et sur quoi il a agi — charge, visée, rôle —, et le rang que la série
  // porte à ce moment-là, qui ne change plus. Jusque-là, les paris s'écrivaient
  // à l'affichage de la consigne, une fois par séance et par exercice : des
  // paris pour des séries qui n'ont jamais existé quand la séance en comptait
  // moins que `n`, et des paris qui changeaient de série à chaque ajout ou
  // retrait. Ni à chaque redessin, qui noierait la table, ni la veille au
  // constat, qu'un historique modifié peut encore changer. Rien quand le
  // moteur se tait — `consigneDe` rend `null` en Entretenir, en Édition et sur
  // une mesure sans charge, et `lignesDePari` ne rend rien en silence.
  //
  // La garde vit dans `local.predictions`, pas en mémoire : rouvrir l'app au
  // milieu d'une séance ne doit pas réécrire ce qui a déjà été noté.
  // ⚠️ DEUX MARQUES, ET LA PREMIÈRE EST SYNCHRONE. `local.predictions` dit ce
  // qui est noté ; `notesEnCours` dit ce qui est EN TRAIN de l'être. Depuis
  // 48c-2, fabriquer l'identifiant demande une attente (SHA-256), et sans
  // cette seconde marque deux gestes rapprochés repasseraient tous deux la
  // garde. Les lignes seraient identiques — l'identifiant les dédoublonne à
  // destination — mais on les écrirait deux fois pour rien.
  var notesEnCours = {};

  // §9.11 — LA GARDE PORTE (séance, exercice, rang, révision). Depuis 49-C,
  // chaque pari s'écrit ligne par ligne, révision 0 comprise : la garde porte
  // donc toujours le rang. Sans la révision dans la clé, le pari de la
  // consigne bloquerait celui du coach sur le même rang (séance ouverte avant
  // 49-C, dont les paris de l'ouverture existent déjà).
  function revisionDe(l) {
    var r = l && l.fondement ? Number(l.fondement.revision) : 0;
    return isFinite(r) && r >= 1 ? r : 0;
  }

  // Prérequis d'« adapter » — L'OCCURRENCE FAIT PARTIE DE LA CLÉ. Un même
  // exercice peut figurer deux fois dans la séance : « déjà noté » se demande
  // aux paris de CETTE occurrence (`Seance.parisDeLOccurrence`), jamais à ceux
  // de l'autre. Seule la première est coachée, mais une occurrence peut devenir
  // la première (l'autre supprimée) : sa clé ne doit rien emprunter.
  function cleNote(iExo, slug, revision, rang) {
    var exo = (seance.exercices || [])[iExo];
    return seance.id + '|' + slug + '|' + (revision || 0) + '|' + rang + '|' +
      ((exo && exo.occurrence) || '');
  }

  function dejaNote(iExo, slug, revision, rang) {
    var rev = revision || 0;
    if (notesEnCours[cleNote(iExo, slug, rev, rang)]) return true;
    return Seance.parisDeLOccurrence(local.predictions || [], seance, iExo).some(function (l) {
      return revisionDe(l) === rev && l.fondement.rang === rang;
    });
  }

  // §9.11 (49-C) — LE PARI DE LA SÉRIE QU'ON VIENT DE VALIDER.
  //
  // ⚠️ IL SE LIT DANS LE PLAN, IL NE SE CALCULE PLUS ICI (§9.13 bis, 49-U3).
  // Le plan relit la séance APRÈS la validation, la série pas encore figée
  // (son pari n'existe pas) : il porte donc exactement ce que la ligne
  // affichait juste avant, et le pari qu'elle doit écrire (`paris[iSerie]`),
  // tiré de la réaction sur les séries validées qui la PRÉCÈDENT — l'effort
  // saisi pendant le repos qui a retiré une proposition ne laisse rien écrire
  // du coach. Cette fonction n'écrit que ce que le plan dit.
  //
  // ⚠️ I7, G2 (49-17, 28/09/2026) — LE PARI S'ENREGISTRE SUR L'APPAREIL AVANT
  // QUE LE PLAN SUIVANT SOIT CALCULÉ. Avant, le redessin (`apresGeste`)
  // passait d'abord : un plan où la série était validée sans son pari, vu par
  // la garde à chaque validation. Le pari se lit donc ici SANS passer par
  // `planActuel` (mémoïsé, gardé) : `Plan.planDeSeance`, pur, sur les mêmes
  // entrées — le même plan (I12). Et il entre dans `local.predictions`
  // TOUT DE SUITE, de façon synchrone : l'identifiant (SHA-256) demande une
  // attente, pendant laquelle un redessin (minuterie, synchronisation) doit
  // déjà le voir. L'identifiant se pose ensuite (`finirPari`), et l'envoi
  // dans la file reste après les séries (`poserPari`, après `apresGeste`).
  // Rend la ligne provisoire (sans identifiant), ou `null`.
  function enregistrerPari(iExo, iSerie) {
    if (!seance || enEdition()) return null;
    // §14.4 (49-U14) — en démonstration de l'escalier, AUCUN pari ne s'écrit :
    // les compteurs y sont inventés.
    if (demoEscalier()) return null;
    var p = Plan.planDeSeance(entreesDuPlan());
    var r = p && p.exercices[iExo];
    if (!r || !r.consigne) return null;
    var serie = seance.exercices[iExo].series[iSerie];
    if (!serie || !Seance.partEnBase(serie) || r.figees[serie.id]) return null;
    var pari = r.paris && r.paris[iSerie];
    if (!pari) return null;
    var slug = pari.exercise_slug;
    var rang = pari.fondement.rang;
    var rev = revisionDe(pari);
    if (dejaNote(iExo, slug, rev, rang)) return null;
    notesEnCours[cleNote(iExo, slug, rev, rang)] = true;
    // ⚠️ `emise_a` ET `user_id` SONT POSÉS ICI, comme pour une correction de
    // zone (§9.1.1) : laissés au défaut du serveur, deux séances notées hors
    // ligne remonteraient dans l'ordre du réseau, pas dans celui des gestes.
    // ⚠️ UNE LIGNE PROVISOIRE N'EST PAS OBSERVABLE (pas d'identifiant : une
    // observation partirait vers `id = null`). `observerSerie` l'ignore ;
    // `validerSerie` l'observe lui-même, une fois identifiée. Le jeton la
    // retrouve même si elle a été recopiée entre-temps.
    var provisoire = Object.assign({}, pari, {
      id: null, _provisoire: uuid(),
      user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
      module_version: Moteur.VERSION_CONSIGNE,
      emise_a: new Date().toISOString(), horizon_jours: null,
      valeur_observee: null, observee_a: null, set_observe: null
    });
    local.predictions = (local.predictions || []).concat([provisoire]);
    return provisoire;
  }

  // ⚠️ L'IDENTIFIANT EST CALCULÉ, PAS TIRÉ (48c-2). Deux instances de l'app
  // qui notent la même consigne calculent le même identifiant, et l'insert
  // qui ignore les doublons fait du second envoi un non-événement. C'est ce
  // qui a manqué le 21/09 : six lignes au lieu de trois. 59-5 : plus aucun
  // repli aléatoire — sans `crypto.subtle`, le moteur calcule le même SHA-256
  // en JavaScript pur (`Moteur.idDePrediction` ne rend jamais `null`). La
  // ligne provisoire est remplacée par la ligne identifiée — ajoutée si une
  // synchronisation l'a emportée entre-temps.
  async function finirPari(provisoire) {
    // L'occurrence entre dans le nom (`Moteur.idDePrediction`) : sans elle — un
    // pari d'une séance d'avant la règle —, l'identifiant d'avant, inchangé.
    // 193-1 — le pari d'un recul a son espace de noms (`recul|…`), comme l'escalier : son rang est un texte.
    var calcule = provisoire.fondement.role === 'recul'
      ? await Moteur.idDeRecul(seance.id, provisoire.exercise_slug, provisoire.fondement.rang, provisoire.fondement.occurrence)
      : await Moteur.idDePrediction(seance.id, provisoire.exercise_slug,
        provisoire.fondement.rang, revisionDe(provisoire),
        provisoire.fondement.occurrence);
    var ligne = Object.assign({}, provisoire, { id: calcule });
    delete ligne._provisoire;
    var trouve = false;
    local.predictions = (local.predictions || []).map(function (l) {
      if (!l || l._provisoire !== provisoire._provisoire) return l;
      trouve = true;
      return ligne;
    });
    if (!trouve) local.predictions = local.predictions.concat([ligne]);
    await Cache.ecrireLot('predictions', [ligne]).catch(function () {});
    // §14.4 (49-U14) — un compteur de plus vient d'être figé : une semaine
    // allégée acceptée peut se trancher.
    observerEscalier().catch(function () {});
    return ligne;
  }

  // ── MOTEUR §14.4 (49-U14) — LA RÉPONSE À LA CARTE ──────────────────────
  //
  // Acceptée ou refusée, la réponse S'ÉCRIT : c'est le pari de la semaine
  // allégée (`module = 'escalier'`), identifié dans son espace de noms
  // (`Moteur.idDEscalier`). Acceptée, il ouvre la période (le plan la lit dans
  // les paris de l'escalier) ; refusée, il n'est jamais observé, et un bandeau
  // d'un instant le dit. Rien d'autre n'est stocké : la mémoire des cartes vit
  // dans ces paris.
  var refusMontre = null;      // l'identifiant de la séance du bandeau d'un instant
  var DUREE_BANDEAU_REFUS = 6000;
  var VERSION_ESCALIER = '1';
  var reponseEnCours = false;

  function montrerRefus() {
    var ici = seance.id;
    refusMontre = ici;
    setTimeout(function () {
      if (refusMontre !== ici) return;
      refusMontre = null;
      if (seance && seance.id === ici && ecranCourant === 'seance') rendreSeance();
    }, DUREE_BANDEAU_REFUS);
  }

  // ── 189 (MOTEUR §14.11) — LA FATIGUE SUR PLUSIEURS SEMAINES : ce que l'app donne au plan ────────────────────────────
  //
  // La matière de la baisse générale, assemblée par `faits.entreeFatigue` et gardée tant que l'historique, les zones, les
  // pesées et les semaines allégées ne changent pas (les tableaux sont remplacés, jamais modifiés en place : leur identité
  // est la clé). Aucune décision ici : le plan la demande, le moteur tranche.
  var memoFatigue = null;
  function entreeDeLaFatigue(jour) {
    var allegees = periodesAllegees();
    var cle = [jour, JSON.stringify(allegees)].join('|');
    if (memoFatigue && memoFatigue.cle === cle && memoFatigue.seances === local.seances && memoFatigue.series === local.series &&
        memoFatigue.zones === local.zones && memoFatigue.pesees === local.pesees && memoFatigue.catalogue === local.exercices) {
      return memoFatigue.entree;
    }
    var index = catalogueIndexe();
    var entree = faits.entreeFatigue(corpus(), {
      jour: jour, periodesAllegees: allegees, zones: zonesLues(),
      nom: function (slug) { return Modele.nommer(index, slug); },
      pesees: (local.pesees || []).map(function (x) { return { date: x.date, poids: x.poids_kg !== undefined ? x.poids_kg : x.poids }; })
    });
    memoFatigue = { cle: cle, seances: local.seances, series: local.series, zones: local.zones, pesees: local.pesees,
                    catalogue: local.exercices, entree: entree };
    return entree;
  }

  // La réponse « une série de moins » du profil, valable tant que la sèche où elle a été donnée dure.
  function reponseSerieDeMoins() {
    var r = reponsesDesCartes()[Moteur.CLE_SERIE_DE_MOINS];
    return r && typeof r === 'object' ? r : null;
  }
  function serieDeMoinsActive() {
    return Moteur.serieDeMoinsValable(reponseSerieDeMoins(), Profil.phaseDe(profil), profil && profil.phase_depuis);
  }
  // Les priorités de la séance : les exercices qu'une priorité du profil désigne (la définition du raccourci, une seule).
  function prioritairesDeLaSeance() {
    if (!seance) return [];
    var slugs = (seance.exercices || []).map(function (x) { return x && x.exercise_slug; }).filter(Boolean);
    return Generateur.exemptsDesPriorites(slugs, Profil.prioritesDe(profil), catalogueIndexe());
  }

  async function repondreCarte(reponse) {
    if (!seance || enEdition() || reponseEnCours) return;
    var p = planActuel();
    var carte = p && p.carte;
    if (!carte) return;
    reponseEnCours = true;
    try {
      var acceptee = reponse === 'acceptee';
      var moins = reponse === Moteur.REPONSE_SERIE_DE_MOINS;
      if (demoEscalier()) {
        // La démonstration : la réponse reste en mémoire, rien ne s'écrit.
        demoReponse = { seance: seance.id, jour: carte.jour, declencheur: carte.declencheur, compteur: carte.compteur,
                        reponse: acceptee ? 'acceptee' : 'refusee', debut: acceptee ? carte.jour : null,
                        fin: acceptee ? Moteur.finAllegee(carte.jour) : null };
        if (!acceptee) montrerRefus();
        rendreSeance();
        if (acceptee) await appliquerAllegee();
        return;
      }
      var id = await Moteur.idDEscalier(seance.id, null, Moteur.MARCHE_SEMAINE_ALLEGEE);
      var pari = {
        id: id,
        user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
        module: Moteur.MODULE_ESCALIER, module_version: VERSION_ESCALIER,
        emise_a: new Date().toISOString(),
        exercise_slug: null, grandeur: 'progres', horizon_jours: null,
        valeur_predite: 1, borne_basse: null, borne_haute: null,
        fondement: {
          seance: seance.id, jour: carte.jour, marche: Moteur.MARCHE_SEMAINE_ALLEGEE,
          reponse: moins ? Moteur.REPONSE_SERIE_DE_MOINS : (acceptee ? 'acceptee' : 'refusee'),
          declencheur: carte.declencheur, compteur: carte.compteur, cites: carte.cites.slice(),
          debut: acceptee ? carte.jour : null, fin: acceptee ? Moteur.finAllegee(carte.jour) : null,
          phase: p.phase, objectif: p.objectif
        },
        valeur_observee: null, observee_a: null, set_observe: null
      };
      // 189 — une carte de BAISSE dit d'où elle vient et la valeur d'avant de chaque exercice cité : le pari se juge dessus.
      if (carte.source === Moteur.SOURCE_BAISSE) {
        pari.fondement.source = Moteur.SOURCE_BAISSE;
        pari.fondement.avant = Object.assign({}, carte.avant || {});
        pari.fondement.baisse_moyenne = carte.moyenne === undefined ? null : carte.moyenne;
      }
      local.predictions = (local.predictions || []).concat([pari]);
      await Cache.ecrireLot('predictions', [pari]).catch(function () {});
      await poserPari(pari);
      // 189 — « Une série de moins jusqu'à la fin de ta sèche » : la décision vit dans le profil (`cartes_semaine.fatigue_seche`),
      // par la file, avec la sèche où elle a été donnée ; « Revenir à mes séries » ou la fin de la sèche l'efface.
      if (moins) {
        var toutes = Object.assign({}, reponsesDesCartes());
        toutes[Moteur.CLE_SERIE_DE_MOINS] = { r: 'oui', le: carte.jour, depuis: (profil && profil.phase_depuis) || null };
        await poserProfil({ cartes_semaine: toutes });
      }
      if (!acceptee && !moins) montrerRefus();
    } finally {
      reponseEnCours = false;
    }
    if (seance) rendreSeance();
    if (seance && reponse === 'acceptee') await appliquerAllegee();
    if (seance && reponse === Moteur.REPONSE_SERIE_DE_MOINS) await appliquerSerieDeMoins();
  }

  // 189 — « REVENIR À MES SÉRIES » : la décision s'annule par un geste visible, jamais en silence. La séance en cours garde les
  // lignes qu'elle a ; les prochaines repartent de la routine. Le pari de la carte reste tel quel (il a été posé, et se juge).
  async function revenirAuxSeries() {
    if (!serieDeMoinsActive()) return;
    var toutes = Object.assign({}, reponsesDesCartes());
    delete toutes[Moteur.CLE_SERIE_DE_MOINS];
    await poserProfil({ cartes_semaine: toutes });
    if (seance) rendreSeance();
  }

  // LA LIGNE EN MOINS, une fois : à la réponse et à la création d'une séance pendant la sèche (`Plan.lignesAEnlever`, jamais une
  // série validée). Jamais au rendu : une ligne remise par « + Série » reste.
  async function appliquerSerieDeMoins() {
    if (!seance || enEdition()) return;
    var aEnlever = Plan.lignesAEnlever(planActuel());
    if (!aEnlever.length) return;
    aEnlever.forEach(function (r) { seance = Seance.retirerSerie(seance, r.iExo, r.iSerie); });
    await apresGeste();
  }

  // ── MOTEUR §14.5 (49-U15) — LES MARCHES ISOLÉES : SCHÉMA ET REPLI ───────
  //
  // Un pari de marche (`module = 'escalier'`) a l'identifiant de son espace de
  // noms : `escalier|séance|exercice|marche`. ⚠️ SA COLONNE `exercise_slug`
  // RESTE VIDE, l'exercice vit dans le fondement (`exercice`) : cinq lecteurs
  // prennent un pari portant `exercise_slug` pour un pari de CONSIGNE — les
  // lignes figées du plan, I7, `dejaNote`, l'observation d'une série, et
  // « sous consigne » côté serveur (`seancesAvecPari`).
  function pariDeMarche(id, x, marche, reponse, plan, extra) {
    return {
      id: id,
      user_id: (sessionActive && sessionActive.user && sessionActive.user.id) || null,
      module: Moteur.MODULE_ESCALIER, module_version: VERSION_ESCALIER,
      emise_a: new Date().toISOString(),
      exercise_slug: null, grandeur: 'progres', horizon_jours: null,
      valeur_predite: 1, borne_basse: null, borne_haute: null,
      fondement: Object.assign({
        seance: seance.id, jour: Moteur.jourCivil(seance.debut), exercice: x.slug,
        marche: marche, reponse: reponse, compteur: x.escalier.compteur, n: x.escalier.n,
        zone: x.escalier.zone, phase: plan.phase,
        // MOTEUR §9.16 (60-2b, I40) — l'objectif gelé, jumeau de la phase.
        objectif: plan.objectif
      }, extra || {}),
      valeur_observee: null, observee_a: null, set_observe: null
    };
  }

  async function ecrirePariDeMarche(pari) {
    local.predictions = (local.predictions || []).concat([pari]);
    await Cache.ecrireLot('predictions', [pari]).catch(function () {});
    await poserPari(pari);
  }

  // « Passer à 6-8 reps » / « Garder 3-5 ». OUI = LE GESTE DE LA CORRECTION DE
  // ZONE (48b-7, `poserZone`), comme si la personne l'avait choisie — pas un
  // second chemin : elle revient depuis l'étiquette, et le compteur repart de
  // zéro (changement de zone). NON = rien ne change. Les deux s'écrivent.
  //
  // §14.7 (49-U17) — LA MÊME RÉPONSE pour la carte de la SÉRIE DE PLUS : le
  // pari (`marche : serie_de_plus`, avec les séries de la routine `n_routine`
  // et le début de la séance), puis, acceptée, la ligne en plus.
  async function repondreSchema(iExo, reponse) {
    if (!seance || enEdition() || reponseEnCours) return;
    var p = planActuel();
    var x = p && p.exercices[iExo];
    var m = x && x.escalier;
    if (!m || !m.carte) return;
    reponseEnCours = true;
    var acceptee = reponse === 'acceptee';
    var marche = m.marche;
    var plus = marche === Moteur.MARCHE_SERIE_DE_PLUS;
    // §14 (111) — LA DÉGRESSIVE PROPOSÉE : la même réponse ; son pari porte le
    // début de la séance ; acceptée, la ligne dégressive (§9.15.3 la remplit).
    var deg = marche === Moteur.MARCHE_DEGRESSIVE;
    // MOTEUR §10 bis (113) — AU PLAFOND DE LA SALLE : la série de plus et la dégressive parient de tenir le plafond
    // (`origine : salle_max`, le plafond, les séries de la routine) ; le remplacement n'a aucun pari d'escalier —
    // refusé, il s'écrit comme les autres refus ; accepté, l'exercice change dans la routine et dans la séance.
    var rempl = marche === Moteur.MARCHE_REMPLACEMENT;
    // 174 — LA 4e MARCHE, « ALLÉGER » : la même réponse ; son pari porte les séries de la routine et le début de la séance ;
    // acceptée, les lignes en trop partent (`appliquerAllegee`, jamais une série validée).
    var alleger = marche === Moteur.MARCHE_ALLEGER;
    // 180 (A-F-02, D4) — LA MARCHE D'EN DESSOUS, au poids du corps : la même réponse ; son pari porte la marche proposée ; acceptée,
    // elle s'ajoute avant l'exercice (2 séries), comme toute marche d'échelle — l'exercice reste.
    var dessous = marche === Moteur.MARCHE_DESSOUS;
    var auPlafond = !!m.plafond;
    var nRoutine = nombreDeSeriesRoutine(x.slug);
    var extra = plus || alleger ? { n_routine: nRoutine, debut: seance.debut }
      : deg ? { debut: seance.debut } : rempl ? { debut: seance.debut, vers: m.carte.vers }
      : dessous ? { debut: seance.debut, vers: m.carte.cible }
      : { nouvelle_zone: m.carte.nouvelle_zone };
    if (auPlafond) {
      extra.origine = Moteur.ORIGINE_SALLE_MAX;
      extra.plafond = { charge: m.plafond.charge, reps: m.plafond.reps };
      if (deg) extra.n_routine = nRoutine;
    }
    try {
      if (demoEscalier()) {
        // La démonstration : la réponse reste en mémoire ; aucune zone posée,
        // aucun pari.
        demoMarches = demoMarches.concat([{ seance: seance.id, jour: Moteur.jourCivil(seance.debut),
          exercice: x.slug, marche: marche, reponse: acceptee ? 'acceptee' : 'refusee',
          compteur: m.compteur, debut: seance.debut, n: nRoutine }]);
      } else if (!(rempl && acceptee)) {
        var id = await Moteur.idDEscalier(seance.id, x.slug, marche);
        await ecrirePariDeMarche(pariDeMarche(id, x, marche, acceptee ? 'acceptee' : 'refusee', p, extra));
        if (acceptee && !plus && !deg && !rempl && !alleger && !dessous) await poserZone(x.slug, m.carte.nouvelle_zone);
      }
    } finally {
      reponseEnCours = false;
    }
    if (seance && acceptee && rempl) return remplacerAuPlafond(iExo, x.slug, m.carte.vers);
    if (seance && acceptee && dessous && !demoEscalier()) {
      var avantAjoutD = seance.exercices;
      seance = Seance.insererExercice(seance, iExo, m.carte.cible, uuid, { series: Moteur.SERIES_MARCHE });
      await apresStructure();
      await allegeePourAjout(avantAjoutD, m.carte.cible);
      await ligneDePlusPourAjout(avantAjoutD, m.carte.cible);
      return;
    }
    if (seance) rendreSeance();
    if (seance && acceptee && plus) await appliquerSerieDePlus();
    if (seance && acceptee && deg) await appliquerDegressive();
    if (seance && acceptee && alleger) await appliquerAllegee();
  }

  // 175 (MOTEUR §10 bis) — LA CARTE DES LEVIERS, LA RÉPONSE : un geste par levier, ou « Garder ». UNE réponse par carte, gardée :
  //   · `remplacement` : le frère prend la place (`remplacerAuPlafond`, le geste d'avant), sans pari — l'ancien exercice sort ;
  //   · `tempo`, `reps`, `salle` : un pari accepté (`marche : leviers`, `levier`, le plafond au moment du choix, la visée de
  //     « reps ») SANS `origine` : il s'observe comme toute marche, par le progrès avant le prochain déclenchement ;
  //   · `garder` : un pari refusé — la phrase de maintien reste, les leviers restent sur la page de l'exercice, et la série de
  //     plus puis la dégressive continuent aux déclenchements.
  // « salle » ouvre ensuite Ma salle. La démonstration garde la réponse en mémoire : aucun pari.
  async function repondreLevier(iExo, cle) {
    if (!seance || enEdition() || reponseEnCours) return;
    var p = planActuel();
    var x = p && p.exercices[iExo];
    var m = x && x.escalier;
    if (!m || !m.carte || m.carte.type !== Moteur.MARCHE_LEVIERS) return;
    var levier = (m.carte.leviers || []).filter(function (lv) { return lv.cle === cle; })[0] || null;
    if (cle !== 'garder' && !levier) return;
    if (cle === Moteur.LEVIER_REMPLACEMENT) {
      return remplacerAuPlafond(iExo, x.slug, levier.vers);
    }
    var acceptee = cle !== 'garder';
    var extra = { levier: acceptee ? cle : null, debut: seance.debut,
                  plafond: { charge: m.plafond.charge, reps: m.plafond.reps } };
    if (cle === Moteur.LEVIER_REPS) extra.visee = levier.visee;
    reponseEnCours = true;
    try {
      if (demoEscalier()) {
        demoMarches = demoMarches.concat([{ seance: seance.id, jour: Moteur.jourCivil(seance.debut), exercice: x.slug,
          marche: Moteur.MARCHE_LEVIERS, reponse: acceptee ? 'acceptee' : 'refusee', levier: extra.levier,
          compteur: m.compteur, debut: seance.debut, n: null, plafond: extra.plafond, visee: extra.visee || null }]);
      } else {
        var id = await Moteur.idDEscalier(seance.id, x.slug, Moteur.MARCHE_LEVIERS);
        await ecrirePariDeMarche(pariDeMarche(id, x, Moteur.MARCHE_LEVIERS, acceptee ? 'acceptee' : 'refusee', p, extra));
      }
    } finally {
      reponseEnCours = false;
    }
    if (seance) rendreSeance();
    if (seance && cle === Moteur.LEVIER_SALLE) ouvrirSalleProfil();
  }

  // MOTEUR §10 bis (113) — « CHANGER D'EXERCICE » : le frère prend la place de l'exercice DANS LA ROUTINE DE LA
  // SÉANCE (le geste de « Remplacer » de l'éditeur, `Routines.exerciceRemplace` : même rang, même superset, mêmes
  // séries et repos, sans charge de départ ; écrit par la file, `poserRoutineVoulue`, comme « Le coach relit ta
  // semaine »), puis dans la séance ouverte (`remplacerDansLaSeance`, le geste de « Machine prise »), rattaché à sa
  // nouvelle ligne de routine. Sans routine (une séance libre) ou dans la démonstration : la séance seule. Aucun pari
  // d'escalier : le nouvel exercice a ses paris ordinaires.
  async function remplacerAuPlafond(iExo, slug, vers) {
    if (!seance || !vers) return;
    var routine = demoEscalier() ? null : routineDeLaSeance();
    var exo = (seance.exercices || [])[iExo];
    var idLigne = null;
    if (routine && exo) {
      var lignes = routine.exercices || [];
      var j = -1;
      for (var k = 0; k < lignes.length && j < 0; k++) {
        if (lignes[k] && exo.routine_exercise_id && lignes[k].id === exo.routine_exercise_id) j = k;
      }
      for (var k2 = 0; k2 < lignes.length && j < 0; k2++) if (lignes[k2] && lignes[k2].exercise_slug === slug) j = k2;
      if (j >= 0) {
        var voulues = lignes.map(function (l, i) {
          if (i !== j) return l;
          // La note parlait de l'ancien exercice : elle part, comme dans la séance (`Seance.remplacerExercice`).
          return Object.assign(Routines.exerciceRemplace(l, vers, mesuresDuRemplacement(l.exercise_slug, vers)), { id: uuid(), note: null });
        });
        idLigne = voulues[j].id;
        await poserRoutineVoulue(routine, voulues);
      }
    }
    await remplacerDansLaSeance(iExo, vers, 'plafond');
    if (idLigne && seance) {
      var exos = (seance.exercices || []).slice();
      for (var n = 0; n < exos.length; n++) {
        if (exos[n] && exos[n].exercise_slug === vers && !exos[n].routine_exercise_id &&
            !(exos[n].series || []).some(function (s) { return !!s.validee_a; })) {
          exos[n] = Object.assign({}, exos[n], { routine_exercise_id: idLigne });
          seance = Object.assign({}, seance, { exercices: exos });
          await apresGeste();
          break;
        }
      }
    }
  }

  // ── MOTEUR §9.17 (50-1) — LA CARTE DU LEST : LA RÉPONSE ──────────────────
  //
  // « J'ai du lest » et « Pas de lest » s'écrivent AU PROFIL (`lest_reponse`,
  // `lest_reponse_le`), par le MÊME chemin que la phase (`poserProfil`, local
  // d'abord puis la file du profil) : la carte ne revient jamais, sur aucun
  // appareil. Aucun pari : une réponse n'est pas une consigne.
  //
  // OUI remplace l'exercice libre par sa VERSION LESTÉE (`parent` = lui,
  // `charge = ajoutee`), à la même place — le geste de « Remplacer l'exercice »,
  // sans passer par le catalogue. Elle part de 2,5 kg au bas de la zone (§8.4).
  // NON ne change rien à la séance : les reps continuent (l'étirement).
  //
  // La démonstration (`?escalier=lest`) garde la réponse EN MÉMOIRE : rien ne
  // s'écrit, ni au profil ni ailleurs.
  var demoLest = null;
  async function repondreLest(iExo, reponse) {
    if (!seance || enEdition() || reponseEnCours) return;
    var x = planDeLExercice(iExo);
    var carte = x && x.carteLest;
    if (!carte) return;
    // 175 (MOTEUR §9.17 bis) — la carte du lest qui propose aussi la variante sans matériel : « Pompes Déclinées » s'ajoute
    // comme une marche (`marche_reponses[slug]`, `oui`), « Rester aux … » est un refus gardé (`non`) ; ni l'un ni l'autre
    // n'écrit « Pas de lest » au profil (`lestReponseDeLExercice`). « Ajouter du lest » est le `oui` d'avant.
    if (carte.variante && (reponse === 'variante' || reponse === 'non')) {
      return repondreMarche(iExo, reponse === 'variante' ? 'oui' : 'non', { cible: carte.variante.slug, aide: false });
    }
    var oui = reponse === 'oui';
    var leste = carte.leste;
    reponseEnCours = true;
    try {
      if (demoEscalier()) {
        demoLest = oui ? 'oui' : 'non';
      } else {
        await poserProfil({ lest_reponse: oui ? 'oui' : 'non', lest_reponse_le: new Date().toISOString() });
      }
    } finally {
      reponseEnCours = false;
    }
    if (seance && oui && leste && !demoEscalier()) {
      heriterRoutine(iExo, leste);
      seance = Seance.remplacerExercice(seance, iExo, leste, uuid);
      await apresStructure();
      return;
    }
    if (seance) rendreSeance();
  }

  // ── MOTEUR §9.17 bis (127) — LA CARTE « MARCHE SUIVANTE » : LA RÉPONSE ─────────
  //
  // Sur le modèle de `repondreLest` : la réponse s'écrit AU PROFIL (`marche_reponses[slug de départ]`), par le même
  // chemin (`poserProfil`, sur l'appareil d'abord, puis la file du profil). Aucun pari : une réponse n'est pas une
  // consigne.
  //   · « Ajouter … » : `{ r: 'oui', le }`, et la marche proposée entre dans la séance JUSTE AVANT l'exercice, avec
  //     2 séries de travail vides ; l'exercice de départ RESTE. Comme tout ajout, il passe par `apresStructure` (puis
  //     la semaine allégée et la ligne de plus de l'exercice ajouté). Sans historique : « Première fois ici ».
  //   · « Pas maintenant » : `{ r: 'non', le, aide }` — `aide`, la charge de la dernière séance quand l'exercice est
  //     une aide (la carte revient à une aide plus légère). La séance ne change pas.
  // La démonstration (`demoEscalier`) garde la réponse EN MÉMOIRE (`demoMarche`) : rien ne s'écrit.
  async function repondreMarche(iExo, reponse, carteLest) {
    if (!seance || enEdition() || reponseEnCours) return;
    var x = planDeLExercice(iExo);
    // 175 — `carteLest` : la réponse vient de la carte du lest (la variante sans matériel), pas de la carte « marche suivante ».
    var carte = carteLest || (x && x.carteMarche);
    if (!carte) return;
    var oui = reponse === 'oui';
    var slug = x.slug;
    var r = oui ? { r: 'oui', le: new Date().toISOString() } : { r: 'non', le: new Date().toISOString() };
    // 132 (MOTEUR §10 ter) — sur un exercice noté par nom, la réponse garde le NOM de l'élastique, jamais sa charge
    // virtuelle (`marche_reponses.*.aide` accepte un nombre ou un texte, v2_099).
    if (!oui && carte.aide) r.aide = carte.elastique !== undefined && carte.elastique !== null ? carte.elastique : carte.charge;
    reponseEnCours = true;
    try {
      if (demoEscalier()) {
        var d = Object.assign({}, demoMarche || {});
        d[slug] = r;
        demoMarche = d;
      } else {
        var toutes = Object.assign({}, (profil && profil.marche_reponses && typeof profil.marche_reponses === 'object' &&
          !Array.isArray(profil.marche_reponses)) ? profil.marche_reponses : {});
        toutes[slug] = r;
        await poserProfil({ marche_reponses: toutes });
      }
    } finally {
      reponseEnCours = false;
    }
    if (seance && oui && !demoEscalier()) {
      var avantAjout = seance.exercices;
      seance = Seance.insererExercice(seance, iExo, carte.cible, uuid, { series: Moteur.SERIES_MARCHE });
      await apresStructure();
      await allegeePourAjout(avantAjout, carte.cible);
      await ligneDePlusPourAjout(avantAjout, carte.cible);
      return;
    }
    if (seance) rendreSeance();
  }

  // MOTEUR §9.20 (51-3) — LA CARTE DE REPRISE, après une séance douloureuse.
  // Trois choix, aucun calcul ici :
  //   · « Comme avant » : la consigne normale ; le choix se range dans la
  //     séance, la carte se retire ;
  //   · « Plus léger, plus de reps » : la CORRECTION DE ZONE vers la zone
  //     suivante (le geste de l'étiquette, `poserZone`) et le REPLI figé dans
  //     la carte (§14.5) — le plan l'applique (`consigneRepli`), I35 le vérifie ;
  //   · « Sans coach cette fois » : la marque, comme « J'ai mal ».
  // 193-6 — l'index de la dernière série de travail ou de recul d'un exercice (`Modele.estTravail` : une chauffe et une dégressive
  // n'en sont pas), ou -1. Une seule définition pour les deux feuilles (séance, éditeur de routine).
  // 196 — le menu ⋯ d'une série propose-t-il « Rest-pause » ? `{ possible, aide }` ; la définition de l'exercice est celle du moteur
  // (`peutRestPause`), la semaine allégée et la zone à ménager sont lues dans le plan.
  function restPauseDeLaFeuille(iExo, iSerie) {
    var exo = seance && seance.exercices[iExo], serie = exo && exo.series[iSerie];
    var aide = 'Jusqu’à l’échec, 15 s, encore, 15 s, encore : une seule série de travail.';
    var non = { possible: false, aide: aide };
    if (!exo || !serie || !Modele.estTravail(serie)) return non;
    var charge = Number(serie.charge_kg);
    if (!(charge > 0)) return non;
    var fiche = catalogueIndexe()[exo.exercise_slug];
    if (!fiche || !Moteur.peutRestPause({ prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [],
        stab: fiche.muscles_stabilisateurs || [], equipement: fiche.equipement || null, mesure: fiche.mesure || null,
        slug: exo.exercise_slug })) return non;
    var deja = Modele.restPauseDe(exo.series);
    if (deja[iSerie] || (exo.series[iSerie + 1] && deja[iSerie + 1])) return non;
    var p = planActuel();
    var x = p && (p.exercices || []).filter(function (e) { return e.iExo === iExo; })[0];
    if (p && p.allegee) return non;
    if (x && ((x.consigne && x.consigne.allegee) || (x.menagee && !x.menagee.choisie))) return non;
    return { possible: true, aide: aide };
  }

  function derniereSerieDeTravail(series) {
    var k = -1;
    (series || []).forEach(function (q, j) { if (Modele.estTravail(q)) k = j; });
    return k;
  }

  // 193-6 (MOTEUR §9.30) — LA CARTE « DERNIÈRE SÉRIE AU MAX ? », trois gestes, aucun calcul ici :
  //   · « Oui, dans ma routine » : la marque s'écrit sur la dernière série de la routine (le chemin des routines, `poserRoutineVoulue`),
  //     se voit et s'annule ; la décision se range dans `cartes_semaine.au_max` ; la ligne de la séance porte la marque ;
  //   · « Juste aujourd'hui » : la ligne de la séance seulement (rien en base) ; la carte ne revient pas aujourd'hui ;
  //   · « Non merci » : la décision se range, elle ne revient pas pour cet exercice.
  var auMaxAujourdhui = {};
  async function repondreAuMax(iExo, cle) {
    if (!seance || enEdition() || reponseEnCours) return;
    var x = planDeLExercice(iExo);
    var carte = x && x.propositionAuMax;
    if (!carte) return;
    reponseEnCours = true;
    try {
      var toutes = Object.assign({}, reponsesDesCartes());
      var memoire = Object.assign({}, toutes.au_max && typeof toutes.au_max === 'object' ? toutes.au_max : {});
      var jour = Moteur.jourCivil(new Date());
      if (cle === 'non') {
        memoire[x.slug] = { r: 'non', le: jour };
      } else if (cle === 'aujourdhui') {
        seance = Seance.definirAuMax(seance, iExo, carte.iSerie, true);
        // la carte ne revient pas aujourd'hui : la marque est sur la ligne, `propositionAuMax` se tait d'elle-même
      } else {
        var rt = seance.routine_id ? routines.filter(function (r) { return r.id === seance.routine_id; })[0] : null;
        var voulues = rt ? Routines.marquerAuMax(rt, x.slug, true) : null;
        if (voulues) {
          await poserRoutineVoulue(rt, voulues);
          memoire[x.slug] = { r: 'oui', le: jour };
        }
        seance = Seance.definirAuMax(seance, iExo, carte.iSerie, true);
      }
      if (cle !== 'aujourdhui' && Object.keys(memoire).length) {
        toutes.au_max = memoire;
        await poserProfil({ cartes_semaine: toutes });
      }
    } finally {
      reponseEnCours = false;
    }
    await apresGeste();
  }

  // ══ 193-4 (MOTEUR §9.32) — LA SEMAINE DE TEST ══════════════════════════════════════════════════════════════════════
  //
  // La réponse vit dans `profiles.cartes_semaine.test` (par `poserProfil`, la file), sans colonne :
  //   { r: 'oui', debut, fin, le, bloc, modes: { slug: 'max' | 'serie' }, mesures: { slug: { valeur, charge, reps, source, vrai, avant, le,
  //     seance, date, arret? } }, refus: { slug: jour }, arrets: { slug: jour }, vu }
  // L'app n'y calcule rien : le plan décide (`x.semaineDeTest`), le moteur propose (`Moteur.testProposable`), le fait vient de `faits.js`
  // (`maxEstimesAvantLeTest`). Ici : poser la réponse, écrire les paris, ranger les mesures, annuler.
  function testDesCartes() {
    var t = reponsesDesCartes().test;
    return t && typeof t === 'object' && t.r === 'oui' && t.debut && t.fin ? t : null;
  }
  function jourPlus(jour, n) { return Moteur.jourCivil(new Date(Date.parse(jour + 'T12:00:00Z') + n * 86400000)); }
  var maxTestMemo = { cle: '', val: {} };
  function semaineDeTestDesEntrees(exos) {
    var T = testDesCartes();
    if (!T) return null;
    var slugs = (exos || []).map(function (x) { return x && x.exercise_slug; }).filter(Boolean);
    var cle = T.debut + '|' + slugs.join(',') + '|' + (local.series || []).length;
    if (maxTestMemo.cle !== cle) maxTestMemo = { cle: cle, val: faits.maxEstimesAvantLeTest(corpus(), slugs, T.debut),
                                                  series: faits.seriesDesMaxEstimesAvantLeTest(corpus(), slugs, T.debut) };
    return { debut: T.debut, fin: T.fin, modes: T.modes || {}, mesures: T.mesures || {}, refus: T.refus || {}, arrets: T.arrets || {},
             maxEstimes: maxTestMemo.val, seriesDuMax: maxTestMemo.series };
  }
  async function ecrireTest(test) {
    var toutes = Object.assign({}, reponsesDesCartes());
    if (test === null) delete toutes.test; else toutes.test = test;
    await poserProfil({ cartes_semaine: toutes });
  }
  // Un pari par barre, posé AVANT toute série de la semaine : « ton max tombera vers X kg » (`predictions.module = 'test'`).
  async function poserLesParisDeTest(test) {
    var maxs = faits.maxEstimesAvantLeTest(corpus(), Modele.BARRES, test.debut);
    var index = catalogueIndexe();
    for (var i = 0; i < Modele.BARRES.length; i++) {
      var slug = Modele.BARRES[i];
      var deja = (local.predictions || []).some(function (l) {
        return l && l.module === Moteur.MODULE_TEST && l.exercise_slug === slug && l.fondement && l.fondement.debut === test.debut;
      });
      var valeur = Moteur.testPari(maxs[slug], { cran: index[slug] && index[slug].pas ? index[slug].pas : undefined });
      if (deja || valeur === null) continue;
      var pari = {
        id: uuid(), user_id: idUtilisateur(), module: Moteur.MODULE_TEST, module_version: '1', emise_a: instantDuJour(), exercise_slug: slug,
        grandeur: Moteur.GRANDEUR_TEST, horizon_jours: 7, valeur_predite: valeur, borne_basse: null, borne_haute: null,
        fondement: { debut: test.debut, fin: test.fin, max_estime: maxs[slug] }, valeur_observee: null, observee_a: null, set_observe: null
      };
      local.predictions = (local.predictions || []).concat([pari]);
      await Cache.ecrireLot('predictions', [pari]).catch(function () {});
      await poser({ table: Attente.PREDICTIONS, op: Attente.UPSERT, id: pari.id, depend: pari.id, donnees: pari });
    }
  }
  async function observerLePariDeTest(slug, test, mesure, serieId) {
    var pari = (local.predictions || []).filter(function (l) {
      return l && l.module === Moteur.MODULE_TEST && l.exercise_slug === slug && l.fondement && l.fondement.debut === test.debut;
    })[0];
    if (!pari || (pari.valeur_observee !== null && pari.valeur_observee !== undefined) || !serieId) return;
    var ligne = Object.assign({}, pari, { valeur_observee: mesure.valeur, observee_a: instantDuJour(), set_observe: serieId });
    local.predictions = local.predictions.map(function (l) { return l && l.id === ligne.id ? ligne : l; });
    await Cache.ecrireLot('predictions', [ligne]).catch(function () {});
    await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: ligne.id, depend: seance ? seance.id : ligne.id, alaFin: true,
                  donnees: { valeur_observee: ligne.valeur_observee, observee_a: ligne.observee_a, set_observe: ligne.set_observe } });
  }
  // « Faire la semaine de test » — depuis la carte de fin de phase (`dossier`) ou le Profil (sans dossier). Annulable (`annulerLaSemaineDeTest`).
  async function lancerLaSemaineDeTest(dossier) {
    if (testDesCartes() && testDesCartes().fin >= jourDuJour()) return;
    var jour = jourDuJour();
    var b = dossier ? Moteur.blocEnCours(local.blocs, dossier) : null;
    var test = { r: 'oui', debut: jour, fin: jourPlus(jour, 6), le: jour, bloc: b ? b.id : null, modes: {}, mesures: {}, refus: {}, arrets: {} };
    await ecrireTest(test);
    await poserLesParisDeTest(test);
    if (b) {
      // la phase suivante recule d'une semaine : allégée → test → phase suivante
      var s = Moteur.blocSuivant(b, Moteur.blocAPhases(b, routines));
      if (s) {
        await creerBloc({ dossier: dossier, zone: s.zone, semaines: s.semaines, decharge: s.decharge, debut: jourPlus(jour, 7),
                          exercices: s.exercices, precedent: b, telQuel: true, sansZones: s.sansZones === true });
      }
    }
    rendreSaisie();
  }
  async function annulerLaSemaineDeTest() {
    await ecrireTest(null);
    rendreSaisie();
  }
  // Les gestes sur la barre testée : sa façon, « Pas aujourd'hui », « Arrêter ». Rien ne s'écrit dans une série.
  // « Ajouter ces lignes » / « Annuler » : par le chemin d'insertion des chauffes (`Seance.insererChauffes`), aux charges du plan. Rien en silence.
  async function ajouterLesLignesDeTest(iExo, annuler) {
    if (!seance || enEdition() || reponseEnCours) return;
    var x = planDeLExercice(iExo);
    var t = x && x.semaineDeTest;
    if (!t || !t.testee) return;
    if (annuler) {
      seance = Seance.retirerLignesDeTest(seance, iExo);
    } else {
      if (!t.ajout) return;
      var lignes = t.ajout.lignes.map(function (q) {
        return Object.assign([q.charge, q.reps], { test: true, type: q.type, reserve: q.reserve });
      });
      seance = Seance.insererChauffes(seance, iExo, lignes, uuid, t.ajout.suite ? 'test' : undefined);
    }
    await apresGeste({ structure: false });
  }
  async function repondreTest(iExo, cle) {
    if (cle === 'ajouter') return ajouterLesLignesDeTest(iExo, false);
    if (cle === 'annuler_lignes') return ajouterLesLignesDeTest(iExo, true);
    if (!seance || enEdition() || reponseEnCours) return;
    var x = planDeLExercice(iExo);
    var t = x && x.semaineDeTest;
    var T = testDesCartes();
    if (!t || !t.testee || !T) return;
    reponseEnCours = true;
    try {
      var neuf = Object.assign({}, T);
      var jour = jourDuJour();
      if (cle === 'mode_max' || cle === 'mode_serie') {
        if (t.essais.length) return;                       // jusqu'à l'échauffement : une fois les essais commencés, la façon ne change plus
        neuf.modes = Object.assign({}, T.modes, {}); neuf.modes[t.slug] = cle === 'mode_max' ? Moteur.TEST_MODE_MAX : Moteur.TEST_MODE_SERIE;
      } else if (cle === 'pas_aujourdhui') {
        neuf.refus = Object.assign({}, T.refus); neuf.refus[t.slug] = jour;
      } else if (cle === 'arret') {
        neuf.arrets = Object.assign({}, T.arrets); neuf.arrets[t.slug] = jour;
      } else return;
      await ecrireTest(neuf);
    } finally {
      reponseEnCours = false;
    }
    await apresGeste();
  }
  // Après chaque geste : une barre dont le test est fini (ou arrêté) range sa mesure — une fois. Le plan l'a calculée (`x.semaineDeTest.mesure`).
  async function rangerLesMesuresDeTest() {
    var T = testDesCartes();
    if (!T || !seance || enEdition()) return;
    var plan = planActuel();
    var mesures = null;
    ((plan && plan.exercices) || []).forEach(function (x) {
      var t = x && x.semaineDeTest;
      if (!t || !t.testee || (t.etat !== 'fini' && t.etat !== 'arret')) return;
      var deja = T.mesures && T.mesures[t.slug];
      if (deja && deja.seance === seance.id && (deja.valeur === (t.mesure ? t.mesure.valeur : null))) return;
      if (deja && deja.seance !== seance.id) return;
      if (t.etat === 'arret' && !t.mesure && t.essais.length === 0 && t.arret !== 'mal') return;
      mesures = mesures || Object.assign({}, T.mesures);
      mesures[t.slug] = {
        valeur: t.mesure ? t.mesure.valeur : null, charge: t.mesure ? t.mesure.charge : null, reps: t.mesure ? t.mesure.reps : null,
        source: t.mesure ? t.mesure.source : null, vrai: t.mesure ? t.mesure.vrai === true : false, avant: t.max, arret: t.arret || null,
        le: jourDuJour(), date: instantDuJour(), seance: seance.id
      };
    });
    if (!mesures) return;
    var neuf = Object.assign({}, T, { mesures: mesures });
    await ecrireTest(neuf);
    var cles = Object.keys(mesures);
    for (var i = 0; i < cles.length; i++) {
      var m = mesures[cles[i]];
      if (m && m.valeur !== null && (!T.mesures || !T.mesures[cles[i]])) {
        var x = ((plan && plan.exercices) || []).filter(function (q) { return q && q.slug === cles[i]; })[0];
        await observerLePariDeTest(cles[i], neuf, m, x && x.semaineDeTest ? x.semaineDeTest.mesureSerieId : null);
      }
    }
  }
  // Le Profil : « Semaine de test » — son état, la proposition (hors programme), l'annulation.
  function ligneSemaineDeTest() {
    if (Moteur.coachSeTait(profil && profil.intention)) return null;
    var T = testDesCartes();
    var jour = jourDuJour();
    if (T && T.fin >= jour) {
      return { libelle: 'Semaine de test', valeur: 'Jusqu’au ' + Rendu.dateCourte(T.fin), surChoix: ouvrirSemaineDeTest };
    }
    // la ligne n'existe que s'il y a quelque chose à dire : une semaine en cours, ou une proposition possible (4 semaines, pas avant une décharge)
    var prop = proposerSemaineDeTestHorsProgramme();
    return prop.propose ? { libelle: 'Semaine de test', valeur: null, surChoix: ouvrirSemaineDeTest } : null;
  }
  function proposerSemaineDeTestHorsProgramme() {
    var jour = jourDuJour();
    var debuts = (local.seances || []).map(function (s) { return s && s.debut ? Moteur.jourCivil(s.debut) : null; }).filter(Boolean).sort();
    var semaines = debuts.length ? Math.floor((Date.parse(jour + 'T12:00:00Z') - Date.parse(debuts[0] + 'T12:00:00Z')) / (7 * 86400000)) : 0;
    // la semaine précédente allégée (une allégée acceptée ou une décharge de bloc, finie dans les 8 derniers jours) ; la prochaine décharge
    var allegees = periodesAllegees();
    var precedente = allegees.some(function (p) { return p.fin < jour && p.fin >= jourPlus(jour, -8); });
    var jours = null;
    allegees.forEach(function (p) {
      if (p.debut < jour) return;
      var n = Math.round((Date.parse(p.debut + 'T12:00:00Z') - Date.parse(jour + 'T12:00:00Z')) / 86400000);
      if (jours === null || n < jours) jours = n;
    });
    var T = testDesCartes();
    return Moteur.testProposable({ programme: false, semainesEntrainement: semaines, semainePrecedenteAllegee: precedente,
                                   dechargeDansJours: jours, deja: !!T && T.fin >= jour });
  }
  function ouvrirSemaineDeTest() {
    var T = testDesCartes();
    var jour = jourDuJour();
    var actif = !!T && T.fin >= jour;
    var prop = actif ? null : proposerSemaineDeTestHorsProgramme();
    // 202 — le MÊME défaut que le plan (`Moteur.testModeParDefaut`, mêmes faits) : le débutant, 65 ans et plus, les reps de la série d'où
    // vient le max estimé. La raison du défaut se dit seulement quand la façon n'a pas été choisie.
    var maxs = actif ? faits.maxEstimesAvantLeTest(corpus(), Modele.BARRES, T.debut) : {};
    var series = actif ? faits.seriesDesMaxEstimesAvantLeTest(corpus(), Modele.BARRES, T.debut) : {};
    var barres = actif ? Modele.BARRES.map(function (slug) {
      var choisie = Moteur.testModeValide(T.modes && T.modes[slug]);
      var sr = series[slug] || null;
      var f = { debutant: Profil.estDebutant(profil), plus65: Profil.plus65DuProfil(profil, new Date()) === true, repsDuMax: sr ? sr.reps : null };
      var mode = choisie || Moteur.testModeParDefaut(f);
      var raison = choisie ? null : Moteur.testPhraseDuDefaut(Object.assign({ max: maxs[slug], chargeDuMax: sr ? sr.charge : null }, f));
      return { slug: slug, nom: nomsDuCatalogue()[slug] || slug, mode: mode, raison: raison,
               mesure: T.mesures && T.mesures[slug] ? T.mesures[slug] : null };
    }) : [];
    Rendu.rendreFeuilleSemaineDeTest($('feuille-contenu'), {
      actif: actif,
      phrase: actif ? Moteur.phraseTestEnCours() : Moteur.phraseTestPropose(prop),
      peutLancer: !actif && !!prop && prop.propose,
      libelleLancer: prop && prop.voie === 'alleger' ? 'Faire quand même la semaine de test' : 'Faire une semaine de test',
      barres: barres,
      surMode: function (slug, mode) {
        var modes = Object.assign({}, T.modes || {}); modes[slug] = mode;
        return ecrireTest(Object.assign({}, T, { modes: modes })).then(ouvrirSemaineDeTest);
      },
      surFermer: fermerVoile,
      surLancer: function () { fermerVoile(); return lancerLaSemaineDeTest(null); },
      surAnnuler: function () { fermerVoile(); return annulerLaSemaineDeTest(); }
    });
    ouvrirVoile($('feuille-seance'), function () {});
  }

  async function repondreReprise(iExo, cle) {
    if (!seance || enEdition() || reponseEnCours) return;
    var x = planDeLExercice(iExo);
    var carte = x && x.carteReprise;
    if (!carte) return;
    // 202 — « Un frère » (la douleur répétée) : la liste de §9.19, sans rien écrire ; la personne choisit.
    if (cle === 'frere') {
      var blocsF = Modele.blocsDeSeance(seance, local.exercices), iBlocF = -1;
      blocsF.forEach(function (b, k) { if (iBlocF < 0 && indicesDe(b).indexOf(iExo) >= 0) iBlocF = k; });
      if (iBlocF >= 0) ouvrirFeuilleBloc('freres', iBlocF, iExo);
      return;
    }
    reponseEnCours = true;
    try {
      if (cle === 'sans') {
        seance = Seance.marquerDouleur(seance, iExo);
      } else if (cle === 'leger' && carte.repli) {
        seance = Seance.choisirReprise(seance, x.slug, { choix: 'leger', repli: carte.repli });
        await poserZone(x.slug, carte.zone);
      } else {
        seance = Seance.choisirReprise(seance, x.slug, { choix: 'avant' });
      }
    } finally {
      reponseEnCours = false;
    }
    await apresGeste();
  }

  // §14.7 (delta 49-35) — LA LIGNE DE PLUS DE L'EXERCICE QU'ON VIENT D'AJOUTER,
  // et de lui SEUL : l'exercice nouveau (absent de `avantExos`, sans série
  // faite), s'il a une série de plus en cours. Le même geste qu'à l'ouverture
  // (`lignesAAjouter`), restreint à lui : une ligne retirée ailleurs par la
  // personne ne revient pas (§14.3).
  // L'exercice nouveau : absent de `avantExos`, sans série faite. -1 sinon.
  function exerciceAjoute(avantExos, slug) {
    var exos = (seance && seance.exercices) || [];
    for (var k = 0; k < exos.length; k++) {
      var x = exos[k];
      if (x && x.exercise_slug === slug && (avantExos || []).indexOf(x) < 0 &&
          !(x.series || []).some(function (s) { return !!s.validee_a; })) return k;
    }
    return -1;
  }

  async function ligneDePlusPourAjout(avantExos, slug) {
    if (!seance || enEdition()) return;
    var i = exerciceAjoute(avantExos, slug);
    if (i < 0) return;
    var plan = planActuel();
    var plus = Plan.lignesAAjouter(plan).indexOf(i) >= 0;
    // §14 (111) — sa dégressive proposée en cours, de même.
    var deg = Plan.degressivesAAjouter(plan).indexOf(i) >= 0;
    if (!plus && !deg) return;
    if (plus) seance = Seance.ajouterSerie(seance, i, uuid());
    if (deg) seance = Seance.ajouterDegressive(seance, i, uuid());
    await apresGeste();
  }

  // §14.4 (49-U14, consolidation 4/7) — LA SEMAINE ALLÉGÉE DE L'EXERCICE
  // QU'ON VIENT D'AJOUTER, et de lui seul : le même geste qu'à l'ouverture
  // (`lignesARetirer`), restreint à lui. Les lignes des autres exercices ont
  // déjà reçu le leur ; une ligne qu'on y a rajoutée (« + Série ») reste.
  async function allegeePourAjout(avantExos, slug) {
    if (!seance || enEdition()) return;
    var i = exerciceAjoute(avantExos, slug);
    if (i < 0) return;
    var aRetirer = Plan.lignesARetirer(planActuel(), i);
    if (!aRetirer.length) return;
    aRetirer.forEach(function (r) { seance = Seance.retirerSerie(seance, r.iExo, r.iSerie); });
    await apresGeste();
  }

  // Les séries de la routine d'un exercice, figées avec sa consigne.
  function nombreDeSeriesRoutine(slug) {
    var c = consigneDe(slug);
    return c && typeof c.seriesRoutine === 'number' && c.seriesRoutine > 0 ? c.seriesRoutine : nombreDeSeriesDeTravail(slug);
  }

  // §14.7 (49-U17) — LA LIGNE EN PLUS, une fois : à l'acceptation, et à la
  // création d'une séance pendant que la série de plus est en cours. Jamais au
  // rendu : une ligne retirée par la personne ne revient pas dans la séance.
  async function appliquerSerieDePlus() {
    if (!seance || enEdition()) return;
    var aAjouter = Plan.lignesAAjouter(planActuel());
    if (!aAjouter.length) return;
    aAjouter.forEach(function (iExo) { seance = Seance.ajouterSerie(seance, iExo, uuid()); });
    await apresGeste();
  }

  // §14 (111) — LA LIGNE DÉGRESSIVE, une fois : à l'acceptation, et à la
  // création d'une séance pendant que la dégressive proposée est en cours.
  // Jamais au rendu : une ligne retirée par la personne ne revient pas.
  async function appliquerDegressive() {
    if (!seance || enEdition()) return;
    var aAjouter = Plan.degressivesAAjouter(planActuel());
    if (!aAjouter.length) return;
    aAjouter.forEach(function (iExo) { seance = Seance.ajouterDegressive(seance, iExo, uuid()); });
    await apresGeste();
  }

  // LE REPLI S'ÉCRIT À L'OUVERTURE (`reponse : appliquee`) : pas de question.
  // Une fois par séance et par exercice — l'identifiant déterminé fait le
  // reste (un second envoi est ignoré à destination).
  var replisEcrits = {};
  async function ecrireReplis() {
    if (!seance || enEdition() || demoEscalier()) return;
    var p = planActuel();
    var aEcrire = ((p && p.exercices) || []).filter(function (x) {
      return x && x.escalier && x.escalier.marche === Moteur.MARCHE_REPLI && x.escalier.repli &&
        !replisEcrits[seance.id + '|' + x.slug];
    });
    for (var i = 0; i < aEcrire.length; i++) {
      var x = aEcrire[i];
      replisEcrits[seance.id + '|' + x.slug] = true;
      var id = await Moteur.idDEscalier(seance.id, x.slug, Moteur.MARCHE_REPLI);
      if (parisEscalierConnus().some(function (l) { return l && l.id === id; })) continue;
      var r = x.escalier.repli;
      await ecrirePariDeMarche(pariDeMarche(id, x, Moteur.MARCHE_REPLI, 'appliquee', p,
        { repli: { palier: r.palier, niveau: r.niveau, debut: r.debut } }));
    }
  }

  // L'OBSERVATION DU PARI ACCEPTÉ, SANS SÉRIE (§14.4) — SON PROPRE CHEMIN, pas
  // celui des paris de consigne (`observerSerie`, qui suppose une série) :
  // 1 si le déclencheur progresse avant son prochain déclenchement, 0 à ce
  // déclenchement, `observee_a` = le début de la séance qui tranche. Lue dans
  // les compteurs figés des paris ; posée par la file, comme toute observation.
  // La contrainte `predictions_observation_coherente` l'admet pour `module =
  // 'escalier'` seulement (`v2_052`).
  var escalierObserves = {};
  async function observerEscalier() {
    if (demoEscalier()) return;
    var compteurs = compteursDesParis();
    var paris = parisEscalierConnus();
    for (var i = 0; i < paris.length; i++) {
      var l = paris[i];
      if (!l || !l.id || escalierObserves[l.id]) continue;
      if (l.valeur_observee !== null && l.valeur_observee !== undefined) continue;
      var carte = Moteur.cartesDesParis([l])[0];
      // 189 — une carte de BAISSE (acceptée, ou « une série de moins ») se juge sur les séries elles-mêmes, 3 semaines après.
      if (carte && carte.source === Moteur.SOURCE_BAISSE) {
        var obsB = Moteur.observationBaisse(carte, entreeDeLaFatigue(Moteur.jourCivil(new Date())));
        if (!obsB) continue;
        escalierObserves[l.id] = true;
        var majB = Object.assign({}, l, { valeur_observee: obsB.valeur,
          observee_a: obsB.debut || new Date().toISOString(), set_observe: null });
        var iciB = false;
        local.predictions = (local.predictions || []).map(function (x) {
          if (!x || x.id !== majB.id) return x;
          iciB = true;
          return majB;
        });
        if (iciB) await Cache.ecrireLot('predictions', [majB]).catch(function () {});
        local.escalier = (local.escalier || []).map(function (x) { return x && x.id === majB.id ? majB : x; });
        await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: majB.id,
                      depend: carte.seance, alaFin: true, donnees: donneesObservation(majB) });
        continue;
      }
      // §14.5 (49-U15) — une marche isolée (schéma accepté, repli) s'observe
      // de même, sur les compteurs de SON exercice.
      var marche = carte ? null : Moteur.marchesDesParis([l])[0];
      // MOTEUR §10 bis (113) — un pari AU PLAFOND (série de plus, dégressive) parie de tenir le plafond : il
      // s'observe sur les séances de l'exercice (les faits), jusqu'au prochain déclenchement.
      var plafond = marche && marche.origine === Moteur.ORIGINE_SALLE_MAX;
      var obs = carte ? Moteur.observationSemaineAllegee(carte, compteurs)
        : plafond ? Moteur.observationPlafond(marche, faits.seancesDeLExercice(corpus(), marche.exercice), compteurs)
        : (marche ? Moteur.observationMarche(marche, compteurs) : null);
      if (!obs) continue;
      escalierObserves[l.id] = true;
      var maj = Object.assign({}, l, { valeur_observee: obs.valeur,
        observee_a: obs.debut || new Date().toISOString(), set_observe: null });
      var ici = false;
      local.predictions = (local.predictions || []).map(function (x) {
        if (!x || x.id !== maj.id) return x;
        ici = true;
        return maj;
      });
      if (ici) await Cache.ecrireLot('predictions', [maj]).catch(function () {});
      local.escalier = (local.escalier || []).map(function (x) { return x && x.id === maj.id ? maj : x; });
      await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: maj.id,
                    depend: (carte || marche).seance, alaFin: true, donnees: donneesObservation(maj) });
    }
  }

  // `depend` porte la séance : une prédiction ne monte jamais avant les séries
  // auxquelles son observation se référera (`set_observe` → `sets`).
  async function poserPari(ligne) {
    await poser({ table: Attente.PREDICTIONS, op: Attente.UPSERT,
                  id: ligne.id, depend: seance.id, donnees: ligne });
  }

  // ⚠️ APPARIEMENT STRICT : MÊME RANG, MÊME CHARGE. Le rang vient de
  // `Seance.couvertureSeance`, la fonction qui décide déjà quelles lignes la
  // consigne couvre (§9.13) — deux numérotations diraient deux séances
  // différentes. La charge doit être celle qui a été proposée : une série
  // faite à une autre charge n'observe rien, et la ligne reste sans
  // observation. C'est un fait à mesurer, pas un manque — elle dira combien de
  // fois le moteur a proposé ce qui n'a pas été suivi.
  //
  // ⚠️ ET ELLE RETIRE AUTANT QU'ELLE POSE. Une observation qui ne se retirerait
  // pas serait pire que pas d'observation du tout : corriger 130 en 140 après
  // coup, ou dévalider la série, laisserait en base un fait FAUX — dans la
  // table même qui existe pour dire si le moteur a eu raison. Trois chemins y
  // mènent : la validation, la dévalidation, et la frappe dans un champ.
  //
  // Appelée APRÈS `poserSeries` : la série doit être posée avant la prédiction
  // pour que la clé étrangère de `set_observe` trouve sa ligne.
  async function observerSerie(iExo, iSerie) {
    if (!seance || enEdition()) return;
    var exo = (seance.exercices || [])[iExo];
    if (!exo) return;
    var serie = (exo.series || [])[iSerie];
    if (!serie) return;
    // §9.14 (49-R2) — le rang se lit sur la RÉACTION, le seul lecteur de la
    // consigne ; la consigne mémorisée à l'ouverture n'est plus relue ici.
    var r = reactionDe(iExo);
    if (!r) return;
    var j = r.indices.indexOf(iSerie);
    var rang = j < 0 ? null : r.rangs[j];
    // 193-1 — le rang d'un recul est « r1 », « r2 »… (son ordre parmi les reculs de l'exercice), jamais un rang de la couverture.
    if (Modele.estRecul(serie)) {
      var kr = 0;
      for (var ir = 0; ir <= iSerie; ir++) if (Modele.estRecul(exo.series[ir])) kr += 1;
      rang = 'r' + kr;
    }
    // ⚠️ TOUS LES PARIS DU RANG, jamais le premier trouvé (§9.11, P7). Après
    // un rechargement, les lignes se relisent dans l'ordre de leur identifiant
    // haché : « le premier » serait un pari au hasard. Chacun se juge sur SES
    // charges — celui dont la charge a été faite compte ses reps, l'autre se
    // lit « autre chose tenté ».
    //
    // ⚠️ ET UNE OBSERVATION NE CHANGE JAMAIS DE SÉRIE (§9.11, 49-8). Le rang
    // se relit sur la liste actuelle et glisse quand une série est ajoutée ou
    // supprimée : `parisAObserver` rend les paris de CETTE série, où qu'ils
    // soient, et ceux de son rang que personne d'autre ne tient.
    // ⚠️ SANS IDENTIFIANT, PAS D'OBSERVATION (49-U7 bis) : un pari encore
    // provisoire (`enregistrerPari`, avant `finirPari`) est ignoré ici. Une
    // frappe qui croise la validation l'observait, et l'observation partait
    // vers `id = null` — deux paris du même rang, et aucun en base.
    // Prérequis d'« adapter » — et LES PARIS DE CETTE OCCURRENCE seulement : la
    // seconde occurrence d'un exercice n'observe pas ceux de la première.
    var paris = Seance.parisDeLOccurrence(local.predictions || [], seance, iExo).filter(function (l) {
      return !!l.id;
    });
    var aLire = Seance.parisAObserver(paris, serie, rang, exo.series);
    for (var p = 0; p < aLire.length; p++) await observerPari(aLire[p], serie, exo.series);
  }

  // §9.11 (49-8) — UNE SÉRIE SUPPRIMÉE EMPORTE SON OBSERVATION. En base, le
  // déclencheur `sets_efface_observation` le fait déjà (v2_047) ; la copie
  // locale doit dire la même chose, sinon la ligne garderait des reps comptées
  // sur une série qui n'existe plus. Rien n'est ré-observé ensuite sur une
  // autre série : c'est `parisAObserver` qui le garantit.
  async function oublierObservationDe(iExo, iSerie) {
    var exo = seance && (seance.exercices || [])[iExo];
    var s = exo && (exo.series || [])[iSerie];
    var id = s && s.id;
    if (!id) return;
    var ids = {};
    ids[id] = true;
    return oublierObservationsDesSeries(ids);
  }

  // Prérequis d'« adapter » (04/10/2026) — SUPPRIMER UN EXERCICE EMPORTE LES
  // OBSERVATIONS DE SES SÉRIES, comme une série supprimée emporte la sienne.
  // Avant, seule la suppression d'une SÉRIE vidait l'observation sur
  // l'appareil : un exercice supprimé laissait ses paris observés sur des
  // séries disparues, quand la base, elle, les a déjà vidés (le déclencheur
  // `sets_efface_observation`, v2_047). Les PARIS restent : ce que le coach a
  // proposé a été proposé (table immuable). À appeler AVANT de retirer les exercices : les
  // séries se lisent sur la séance. La partie synchrone (la copie locale) est
  // faite dès l'appel, avant le redessin.
  function oublierObservationsDesExercices(indices) {
    var ids = {};
    (indices || []).forEach(function (i) {
      var exo = seance && (seance.exercices || [])[i];
      ((exo && exo.series) || []).forEach(function (s) { if (s && s.id) ids[s.id] = true; });
    });
    return oublierObservationsDesSeries(ids);
  }

  async function oublierObservationsDesSeries(ids) {
    return ecrireObservationsVidees(viderObservationsEnMemoire(ids).maj);
  }

  // La partie SYNCHRONE : la mémoire seulement (ni le disque, ni la file). Rend les lignes d'avant (`avant`) et
  // les lignes vidées (`maj`), dans le même ordre. 115 (E2) — séparée de l'écriture pour qu'un glissement
  // rattrapable ne touche à rien d'autre que la mémoire tant qu'« Annuler » est possible.
  function viderObservationsEnMemoire(ids) {
    var avant = [], maj = [];
    local.predictions = (local.predictions || []).map(function (l) {
      if (!l || !l.set_observe || !ids[l.set_observe]) return l;
      var m = Object.assign({}, l, { set_observe: null, valeur_observee: null, observee_a: null });
      avant.push(l);
      maj.push(m);
      return m;
    });
    return { avant: avant, maj: maj };
  }

  async function ecrireObservationsVidees(maj) {
    if (maj.length) await Cache.ecrireLot('predictions', maj).catch(function () {});
    // La base le fait déjà (le déclencheur) ; l'entrée qui partirait encore
    // avec l'ancienne observation est remplacée par la vraie, vide — sinon
    // elle attendrait pour toujours une série qui ne reviendra pas.
    for (var k = 0; k < maj.length; k++) await poserObservation(maj[k]);
  }

  // ══ 115 — LE GLISSEMENT QUI EFFACE UNE SÉRIE FAITE SE RATTRAPE (audit du 16/10, E2 ; décision D10) ══
  //
  // ⚠️ LA SUPPRESSION RÉELLE ATTEND LA FIN DU DÉLAI. Une série faite qui part en base emporte, par les
  // déclencheurs, son observation (`sets_efface_observation`) et ses records (`sets_efface_records`) ; la remettre
  // ensuite, ce serait l'écrire deux fois, et ses records ne reviendraient pas. Donc, au glissement, rien ne part :
  // la ligne quitte l'écran et la mémoire (la séance, l'observation de son pari), le toast « Série supprimée ·
  // Annuler » s'affiche. « Annuler » remet le MÊME objet au même indice (`Seance.remettreSerie`) et l'observation
  // d'avant : charge, reps, type, rang, pari, record — rien n'a quitté l'appareil. À la fin du délai, ou au
  // premier geste qui enregistre (`sauverSeance`, `poserSeries` : la séance enregistrée doit être celle qu'on
  // voit), la suppression part par le chemin de toujours — l'observation vidée, puis les séries.
  // Une série NON faite part tout de suite, comme avant : il n'y a rien à rattraper.
  var DELAI_ANNULER_MS = 5000;
  var suppressionDifferee = null;   // { sessionId, iExo, iSerie, serie, slug, reste, avant, maj, minuteur }

  function idsDesSeries(exo) {
    return ((exo && exo.series) || []).map(function (x) { return x && x.id; }).join('|');
  }

  // 122 (I8) — LE RANG DU PLAN d'une série FAITE et couverte, lu AVANT le geste qui la retire de la couverture
  // (supprimée, ou passée hors du travail) : son pari reste, son rang n'est plus donné à une autre (`Seance.quitterRang`).
  // `null` : une série non validée (aucun pari ne la lie), hors du coach, ou en Édition.
  function rangDuPlanQuitte(iExo, iSerie) {
    var s = seance && seance.exercices[iExo] && seance.exercices[iExo].series[iSerie];
    if (!s || !Seance.partEnBase(s) || enEdition()) return null;
    var x = planDeLExercice(iExo);
    var l = x && x.lignes ? x.lignes[iSerie] : null;
    return l && l.role !== 'hors' && l.rang ? l.rang : null;
  }

  async function differerSuppression(iExo, iSerie) {
    // Une suppression déjà en attente part d'abord : un seul « Annuler » à la fois, le dernier geste.
    await solderSuppression();
    var exo = seance && (seance.exercices || [])[iExo];
    var s = exo && (exo.series || [])[iSerie];
    if (!s) return;
    var ids = {};
    if (s.id) ids[s.id] = true;
    var rangQuitte = rangDuPlanQuitte(iExo, iSerie);
    var videes = viderObservationsEnMemoire(ids);
    seance = Seance.quitterRang(Seance.retirerSerie(seance, iExo, iSerie), iExo, rangQuitte);
    var p = { sessionId: seance.id, iExo: iExo, iSerie: iSerie, serie: s, slug: exo.exercise_slug, rang: rangQuitte,
              reste: idsDesSeries(seance.exercices[iExo]), avant: videes.avant, maj: videes.maj, minuteur: null };
    suppressionDifferee = p;
    p.minuteur = setTimeout(function () {
      if (suppressionDifferee !== p) return;
      solderSuppression().catch(function (err) { console.warn('Suppression de série :', texteErreur(err)); });
    }, DELAI_ANNULER_MS);
    rendreSeance();
    rendreToastAnnuler();
  }

  // La suppression part pour de vrai : l'observation vidée (disque, file), puis la séance et ses séries — ce
  // que faisait le glissement d'avant, dans le même ordre. Une séance qui n'est plus celle du glissement
  // (« Quitter », changement de compte) : rien à écrire, la mémoire est déjà partie avec elle.
  async function solderSuppression() {
    var p = suppressionDifferee;
    if (!p) return;
    suppressionDifferee = null;
    clearTimeout(p.minuteur);
    rendreToastAnnuler();
    if (!seance || seance.id !== p.sessionId) return;
    await ecrireObservationsVidees(p.maj);
    await sauverSeance();
    await poserSeries();
    ecrireReplis().catch(function () {});
  }

  // « Annuler » : la série revient entière, à sa place. Si l'exercice a bougé entre-temps (aucun geste ne le
  // devrait : tout ce qui enregistre solde d'abord), on ne devine pas une place — la suppression part.
  function annulerSuppression() {
    var p = suppressionDifferee;
    if (!p) return;
    var exo = seance && seance.id === p.sessionId ? (seance.exercices || [])[p.iExo] : null;
    if (!exo || exo.exercise_slug !== p.slug || idsDesSeries(exo) !== p.reste) {
      solderSuppression().catch(function (err) { console.warn('Suppression de série :', texteErreur(err)); });
      return;
    }
    suppressionDifferee = null;
    clearTimeout(p.minuteur);
    seance = Seance.rendreRang(Seance.remettreSerie(seance, p.iExo, p.iSerie, p.serie), p.iExo, p.rang);
    var avantParId = {};
    p.avant.forEach(function (l) { avantParId[l.id] = l; });
    local.predictions = (local.predictions || []).map(function (l) { return (l && avantParId[l.id]) || l; });
    rendreToastAnnuler();
    rendreSeance();
  }

  // Changement de compte, « Quitter » : la séance part avec la mémoire, la suppression en attente aussi, sans rien
  // écrire au nom du compte suivant.
  function oublierSuppressionDifferee() {
    if (suppressionDifferee) clearTimeout(suppressionDifferee.minuteur);
    suppressionDifferee = null;
    rendreToastAnnuler();
  }

  function rendreToastAnnuler() {
    var noeud = $('toast-seance');
    if (!noeud) return;
    Rendu.rendreToastAnnuler(noeud, suppressionDifferee
      ? { texte: 'Série supprimée', libelle: 'Annuler', surAnnuler: annulerSuppression } : null);
    mesurerBarres();
  }

  // §9.11 (27/09/2026) — L'OBSERVATION PART PAR SA PROPRE ENTRÉE, EN FIN DE
  // FILE : derrière son pari (même identifiant, posé avant elle) et derrière
  // les séries qu'elle désigne (`poserSeries` passe avant). Voir `attente.js`.
  async function poserObservation(ligne) {
    await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: ligne.id,
                  depend: seance.id, alaFin: true,
                  donnees: donneesObservation(ligne) });
  }

  function donneesObservation(l) {
    return {
      valeur_observee: l.valeur_observee === undefined ? null : l.valeur_observee,
      observee_a: l.observee_a === undefined ? null : l.observee_a,
      set_observe: l.set_observe === undefined ? null : l.set_observe
    };
  }

  // Ce que la base a CONFIRMÉ, sur la copie locale : l'observation n'est
  // « posée » qu'une fois la base d'accord. Sans cette trace, une observation
  // perdue en route restait « posée » en local, et rien ne la renvoyait.
  function confirmee(l, vue) {
    var c = l && l.observation_confirmee;
    return !!c && c.set_observe === vue.set_observe && c.valeur_observee === vue.valeur_observee;
  }

  function observationEnFile(id) {
    var cle = Attente.cleDe(Attente.OBSERVATIONS, id);
    return (attente || []).some(function (e) { return e.cle === cle; });
  }

  async function confirmerObservation(op) {
    var d = op.donnees || {};
    var maj = null;
    local.predictions = (local.predictions || []).map(function (l) {
      if (!l || l.id !== op.id) return l;
      maj = Object.assign({}, l, { observation_confirmee: {
        set_observe: d.set_observe === undefined ? null : d.set_observe,
        valeur_observee: d.valeur_observee === undefined ? null : d.valeur_observee } });
      return maj;
    });
    if (maj) await Cache.ecrireLot('predictions', [maj]).catch(function () {});
  }

  async function observerPari(ligne, serie, series) {
    // La garde, au plus près de l'écriture : une ligne observée sur une AUTRE
    // série, encore en base, n'est jamais réécrite par celle-ci.
    if (!Seance.peutObserver(ligne, serie, series)) return;
    var enBase = Seance.partEnBase(serie);
    // MOTEUR §9.11, §17.4 révisés (68B) — l'observation compte les reps
    // FAITES : une série à fond n'en perd plus une (ce qui se dit et s'observe).
    var vue = Moteur.observationDe(ligne.fondement, {
      enBase: enBase, id: serie.id, charge: serie.charge_kg,
      reps: enBase && serie.reps !== undefined ? serie.reps : null
    });
    var etaitSienne = ligne.set_observe && serie.id && ligne.set_observe === serie.id;
    // Ni reliée maintenant, ni reliée par cette série avant : rien à dire.
    if (vue.set_observe === null && !etaitSienne) return;
    // Rien n'a changé — et `surChamp` passe ici à CHAQUE FRAPPE : sans cette
    // sortie, taper « 130 » poserait trois fois la même intention.
    //
    // ⚠️ « RIEN N'A CHANGÉ » VEUT DIRE : LA BASE EST D'ACCORD, OU L'ENVOI EST EN
    // FILE (27/09/2026). La copie locale seule ne suffit pas : une observation
    // refusée en route y restait « posée », et la revalidation de sa série ne
    // renvoyait rien.
    var memeLocale = ligne.set_observe === vue.set_observe &&
      ligne.valeur_observee === vue.valeur_observee;
    if (memeLocale && (confirmee(ligne, vue) || observationEnFile(ligne.id))) return;

    // `observee_a` DATE UNE OBSERVATION, et « autre chose tenté » n'en est pas
    // une : la série est reliée, rien n'est compté, la colonne reste vide. Une
    // observation renvoyée telle quelle garde sa date.
    var maj = Object.assign({}, ligne, {
      set_observe: vue.set_observe,
      valeur_observee: vue.valeur_observee,
      observee_a: vue.valeur_observee === null ? null
        : (memeLocale && ligne.observee_a ? ligne.observee_a : new Date().toISOString())
    });
    local.predictions = local.predictions.map(function (l) {
      return l && l.id === maj.id ? maj : l;
    });
    await Cache.ecrireLot('predictions', [maj]).catch(function () {});
    await poserObservation(maj);
  }

  // ── §9.14 (49-R2) — LA RÉACTION SÉRIE PAR SÉRIE, BRANCHÉE ────────────────
  //
  // `Moteur.reactionPour` relit la consigne après chaque série VALIDÉE. Ses
  // entrées : la consigne et son contexte (mémoïsés à l'ouverture, une fois
  // par séance et par exercice, sur les séances antérieures), le plan de la
  // séance EN COURS (49-C : toutes ses séries de travail, les validées figées)
  // et les séries validées couvertes, dans l'ordre. Pas de mémo : c'est de
  // l'arithmétique sur une poignée de séries, et chaque lecture voit donc
  // l'état courant — une validation, une dévalidation, une correction, un
  // effort saisi après coup, une série ajoutée ou retirée.
  //
  // ⚠️ `faites` S'ARRÊTE À LA PREMIÈRE SÉRIE NON VALIDÉE. La réaction lit la
  // série i comme la ligne i du plan : une série tapée mais non validée, ou un
  // trou, décalerait tout. Le silence « la séance compte moins de séries que
  // la consigne » (#318) n'existe plus : la consigne couvre les séries de la
  // séance, il n'y a plus rien à aligner (§9.14, retiré le 26/09/2026).
  //
  // Rend, par POSITION (l'index dans le plan) : `indices` (l'index de la série
  // dans l'exercice), `rangs` et `roles` ; et `figees`, `planInitial`,
  // `faites`, `reaction`.
  // 49-U1 — LE PLAN DE L'EXERCICE, lu dans le plan de séance : la même
  // couverture, les mêmes lignes figées, la même réaction pour la grille, la
  // phrase, les paris et l'observation. Plus aucun recalcul ici.
  function reactionDe(iExo) {
    var p = planActuel();
    var x = p && p.exercices[iExo];
    return x && x.consigne ? x : null;
  }

  // ⚠️ LE REDESSIN ATTEND QUE LA SAISIE SOIT FINIE. Corriger la charge d'une
  // série validée puis toucher ses reps fait SORTIR du premier champ : un
  // redessin à cet instant détruirait le champ qu'on vient de toucher — le
  // clavier se fermerait sous le doigt. On marque la réaction périmée, et on
  // ne redessine que lorsque le focus a quitté TOUS les champs du journal.
  // Une validation, elle, redessine de toute façon.
  var reactionPerimee = false;
  var ecouteSortie = false;

  function redessinerSiSaisieFinie() {
    if (!reactionPerimee || !seance) return;
    var a = doc.activeElement;
    if (a && a.tagName === 'INPUT' && a.closest && a.closest('#blocs-seance')) return;
    reactionPerimee = false;
    apresGeste().catch(function () { /* la file garde la séance */ });
  }

  function ecouterSortieDesChamps() {
    if (ecouteSortie) return;
    ecouteSortie = true;
    doc.addEventListener('focusout', function () {
      if (reactionPerimee) setTimeout(redessinerSiSaisieFinie, 0);
    });
  }

  // ⚠️ LE FANTÔME D'UNE LIGNE COUVERTE VIENT DU PLAN, ET DE LUI SEUL
  // (§9.13 bis, 49-U2). Tant que la dernière série faite a suivi sa ligne, la
  // ligne affiche le plan ; sinon elle recopie la dernière série faite, charge
  // ET reps ensemble. L'ancienne cascade (`Seance.fantome`) prenait la charge
  // dans la saisie et les reps dans le plan : le « 125 × 4 » après un refus.
  // Elle ne sert plus qu'aux lignes hors plan — chauffes, dégressives, séries
  // sans consigne —, où rien ne change. La durée et la distance, qu'aucune
  // consigne ne porte, gardent leur règle.
  // PR 3 (relevé du 01/10) — LE PRÉ-REMPLISSAGE SE LIT DANS LE PLAN, pour
  // TOUTES les lignes (`l.prerempli`, `THPlan` : `preremplir`). Il fusionnait
  // ici deux sources — la cascade d'avant le plan et le fantôme du plan — et
  // ce qui s'affichait en gris s'écrivait en base à la validation.
  function fantomeDe(iExo, iSerie) {
    var x = planDeLExercice(iExo);
    var l = x && x.lignes && x.lignes[iSerie];
    return l && l.prerempli ? l.prerempli : { charge_kg: null, reps: null, duree_s: null, distance_m: null };
  }

  // Ce que la grille montre de la réaction sur UNE ligne : la phrase au-dessus
  // d'elle (`message.rang`), et la ligne proposée — filet, charge en couleur du
  // coach, fourchette dans le champ des reps. La phrase vient de
  // `phraseReaction`, jamais recalculée ici.
  function reactionSurLigne(iExo, iSerie) {
    // MOTEUR §9.15 (49-U10) — la phrase des chauffes, au-dessus de la première
    // ligne de chauffe ; celle de la dégressive, au-dessus d'elle. Du plan,
    // jamais recomposées ici.
    var x = planDeLExercice(iExo);
    if (x && x.chauffes && x.chauffes.phrase && x.chauffes.iSerie === iSerie) {
      return { message: { type: 'chauffe', phrase: x.chauffes.phrase }, proposee: false, fourchette: null };
    }
    // 193-6 (MOTEUR §9.30) — la consigne de la dernière série « Au max », au-dessus d'elle tant qu'elle n'est pas faite ; du plan.
    if (x && x.auMax && x.auMax.iSerie === iSerie && x.lignes && x.lignes[iSerie] && !x.lignes[iSerie].validee) {
      return { message: { type: 'au_max', phrase: x.auMax.consigne }, proposee: false, fourchette: null };
    }
    // 193-1 (MOTEUR §9.28) — la phrase des reculs, au-dessus du premier recul tant qu'il reste un recul à faire ; du plan.
    // 200-7 — quand le « Pourquoi » porte la phrase du recul (`pourquoi.reculPhrase`), elle ne s'affiche plus au-dessus de la ligne.
    if (x && x.reculs && x.reculs.phrase && !(x.pourquoi && x.pourquoi.reculPhrase) && x.reculs.iSerie === iSerie && x.lignes && x.lignes[iSerie] && !x.lignes[iSerie].validee) {
      return { message: { type: 'recul', phrase: x.reculs.phrase }, proposee: false, fourchette: null };
    }
    // 151 (MOTEUR §9.15.3) — la chaîne des baisses : la première, puis la seconde (« 2ᵉ baisse »), puis les lignes en trop.
    var chaineDeg = x ? (x.degressive ? [x.degressive] : []).concat(x.degressivesPlus || []) : [];
    var dg = chaineDeg.filter(function (q) { return q.phrase && q.iSerie === iSerie; })[0];
    if (dg) {
      var md = { type: 'degressive', phrase: dg.phrase };
      // §9.15.3 (94) — la ligne vide porte ses deux gestes (hors Édition).
      if (dg.gestes && !enEdition()) md.gestes = dg.gestes.slice();
      return { message: md, proposee: false, fourchette: null, baisse: dg.rang || 1 };
    }
    // 149 (MOTEUR §9.17 ter) — UNE FIGURE EN SECONDES : la phrase du coach au-dessus de la tenue max tant qu'elle n'est
    // pas validée, sous elle ensuite, l'étiquette « max » / « après ton max » — lues sur le plan, jamais recomposées.
    var lf = x && x.figure && x.lignes ? x.lignes[iSerie] : null;
    if (lf && lf.tenue && (lf.phraseAvant || lf.phraseApres || lf.etiquette)) {
      return { message: lf.phraseAvant ? { type: 'figure', phrase: lf.phraseAvant } : null, proposee: false, fourchette: null,
               apres: lf.phraseApres || null, etiquette: lf.etiquette || null };
    }
    // §14.7 (49-U17) — la ligne de la série de plus, marquée à la couleur du
    // coach (lue sur le plan).
    var ajoutee = !!(x && x.lignes && x.lignes[iSerie] && x.lignes[iSerie].ajoutee);
    var r = reactionDe(iExo);
    if (!r) return ajoutee ? { message: null, proposee: false, fourchette: null, ajoutee: true } : null;
    var j = r.indices.indexOf(iSerie);
    if (j < 0) return null;
    var m = r.message;
    var sortie = { message: null, proposee: false, fourchette: null };
    if (m && m.position === j) {
      sortie.message = { type: m.type, phrase: m.phrase };
    }
    var p = r.reaction.plan[j];
    var serie = seance.exercices[iExo].series[iSerie];
    if (p && p.source === 'coach' && !Seance.partEnBase(serie)) {
      sortie.proposee = true;
      sortie.fourchette = p.zone ? p.zone.slice() : null;
    }
    // MOTEUR §9.14 bis (68A) — UNE LIGNE D'ÉLAN S'AFFICHE COMME UNE LIGNE DU
    // COACH : sa charge, la fourchette, les reps à taper. `proposee` reste au
    // coach (une proposition se prend ou se refuse ; l'élan, non).
    if (p && p.source === 'elan' && !Seance.partEnBase(serie)) {
      sortie.elan = true;
      sortie.fourchette = p.zone ? p.zone.slice() : null;
    }
    if (ajoutee) sortie.ajoutee = true;
    return sortie.message || sortie.proposee || sortie.elan || sortie.ajoutee ? sortie : null;
  }

  // 58-1 — les records de la séance EN COURS (l'historique d'un exercice, la
  // séance telle que les records la lisent, les records d'une série, ceux du
  // jour) vivent dans le module des faits (`faits.js`).



  // `[gras, gris]` sous la rangée d'une série, ou rien.
  function medailleSurLigne(iExo, iSerie) {
    if (!seance) return null;
    var r = faits.recordsDeLaSerie(corpus(), seance, iExo, iSerie);
    if (!r.length) return null;
    var exo = catalogueIndexe()[seance.exercices[iExo].exercise_slug];
    var index = catalogueIndexe();
    return Modele.phraseDeRecord(r, Modele.nomCourt(exo ? exo.nom : ''), seance.debut,
      function (slug) { return index[slug] ? index[slug].nom : slug; });
  }


  // ── L'écran ─────────────────────────────────────────────────────────────
  function rendreSeance() {
    montrer('seance', Routeur.SAISIE);
    reactionPerimee = false;
    ecouterSortieDesChamps();
    var index = Modele.indexerExercices(local.exercices);
    var c = Seance.compter(seance, local.exercices);
    Rendu.rendreBandeauSeance($('bandeau-seance'), {
      titre: seance.titre || 'Séance',
      debut: seance.debut,
      compte: c,
      modifier: modeModifier,
      selection: selectionGroupe,
      // §7 octies.2 — en correction d'une séance passée, « Terminer » n'a pas
      // de sens : elle est déjà terminée, et le rester est tout l'intérêt.
      edition: enEdition(),
      // ⚠️ « TERMINÉ » ENREGISTRE, IL N'ANNULE PAS. Le bouton du bandeau dit
      // « Terminé » : un bouton qui porte ce mot et jetterait des déplacements
      // serait un piège à perte de données. Il y a DEUX sorties, et chacune
      // dit ce qu'elle fait — « Terminé » (ou « Enregistrer ») garde, « Annuler »
      // jette. C'est le pied du mode qui porte le geste destructif, jamais le
      // bandeau.
      surModifier: function () {
        if (modeModifier) return enregistrerReorganisation();
        ouvrirReorganisation();
      },
      surAnnulerSelection: function () { selectionGroupe = null; rendreSeance(); },
      surTerminer: function () { if (enEdition()) return enregistrerEdition(); confirmerFin(); }
    });
    // 62 — la barre vient d'être (re)dessinée : sa hauteur est définitive, et la
    // durée repart de l'heure juste.
    mesurerBarres();
    armerDuree();
    // 91 — le groupe de séance, une ligne en haut de la séance (lue, jamais calculée par le plan).
    dessinerGroupeSeance();
    // MOTEUR §14.4 (49-U14) — l'escalier en tête de la séance, lu sur le plan.
    var planEsc = planActuel();
    Rendu.rendreEscalier($('escalier-seance'), {
      carte: planEsc ? planEsc.carte : null,
      attendue: planEsc ? planEsc.baisseAttendue : null,   // 198 : la phrase de la baisse attendue en sèche (sans geste)
      allegee: planEsc ? planEsc.allegee : null,
      refus: refusMontre === seance.id ? Moteur.PHRASE_REFUS : null,
      surAlleger: function () { repondreCarte('acceptee'); },
      surRefuser: function () { repondreCarte('refusee'); },
      // 189 — la 3ᵉ réponse (en sèche) et le bandeau de la décision en cours, avec son geste.
      surSerieDeMoins: function () { repondreCarte(Moteur.REPONSE_SERIE_DE_MOINS); },
      serieDeMoins: planEsc ? planEsc.serieDeMoins : null,
      surRevenir: function () { revenirAuxSeries().catch(function (e) { console.warn('Séries non rétablies :', texteErreur(e)); }); }
    });
    var blocs = Modele.blocsDeSeance(seance, local.exercices);
    Rendu.rendreBlocsSeance($('blocs-seance'), seance, {
      // ⚠️ LES BLOCS VIENNENT DE LA MÊME FONCTION QUE LE DÉTAIL DE SÉANCE
      // (§2.1) : un exercice seul est un bloc d'un seul, un superset un bloc
      // de 2 à 6, et l'entrelacement A1/B1/A2/B2 en sort tout fait.
      blocs: blocs,
      // §5.3 — le mode Modifier replie tout sur une ligne par bloc.
      modifier: modeModifier,
      // §7 vicies.2 — et, replié, chaque bloc porte une poignée de glissement.
      reorganiser: modeModifier,
      // §5.7 — le bloc en attente d'un partenaire de superset, s'il y en a un.
      selection: selectionGroupe,
      surGrouper: function (a, b) { grouperBlocs(blocs, a, b); },
      surDeplacerBloc: function (i, d) { deplacerBloc(blocs, i, d); },
      surMenuBloc: function (i) { ouvrirFeuilleBloc('bloc', i, null); },
      surMenuExercice: function (i, iExo) { ouvrirFeuilleBloc('exercice', i, iExo); },
      // §2.8 — un tap sur le nom d'un exercice donne sa page (§7 quater). La
      // séance n'est pas quittée : elle reste visible en bandeau là-bas, avec
      // « Reprendre ».
      surExercice: function (slug) { afficherExercice(slug); },
      // §2.7 — le tour atteint, marque MONOTONE portée par la séance.
      tourAtteint: function (groupe) { return Seance.tourAtteint(seance, groupe); },
      // La fiche du catalogue, d'où la vue tire la MESURE — donc le gabarit de
      // ligne. `undefined` si le catalogue n'est pas encore là : `gabaritDe`
      // retombe alors sur `charge_reps` sans rien affirmer.
      exercice: function (slug) { return index[slug]; },
      // 132 (ECRAN-SAISIE §3 ter.6) — un exercice noté par nom : la colonne « ÉLASTIQUE », et sa feuille de choix.
      elastique: elastiqueDeLaGrille,
      // 163 — un exercice à l'élastique sans liste déclarée : la colonne « Élastique » propose « Ajoute tes élastiques ».
      elastiqueAAjouter: elastiqueAAjouter,
      surElastique: function (i, j) { ouvrirFeuille('elastique', i, j); },
      precedent: precedentDe,
      fantome: function (i, j) {
        return fantomeDe(i, j);
      },
      // §3.1 — la voix du moteur dans l'en-tête : les lignes jaunes et la
      // phrase grise, ou rien (Édition, Entretenir, mesure sans charge).
      libelles: libellesDe,
      habituelle: habituelleDe,
      // §3.8 — l'étiquette de zone, à côté du nom, et son menu (48b-7).
      etiquette: etiquetteDe,
      zoneChoisie: function (slug) { return !!zoneDe(slug); },
      // 193-3 — un exercice dont la zone vient de la routine ouvre les DEUX choix (jamais `poserZone` : une correction durable
      // n'efface pas en silence la zone du plan) ; les autres, la feuille de zone d'avant.
      surZone: function (slug) {
        if (zonePlanDe(slug) && !enEdition()) ouvrirZonePlan(slug);
        else if (etiquetteDe(slug) || modeDe(slug) === 'entretien') ouvrirZone(slug);
      },
      // §3.10 — toucher la consigne ouvre le calcul.
      surPourquoi: ouvrirPourquoi,
      // 201 — une étiquette de la ligne (« 5+ · garde 1 ») ouvre la définition de son mot.
      surMot: ouvrirMot,
      // §3.9 — et quand l'exercice est fini, le constat prend sa place.
      constat: constatPour,
      surChamp: async function (i, j, champ, valeur) {
        // 185 — des reps négatives ou décimales sont REFUSÉES sur place, sans question : rien n'est écrit, la ligne le dit
        // (sans redessiner, le focus reste dans le champ). Un entier retire le refus.
        if (champ === 'reps') {
          var lu = Modele.lireNombre(valeur);
          var refus = lu !== null && (lu < 0 || Math.floor(lu) !== lu) ? faits.vraisemblanceDeLaSerie({ reps: lu }, {}) : null;
          if (refus) {
            poserQuestionDeSaisie(i, j, 'avant', refus);
            Rendu.montrerQuestion($('blocs-seance'), i, j, questionSurLigne(i, j), function () {});
            return;
          }
        }
        // Une valeur retapée périme la question posée sur cette série (elle se repose à la validation).
        if (questionDe(i, j)) {
          retirerQuestionDeSaisie(i, j);
          Rendu.retirerQuestion($('blocs-seance'), i, j);
        }
        seance = Seance.modifierSerie(seance, i, j, defObjet(champ, valeur));
        rafraichirConstats();
        await apresGeste({ rendre: false });
        // §9.11 — une valeur corrigée sur une série DÉJÀ validée : l'observation
        // suit, ou se retire si la charge ne correspond plus.
        await observerSerie(i, j);
      },
      surValider: validerSerieSansRebond,
      // 185 — la question de vraisemblance, sous la série : lue ici, répondue par `repondreQuestionDeSaisie`.
      questionSaisie: questionSurLigne,
      surQuestion: repondreQuestionDeSaisie,
      // §9.14 (49-R2) — la phrase du coach et la ligne proposée.
      reaction: reactionSurLigne,
      // 154 (MOTEUR §9.26) — l'effort visé : « garde-en N » dans l'en-tête, les puces sous la dernière série.
      reserveVisee: function (iExo) {
        var x = planDeLExercice(iExo);
        return x && x.reserveVisee !== undefined ? x.reserveVisee : null;
      },
      // 200-3 — UNE PUCE D'INTENTION par exercice : « 6-8 reps · garde 1 » (la fourchette de la zone, la réserve visée) ; `null` quand
      // l'étiquette de zone ne dit pas une zone chiffrée (zone à ménager, entretien). Les deux valeurs viennent de la consigne et du plan.
      puceIntention: function (slug, iExo) {
        var eti = etiquetteDe(slug, iExo), c = eti ? consigneDe(slug) : null;
        var z = c && c.consigne ? Moteur.zoneParCle(c.consigne.zone) : null;
        if (!z || /m\u00e9nager/.test(eti)) return null;
        var x = planDeLExercice(iExo), g = x && x.reserveVisee !== undefined ? x.reserveVisee : null;
        var reps = z.bas + '-' + z.haut + '\u00a0reps';
        return { texte: reps + (g !== null ? ' \u00b7 garde\u00a0' + g : ''), aria: z.bas + ' \u00e0 ' + z.haut + ' reps' + (g !== null ? ', garde ' + g + ' en r\u00e9serve' : '') };
      },
      // 200-4 — l'étiquette d'une ligne « Au max » qui GARDE N reps : « 5+ · garde 1 » ; `null` quand la consigne est l'échec.
      etiquetteAuMax: function (iExo, iSerie) {
        var x = planDeLExercice(iExo), l = x && x.lignes ? x.lignes[iSerie] : null;
        if (!l || !l.auMax || l.auMax.reserve === null || l.auMax.reserve === undefined || !(l.auMax.reserve >= 1)) return null;
        var f = fantomeDe(iExo, iSerie).reps, n = f === null || f === undefined ? null : f;
        return { texte: (n !== null ? n : '') + (n !== null ? '+ \u00b7 ' : '') + 'garde\u00a0' + l.auMax.reserve,
                 aria: (n !== null ? n + ' ou plus, ' : '') + 'garde ' + l.auMax.reserve + ' en r\u00e9serve' };
      },
      // 175 — « un cran de moins » : le badge du recul (174), à côté du chiffre du jour.
      cranDeMoins: function (iExo) {
        var x = planDeLExercice(iExo);
        return x && x.cranDeMoins ? x.cranDeMoins : null;
      },
      effortVise: effortViseSurLigne,
      // MOTEUR §9.23 (55-1) — la médaille, sous la rangée d'une série validée.
      medaille: medailleSurLigne,
      // ⚠️ CORRIGER AU CLAVIER UNE SÉRIE VALIDÉE REDESSINE LE BLOC (P10), mais
      // à la SORTIE du champ, pas à chaque frappe : redessiner à la frappe
      // volerait le focus au milieu de « 130 ». La réaction se refait alors sur
      // la valeur finale.
      surChampQuitte: function (i, j) {
        var s0 = seance && seance.exercices[i] && seance.exercices[i].series[j];
        if (!s0 || !Seance.partEnBase(s0)) return;
        reactionPerimee = true;
        setTimeout(redessinerSiSaisieFinie, 0);
      },
      surNumero: function (i, j) { ouvrirFeuille('type', i, j); },
      surEffort: function (i, j) { ouvrirFeuille('effort', i, j); },
      // Les deux réglages de l'exercice, sous son nom (§7 septies.1 et .2).
      surNote: function (i) { ouvrirFeuille('note', i, null); },
      surRepos: function (i) { ouvrirFeuille('repos', i, null); },
      surAjoutSerie: async function (i) {
        // 188-1 — « + Série » à la main, un geste de la séance (`sessions.gestes`) ; la série du coach n'en est pas un.
        seance = Seance.noterGeste(seance, { geste: 'ajout_serie', slug: seance.exercices[i] && seance.exercices[i].exercise_slug, n: 1 });
        seance = Seance.ajouterSerie(seance, i, uuid());
        await apresGeste({ structure: false });
      },
      // MOTEUR §9.15.2 (49-U10) — la proposition de chauffes, lue sur le plan.
      propositionChauffes: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.proposition ? x.proposition : null;
      },
      surAjouterChauffes: async function (i) {
        var x = planDeLExercice(i);
        if (!x || !x.proposition) return;
        accepterChauffes(x.slug);
        seance = Seance.insererChauffes(seance, i, x.proposition.lignes, uuid);
        await apresGeste({ structure: false });
      },
      // 194-1 (MOTEUR §9.31) — le bloc de mobilité, lu sur le plan : « avant » et « fin ». « Ajouter » écrit les exercices (séries vides) ;
      // « Non merci » compte dans la mémoire des chauffes (trois de suite : silence) ; rien n'est écrit sans geste.
      propositionMobilite: function () {
        if (enEdition() || !seance) return null;
        var p = planActuel();
        return p && p.mobilite && (p.mobilite.avant || p.mobilite.fin) ? p.mobilite : null;
      },
      // 197 — la consigne de puissance (65 ans et plus), lue sur le plan : `{ texte, pourquoi }` pour l'exercice, sinon `null`.
      puissance: function (slug) {
        var p = seance && !enEdition() ? planActuel() : null;
        return p && p.puissance && p.puissance.slug === slug ? p.puissance : null;
      },
      nomMobilite: function (slug) { return Modele.nommer(catalogueIndexe(), slug); },
      surAjouterMobilite: async function (ou) {
        var p = planActuel(), m = p && p.mobilite, b = m && (ou === 'avant' ? m.avant : m.fin);
        if (!b) return;
        accepterChauffes(Moteur.MOBILITE_REFUS_CLE);
        var lignes = [];
        (b.zones ? b.zones : [b]).forEach(function (z) { (z.exercices || []).forEach(function (x) { lignes.push({ slug: x.slug, series: x.series }); }); });
        seance = Seance.insererMobilite(seance, lignes, uuid, ou === 'avant' ? 'avant' : 'fin', Moteur.MOBILITE_CONSIGNE);
        await apresGeste({ structure: true });
      },
      surRefuserMobilite: async function () {
        refuserChauffes(Moteur.MOBILITE_REFUS_CLE);
        await apresGeste({ structure: false });
      },
      // MOTEUR §14.5 (49-U15) — la carte de schéma, sous l'exercice, lue sur
      // le plan ; ses deux gestes.
      propositionSchema: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.escalier && x.escalier.carte ? x.escalier.carte : null;
      },
      surSchema: function (i, reponse) { return repondreSchema(i, reponse); },
      surLevier: function (i, cle) { return repondreLevier(i, cle); },
      // MOTEUR §9.17 (50-1) — la carte du lest : UNE, en tête de l'exercice,
      // lue sur le plan ; ses deux gestes écrivent la réponse au profil.
      propositionLest: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.carteLest ? x.carteLest : null;
      },
      surLest: function (i, reponse) { return repondreLest(i, reponse); },
      // MOTEUR §9.17 bis (127) — la carte « marche suivante » : le composant de la carte du lest, à la même place.
      propositionMarche: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.carteMarche ? x.carteMarche : null;
      },
      surMarche: function (i, reponse) { return repondreMarche(i, reponse); },
      // MOTEUR §9.20 (51-3) — la carte de reprise : lue sur le plan ; ses trois
      // gestes passent par les mécanismes existants.
      propositionReprise: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.carteReprise ? x.carteReprise : null;
      },
      surReprise: function (i, cle) { return repondreReprise(i, cle); },
      // 193-6 (MOTEUR §9.30) — la carte « Dernière série au max ? » : lue sur le plan, trois gestes.
      propositionAuMax: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.propositionAuMax ? x.propositionAuMax : null;
      },
      surAuMax: function (i, cle) { return repondreAuMax(i, cle); },
      // 193-4 (MOTEUR §9.32) — la barre testée aujourd'hui : lue sur le plan ; ses gestes (façon, « Pas aujourd'hui », « Arrêter »).
      semaineDeTest: function (i) {
        if (enEdition()) return null;
        var x = planDeLExercice(i);
        return x && x.semaineDeTest && (x.semaineDeTest.testee || x.semaineDeTest.accessoire || x.semaineDeTest.pasDeTest) ? x.semaineDeTest : null;
      },
      surTest: function (i, cle) { return repondreTest(i, cle); },
      // §9.17 — l'exercice est en Entretenir PAR SON PROPRE choix : l'étiquette
      // devient « Entretien », la porte vers le mode (le profil n'y gagne rien).
      modeEntretien: function (slug) { return modeDe(slug) === 'entretien'; },
      // MOTEUR §9.15.3 (94) — la dégressive que le coach ne remplit pas :
      // « En faire une série normale » (le type change, par le geste de la
      // feuille) ou « La retirer » (la suppression d'une série).
      surDegressiveVide: async function (i, j, geste) {
        var x = planDeLExercice(i);
        var dgv = x ? (x.degressive ? [x.degressive] : []).concat(x.degressivesPlus || [])
          .filter(function (q) { return q.iSerie === j; })[0] : null;
        if (!dgv || !dgv.gestes) return;
        if (geste === 'serie_normale') seance = Seance.changerType(seance, i, j, 'travail');
        else if (geste === 'retirer') {
          await oublierObservationDe(i, j);
          seance = Seance.retirerSerie(seance, i, j);
        } else return;
        await apresGeste();
      },
      surRefuserChauffes: function (i) {
        var x = planDeLExercice(i);
        if (!x || !x.proposition) return;
        refuserChauffes(x.slug);
        rendreSeance();
      },
      surSupprimerSerie: async function (i, j) {
        // 115 (E2) — une série FAITE ne part qu'à la fin du délai d'« Annuler ».
        var s = seance && seance.exercices[i] && seance.exercices[i].series[j];
        if (Seance.partEnBase(s)) return differerSuppression(i, j);
        await oublierObservationDe(i, j);
        seance = Seance.retirerSerie(seance, i, j);
        await apresGeste();
      }
    });
    rendreChrono();
    rendreEtatSync();
    brancherReorg('blocs-seance');
    brancherAppuiLong('blocs-seance');
    rendrePiedReorg();
    // §9.11 (49-C) — plus aucun pari à l'affichage : chacun s'écrit à la
    // validation de SA série (`enregistrerPari`).
  }

  function defObjet(cle, valeur) { var o = {}; o[cle] = valeur; return o; }

  // ══ LA DÉVIATION (§5) ════════════════════════════════════════════════════
  //
  // Tout se décide dans `THSeance`, module pur ; ici on ne fait que traduire
  // « ce bloc » en indices d'exercices, et reposer la séance après coup.
  //
  // ⚠️ CHAQUE GESTE DE STRUCTURE RENUMÉROTE LES GROUPES, ce qui efface les
  // marques de tour (`normaliserGroupes`). On les re-sème aussitôt depuis l'état
  // courant : le repère se reconstruit sans que l'écran clignote.
  var modeModifier = false;
  var selectionGroupe = null;

  // ══ RÉORGANISER — LE MODE MODIFIER, ÉTENDU (§7 vicies, chantier 46) ══════
  //
  // ⚠️ PAS UN SECOND MODE. `modeModifier` existait déjà pour la séance ; il
  // vaut maintenant pour les TROIS surfaces — la séance, l'éditeur de routine
  // et la bibliothèque. Un second booléen aurait fini par contredire le premier
  // le jour où l'on quitte un écran sans le refermer.
  //
  // ⚠️ ET IL SE REFERME EN CHANGEANT D'ÉCRAN. Il ne se refermait JAMAIS
  // jusqu'ici : ni en terminant une séance, ni en démarrant la suivante. On
  // pouvait donc démarrer une séance déjà repliée sans l'avoir demandé.
  // Maintenant qu'il porte un ordre NON ENREGISTRÉ, le laisser ouvert d'un
  // écran à l'autre ferait pire : il emporterait des déplacements en attente.
  //
  // `reorgOrdre` est l'ordre AFFICHÉ tant qu'on n'a pas enregistré ; `reorgDepart`
  // est ce qu'il faut restituer sur « Annuler ».
  var reorgOrdre = null;
  var reorgDepart = null;

  function enReorganisation() { return modeModifier; }

  // Les trois surfaces, et ce qui change entre elles : d'où vient l'ordre, et
  // ce qu'« enregistrer » veut dire. Le geste, le pied et le repli, non.
  function surfaceReorg() {
    if (ecranCourant === 'seance') return 'seance';
    if (ecranCourant === 'routine') return 'routine';
    if (ecranCourant === 'saisie') return 'bibliotheque';
    return null;
  }

  function rendreSurfaceCourante() {
    if (ecranCourant === 'seance') return rendreSeance();
    if (ecranCourant === 'routine') return rendreEditeur();
    return rendreSaisie();
  }

  // ⚠️ L'INSTANTANÉ EST CE QUI REND « ANNULER » VRAI. Sans lui, « annulable
  // tant qu'on n'a pas validé » serait une promesse que l'écran ne tient pas :
  // les déplacements s'appliquent en mémoire au fur et à mesure, parce que
  // c'est ce qu'on voit bouger.
  function ouvrirReorganisation() {
    modeModifier = true;
    reorgOrdre = null;
    var q = surfaceReorg();
    if (q === 'seance') reorgDepart = seance;
    else if (q === 'routine') reorgDepart = brouillon ? brouillon.exercices.slice() : null;
    else reorgDepart = Routines.reordonnables(routines).map(function (r) { return r.id; });
    rendreSurfaceCourante();
  }

  function annulerReorganisation() {
    var q = surfaceReorg();
    if (q === 'seance' && reorgDepart) seance = reorgDepart;
    else if (q === 'routine' && reorgDepart && brouillon) brouillon.exercices = reorgDepart;
    fermerReorganisation();
    rendreSurfaceCourante();
  }

  // Ce que le glissement rend : les clés des rangées, dans leur nouvel ordre à
  // l'écran. Rien n'est ÉCRIT — l'ordre va en mémoire, et l'écriture attend
  // « Enregistrer ».
  //
  // ⚠️ MAIS ON REDESSINE, ET C'EST OBLIGATOIRE. Le glissement bouge des nœuds
  // du DOM sans passer par le rendu : la liste de blocs que les FLÈCHES du bloc
  // replié tiennent dans leur fermeture reste alors celle d'avant. Mesuré au
  // banc : après un glissement, « Descendre le bloc » déplaçait le voisin.
  //
  // Le rendu est sûr ICI et nulle part ailleurs : `surOrdre` est appelé au
  // RELÂCHEMENT, quand plus aucun doigt ne tient de rangée. Redessiner pendant
  // le geste l'arracherait de sous le pouce.
  function surOrdreReorg(cles) {
    appliquerOrdreReorg(cles);
    rendreSurfaceCourante();
  }

  function appliquerOrdreReorg(cles) {
    var q = surfaceReorg();
    if (q === 'seance') {
      var blocs = Modele.blocsDeSeance(seance, local.exercices);
      var tranches = cles.map(function (k) { return indicesDe(blocs[Number(k)]) || []; });
      seance = Seance.reordonnerBlocs(seance, tranches);
      seance = Seance.avancerTours(seance,
        Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
    } else if (q === 'routine') {
      // ⚠️ DES INDICES DE BLOC ICI AUSSI, jamais d'exercice : `blocReplie` pose
      // `data-cle` = l'indice du BLOC, et un superset est un bloc de plusieurs.
      // Traiter les clés comme des exercices couperait un superset en deux au
      // premier glissement — et le §7 vicies.3 dit exactement le contraire.
      if (!brouillon) return;
      reordonnerBrouillonParBlocs(cles);
    } else {
      reorgOrdre = cles.slice();
    }
  }

  // ⚠️ TROIS ENREGISTREMENTS DIFFÉRENTS, ET C'EST NORMAL : ce sont trois
  // tables. La séance passe par la file (elle vit hors ligne), l'éditeur écrit
  // à l'« Enregistrer » de l'éditeur, la bibliothèque écrit tout de suite —
  // `routines` ne passe ni par le cache ni par la file (app.js, en-tête).
  async function enregistrerReorganisation() {
    var q = surfaceReorg();
    if (q === 'seance') {
      fermerReorganisation();
      rendreSurfaceCourante();
      return apresGeste();
    }
    if (q === 'routine') {
      // Le brouillon est déjà à jour en mémoire ET sur le disque : l'ordre
      // définitif part avec l'« Enregistrer » de l'éditeur, comme tout le reste.
      fermerReorganisation();
      return apresEditeur();
    }
    return enregistrerOrdreBibliotheque();
  }

  // ⚠️ `routines_user_rang_uniq` EST NON DIFFÉRABLE (§7 vicies.3). Les PATCH
  // partent un par un, chacun dans sa transaction : écrire les rangs dans
  // l'ordre naïf heurterait l'index à la première écriture. `planRangs` rend
  // donc une suite ORDONNÉE, avec un rang tampon pour casser les cycles — c'est
  // `ordonnerDeplacements` du chantier 28, réutilisé tel quel.
  async function enregistrerOrdreBibliotheque() {
    var voulus = reorgOrdre || [];
    var plan = Routines.planRangs(routines, voulus);
    var noeud = $('pied-reorg');
    if (!plan.length) { fermerReorganisation(); return rendreSaisie(); }
    reorgEnCours = true;
    rendrePiedReorg();
    try {
      for (var i = 0; i < plan.length; i++) {
        await Donnees.majRoutine(plan[i].id, plan[i].champs);
      }
      fermerReorganisation();
      await chargerRoutines();
      rendreSaisie();
    } catch (e) {
      // ⚠️ ON NE PERD PAS L'ORDRE À L'ÉCRAN. Une écriture refusée laisse la base
      // à mi-chemin ; relire la remettrait dans un ordre que personne n'a voulu.
      // On garde le mode ouvert, l'ordre affiché, et on dit quoi faire.
      console.error('Ordre de bibliothèque non enregistré :', texteErreur(e));
      Rendu.message($('liste-routines'),
        'Ordre non enregistré. Vérifie ta connexion et réessaie.', 'erreur');
    } finally {
      reorgEnCours = false;
      rendrePiedReorg();
    }
  }

  var reorgEnCours = false;

  function rendrePiedReorg() {
    var noeud = $('pied-reorg');
    if (!noeud) return;
    if (!modeModifier) {
      Rendu.rendrePiedReorganisation(noeud, null);
      return mesurerBarres();
    }
    Rendu.rendrePiedReorganisation(noeud, {
      aide: 'Maintiens la poignée et fais glisser.',
      enCours: reorgEnCours,
      surAnnuler: annulerReorganisation,
      surEnregistrer: enregistrerReorganisation
    });
    // APRÈS le rendu : le pied vient de prendre sa hauteur définitive.
    mesurerBarres();
  }

  // ⚠️ UNE SEULE LIAISON PAR CONTENEUR, ET ELLE SURVIT AUX RENDUS. Les
  // écouteurs vivent sur le CONTENEUR, pas sur les rangées : un rendu remplace
  // les rangées, jamais le conteneur. Rebrancher à chaque rendu empilerait les
  // écouteurs, et le bloc sauterait de deux crans au lieu d'un.
  // ══ L'APPUI LONG, SECONDE ENTRÉE DU MODE (§7 vicies.1) ═══════════════════
  //
  // ⚠️ IL S'ANNULE AU MOINDRE MOUVEMENT. Sans ça, commencer un défilement en
  // posant le doigt une demi-seconde ouvrirait le mode — et l'utilisateur
  // regarderait sa liste se replier sans avoir rien demandé. Le seuil est le
  // MÊME que celui du glissement latéral (12 px), et c'est voulu : deux seuils
  // différents pour « ai-je bougé ? » finiraient par diverger.
  //
  // ⚠️ ET IL NE FAIT RIEN SI LE MODE EST DÉJÀ OUVERT : dedans, le doigt sert à
  // glisser.
  var DUREE_APPUI = 500;   // ms
  var SEUIL_APPUI = 12;    // px
  var appuiBranches = {};

  function brancherAppuiLong(id) {
    if (appuiBranches[id]) return;
    var noeud = $(id);
    if (!noeud) return;
    appuiBranches[id] = true;
    var minuteur = null, x0 = 0, y0 = 0;
    function annuler() {
      if (minuteur) { clearTimeout(minuteur); minuteur = null; }
    }
    noeud.addEventListener('pointerdown', function (e) {
      if (modeModifier) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Pas sur un champ : un appui long dans un champ de saisie, c'est la
      // sélection de texte du système, et on ne la lui prend pas.
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      x0 = e.clientX; y0 = e.clientY;
      annuler();
      minuteur = setTimeout(function () {
        minuteur = null;
        if (modeModifier) return;
        if (surfaceReorg() === 'bibliotheque' &&
            Routines.reordonnables(routines).length < 2) return;
        ouvrirReorganisation();
      }, DUREE_APPUI);
    });
    noeud.addEventListener('pointermove', function (e) {
      if (minuteur === null) return;
      if (Math.abs(e.clientX - x0) > SEUIL_APPUI ||
          Math.abs(e.clientY - y0) > SEUIL_APPUI) annuler();
    });
    noeud.addEventListener('pointerup', annuler);
    noeud.addEventListener('pointercancel', annuler);
    noeud.addEventListener('scroll', annuler, true);
  }

  var reorgBranches = {};
  function brancherReorg(id) {
    if (reorgBranches[id]) return;
    var noeud = $(id);
    if (!noeud) return;
    reorgBranches[id] = Rendu.brancherReorganisation(noeud, {
      surOrdre: function (cles) { if (modeModifier) surOrdreReorg(cles); }
    });
  }

  // Toute sortie d'écran referme le mode et jette ce qui n'a pas été enregistré.
  // C'est explicite : « Annulable tant qu'on n'a pas validé » (§7 vicies.1), et
  // quitter l'écran est une façon de ne pas valider.
  function fermerReorganisation() {
    modeModifier = false;
    reorgOrdre = null;
    reorgDepart = null;
  }

  // Le rang libre suivant, sur TOUTES les routines de l'utilisateur :
  // `routines_user_rang_uniq` porte sur (user_id, rang), pas sur une sous-liste.
  function rangSuivantBibliotheque() {
    var max = -1;
    (routines || []).forEach(function (r) {
      var rg = Routines.rangOuNul(r && r.rang);
      if (rg !== null && rg > max) max = rg;
    });
    return max + 1;
  }

  function indicesDe(bloc) {
    return (bloc.exercices || []).map(function (x) { return x._iExo; })
      .filter(function (i) { return i !== null && i !== undefined; });
  }

  function apresStructure() {
    seance = Seance.avancerTours(seance,
      Modele.toursFaitsParGroupe(Modele.blocsDeSeance(seance, local.exercices)));
    return apresGeste();
  }

  // §5.5 — Déplacer agit sur le BLOC entier. Sans glissement tactile : deux
  // poignées à 360 px se confondent au pouce (§5.3), et le geste de glissement
  // est déjà pris par la suppression d'une série.
  function deplacerBloc(blocs, iBloc, delta) {
    var cible = iBloc + delta;
    if (cible < 0 || cible >= blocs.length) return;
    var indices = indicesDe(blocs[iBloc]);
    var voisins = indicesDe(blocs[cible]);
    // Vers le bas : on se pose APRÈS le voisin. Vers le haut : AVANT lui.
    var ou = delta > 0 ? voisins[voisins.length - 1] + 1 : voisins[0];
    seance = Seance.deplacerVers(seance, indices, ou);
    apresStructure();
  }

  function grouperBlocs(blocs, iA, iB) {
    selectionGroupe = null;
    if (!blocs[iA] || !blocs[iB]) return rendreSeance();
    seance = Seance.grouperBlocs(seance, indicesDe(blocs[iA]), indicesDe(blocs[iB]));
    apresStructure();
  }

  // ── Les feuilles de déviation (§5.5, §5.6) ──────────────────────────────
  //
  // Le menu du BLOC agit sur le bloc ; celui d'un EXERCICE sur l'exercice. Les
  // deux passent ici, parce que les deux finissent par le même travail : une
  // liste d'indices, un geste de `THSeance`, et la séance reposée.
  function rendreFeuilleDeviation(cible, index) {
    var blocs = Modele.blocsDeSeance(seance, local.exercices);
    // ⚠️ TOUT CE QUI VIENT DE `feuille` EST PRIS MAINTENANT. `fermerVoile()`
    // rappelle le `apres` de la feuille, qui remet `feuille` à null : un
    // gestionnaire qui lirait `feuille.iBloc` APRÈS avoir fermé lirait null.
    // Le geste ne partait pas, et la feuille se fermait quand même — rien à
    // l'écran ne disait que rien ne s'était passé. Trouvé au banc d'écran.
    var iBloc = feuille.iBloc, cibleExo = feuille.cibleExo;
    var lignesF = feuille.lignes, chauffesF = feuille.chauffes;
    var quoiFeuille = feuille.quoi;
    var bloc = blocs[iBloc];
    if (!bloc) return fermerVoile();
    var noms = bloc.exercices.map(function (x) { return x.nom; }).join(' · ');

    if (quoiFeuille === 'supprimer') {
      return Rendu.rendreFeuilleSupprimer(cible, {
        quoi: cibleExo === null ? (bloc.superset ? 'le bloc' : 'l’exercice') : 'l’exercice',
        noms: cibleExo === null ? noms
          : Modele.nommer(index, seance.exercices[cibleExo].exercise_slug),
        lignes: lignesF, chauffes: chauffesF,
        surConfirmer: function () {
          var quoi = cibleExo === null ? indicesDe(bloc) : [cibleExo];
          fermerVoile();
          oublierObservationsDesExercices(quoi).catch(function () {});
          noterRetraits(quoi);
          seance = Seance.retirerExercices(seance, quoi);
          apresStructure();
        },
        surAnnuler: fermerVoile
      });
    }

    if (quoiFeuille === 'machine') {
      return Rendu.rendreFeuilleMachinePrise(cible, vueMachinePrise(blocs, iBloc, cibleExo));
    }

    // §9.20 — « J'ai mal » : la marque se pose AU CHOIX (51-3 bis, D4) — un
    // « J'ai mal » touché par erreur, refermé sans choisir, ne change rien.
    // « Un frère » marque, puis reprend la liste de §9.19.
    if (quoiFeuille === 'douleur') {
      return Rendu.rendreFeuilleDouleur(cible, {
        textes: Moteur.feuilleDouleur(Modele.nommer(index, seance.exercices[cibleExo].exercise_slug)),
        surChoix: function (cle) {
          seance = Seance.marquerDouleur(seance, cibleExo);
          if (cle === 'frere') {
            feuille = { quoi: 'freres', iBloc: iBloc, cibleExo: cibleExo };
            return apresGeste().then(rendreFeuille);
          }
          // « Alléger », « Changer de position », « Arrêter cet exercice » :
          // la personne fait — rien n'est validé à sa place.
          fermerVoile();
          return apresGeste();
        }
      });
    }
    if (quoiFeuille === 'freres') {
      return Rendu.rendreFeuilleMachinePrise(cible,
        Object.assign(vueMachinePrise(blocs, iBloc, cibleExo), { tard: null, titre: 'Un frère' }));
    }

    // §9.19 — « Machine prise » vise un EXERCICE : la branche tapée dans un
    // superset, l'exercice unique sinon. La feuille change dans le même voile.
    var machinePrise = function (iExo) {
      return function () {
        feuille = { quoi: 'machine', iBloc: iBloc, cibleExo: iExo };
        rendreFeuille();
      };
    };
    // §9.20 — « J'ai mal » ouvre la feuille, dans le même voile ; la marque
    // attend le choix (51-3 bis, D4).
    var jaiMal = function (iExo) {
      return function () {
        feuille = { quoi: 'douleur', iBloc: iBloc, cibleExo: iExo };
        rendreFeuille();
      };
    };

    if (quoiFeuille === 'exercice') {
      return Rendu.rendreFeuilleExercice(cible, {
        nom: Modele.nommer(index, seance.exercices[cibleExo].exercise_slug),
        surMachinePrise: machinePrise(cibleExo),
        surJaiMal: jaiMal(cibleExo),
        surRemplacer: function () { demanderRemplacement(cibleExo); },
        surDegrouper: function () {
          var indices = indicesDe(bloc);
          fermerVoile();
          seance = Seance.degrouperExercice(seance, cibleExo, indices);
          apresStructure();
        },
        surProgression: function () {
          fermerVoile();
          afficherExercice(seance.exercices[cibleExo].exercise_slug);
        },
        surSupprimer: function () { demanderSuppression(iBloc, cibleExo); }
      });
    }

    return Rendu.rendreFeuilleBloc(cible, {
      superset: bloc.superset,
      noms: noms,
      peutGrouper: blocs.length > 1,
      surMachinePrise: bloc.superset ? null : machinePrise(indicesDe(bloc)[0]),
      surJaiMal: bloc.superset ? null : jaiMal(indicesDe(bloc)[0]),
      surRemplacer: function () { demanderRemplacement(indicesDe(bloc)[0]); },
      surGrouper: function () {
        // §5.7 — on passe en SÉLECTION : les autres blocs s'allument et
        // deviennent tapables. Un tap de plus, aucune ambiguïté, et ça marche
        // à n'importe quelle distance dans la liste.
        selectionGroupe = iBloc;
        fermerVoile();
      },
      surAjouterApres: function () {
        var apres = indicesDe(bloc);
        fermerVoile();
        ouvrirCatalogue(apres[apres.length - 1] + 1);
      },
      // §7 vicies.1 — une entrée au lieu de deux : le mode, pas le cran.
      surReorganiser: blocs.length > 1
        ? function () { fermerVoile(); ouvrirReorganisation(); }
        : null,
      // Sur un bloc à plusieurs, « la progression » de QUEL exercice ? Le menu
      // du bloc ne tranche pas : dans un superset, c'est le menu de l'exercice
      // qui porte le geste, et ici il reste grisé.
      surProgression: bloc.superset ? null : function () {
        fermerVoile();
        afficherExercice(bloc.exercices[0].slug);
      },
      surSupprimer: function () { demanderSuppression(iBloc, null); }
    });
  }

  // ⚠️ RIEN DE DESTRUCTIF EN SILENCE, ET RIEN DE BAVARD NON PLUS. On confirme
  // quand il y a du travail à perdre — des séries VALIDÉES — et seulement
  // alors : une question posée sur un bloc vide serait le bruit qu'on tape sans
  // lire (§6.2).
  function demanderSuppression(iBloc, cibleExo) {
    var blocs = Modele.blocsDeSeance(seance, local.exercices);
    var bloc = blocs[iBloc];
    if (!bloc) return fermerVoile();
    var quoi = cibleExo === null ? indicesDe(bloc) : [cibleExo];
    var aEffacer = Seance.compterAEffacer(seance, quoi);
    if (!aEffacer.lignes) {
      fermerVoile();
      oublierObservationsDesExercices(quoi).catch(function () {});
      noterRetraits(quoi);
      seance = Seance.retirerExercices(seance, quoi);
      return apresStructure();
    }
    feuille = { quoi: 'supprimer', iBloc: iBloc, cibleExo: cibleExo,
                lignes: aEffacer.lignes, chauffes: aEffacer.chauffes };
    rendreFeuille();
  }

  // 188-1 — un exercice retiré à la main : un geste de la séance, par exercice (`sessions.gestes`).
  function noterRetraits(indices) {
    (indices || []).forEach(function (i) {
      var e = seance.exercices[i];
      if (e && e.exercise_slug) seance = Seance.noterGeste(seance, { geste: 'retrait', slug: e.exercise_slug });
    });
  }

  function demanderRemplacement(iExo) {
    fermerVoile();
    ouvrirCatalogue(null, iExo);
  }

  // §5.2 — REMPLACER, c'est ajouter puis sauter en gardant la place. Le
  // remplaçant reçoit les lignes restantes, avec sa propre consigne, sans rien
  // hériter (§9.13 bis, §8.4) — sauf la routine de l'exercice remplacé
  // (`heriterRoutine`). UN chemin pour le catalogue et pour le frère de
  // « Machine prise » (§9.19) : un frère n'est qu'un remplaçant choisi plus vite.
  // §14.7 (49-U17) — et sa ligne de plus, comme à l'ouverture.
  // 188-1 — `geste` : le geste noté avec la séance (`remplacement` par défaut ; « Machine prise » passe `machine_prise`).
  function remplacerDansLaSeance(iExo, slug, geste) {
    var avant = seance.exercices;
    var ancien = seance.exercices[iExo] && seance.exercices[iExo].exercise_slug;
    heriterRoutine(iExo, slug);
    seance = Seance.noterGeste(seance, { geste: geste || 'remplacement', slug: ancien, vers: slug });
    seance = Seance.remplacerExercice(seance, iExo, slug, uuid);
    return apresStructure().then(function () { return ligneDePlusPourAjout(avant, slug); });
  }

  // ── « MACHINE PRISE » (MOTEUR §9.19, chantier 51) ───────────────────────
  //
  // D'abord « Plus tard » : le bloc passe juste après le suivant, par
  // `reordonnerBlocs` — le geste du mode Réorganiser. Sinon un frère, par le
  // remplacement. Ce câblage ne décide rien : `Seance.plusTard` dit où va le
  // bloc, `Seance.freresProposes` quels frères et dans quel ordre, et le fait
  // sous chaque frère est « Dernière séance » de sa page (`derniereSeanceDe`).
  // La consigne ne bouge pas : rien ici ne touche au plan, et I4 vérifie
  // qu'aucune ligne figée n'a changé.
  function blocsPourPlusTard(blocs) {
    return blocs.map(function (b, k) {
      return { id: k, exercices: b.exercices.map(function (e) {
        return { slug: e.slug, travail_valide: e.series.some(function (s) { return s.estTravail && s.faite; }) };
      }) };
    });
  }

  // 67A — `slugs` : une autre liste que les frères (la même famille, MOTEUR §13.6 bis), par le MÊME chemin.
  function faitsDesFreres(index, slug, slugs) {
    var parSlug = {};
    (slugs || Modele.freresDe(index, slug)).forEach(function (s) {
      var d = derniereSeanceDe(s);
      if (d) parSlug[s] = d;
    });
    return parSlug;
  }

  // 60-1 (QUESTIONNAIRE-COACH-V2 §4) — LE MATÉRIEL RANGE, IL NE CACHE JAMAIS.
  // Le prédicat « ce frère sort du matériel du profil » : `null` sans matériel
  // renseigné (rien ne change). La règle est `Profil.estHorsMateriel`.
  // 190 — et sans barre de traction (Ma salle : « Non »), ce qui en demande une passe après aussi : `Profil.estHorsDeMaSalle`.
  function horsDuMateriel(index) {
    var autorises = Profil.equipementsDe(profil && profil.materiel);
    var sansBarre = Profil.sansBarreDeTraction(profil);
    if (!autorises && !sansBarre) return null;
    return function (s) { return Profil.estHorsDeMaSalle(s, index[s], autorises, sansBarre); };
  }

  // 60-4 (ES §7 quindecies.9, MOTEUR §9.19) — LES FRÈRES D'UN EXERCICE, UNE SEULE LISTE : celle de « Machine prise »,
  // de « Remplacer » (l'éditeur et l'aperçu du programme) et de « Je n'en veux pas ». `Seance.freresProposes` pour
  // l'ordre (le déjà fait d'abord, le hors matériel après, ceux déjà là à la fin), PUIS les exercices ÉCARTÉS tout à
  // la fin — rangés, jamais cachés — avec `ecarte` pour la mention. `presents` : les slugs déjà dans la séance,
  // la routine ou la séance du programme.
  function freresDe(slug, presents) {
    var index = Modele.indexerExercices(local.exercices);
    var ecartes = Profil.ecartesDe(profil);
    return Profil.ecartesALaFin(
      Seance.freresProposes(slug, index, faitsDesFreres(index, slug), presents, horsDuMateriel(index)), ecartes)
      .map(function (f) { return Object.assign({}, f, { ecarte: ecartes.indexOf(f.slug) >= 0 }); });
  }

  // 67A (MOTEUR §13.6 bis) — LA MÊME FAMILLE, sous les frères, dans les trois feuilles « Remplacer » : `Modele.cousinsDe`
  // (la seule lecture de `schema_mouvement`), rangés comme les frères (`Seance.exercicesProposes`, la même règle), les
  // écartés à la fin, puis les `Seance.COUSINS_PROPOSES` premiers. « Plus tard » et « Je n'en veux pas » ne la lisent pas.
  function cousinsDe(slug, presents) {
    var index = Modele.indexerExercices(local.exercices);
    var ecartes = Profil.ecartesDe(profil);
    var cousins = Modele.cousinsDe(index, slug);
    if (!cousins.length) return [];
    return Profil.ecartesALaFin(
      Seance.exercicesProposes(cousins, index, faitsDesFreres(index, slug, cousins), presents, horsDuMateriel(index)), ecartes)
      .slice(0, Seance.COUSINS_PROPOSES)
      .map(function (f) { return Object.assign({}, f, { ecarte: ecartes.indexOf(f.slug) >= 0 }); });
  }

  function vueMachinePrise(blocs, iBloc, iExo) {
    var index = Modele.indexerExercices(local.exercices);
    var slug = seance.exercices[iExo].exercise_slug;
    var plus = Seance.plusTard(blocsPourPlusTard(blocs), iBloc);
    var suivant = blocs[iBloc + 1];
    var presents = seance.exercices.map(function (e) { return e.exercise_slug; });
    var freres = freresDe(slug, presents);
    // Un frère ou un exercice de la même famille : le même choix.
    var choix = function (f) {
      return {
        nom: Modele.nommer(index, f.slug), fait: f.fait, ecarte: f.ecarte,
        surChoisir: function () { fermerVoile(); remplacerDansLaSeance(iExo, f.slug, 'machine_prise'); }
      };
    };
    return {
      nom: Modele.nommer(index, slug),
      tard: plus.possible ? {
        apres: suivant.exercices.map(function (x) { return x.nom; }).join(' et '),
        surChoisir: function () {
          fermerVoile();
          // 188-1 — « Plus tard » : « Machine prise » sans remplaçant.
          seance = Seance.noterGeste(seance, { geste: 'machine_prise', slug: seance.exercices[iExo].exercise_slug });
          seance = Seance.reordonnerBlocs(seance, plus.ordre.map(function (k) { return indicesDe(blocs[k]); }));
          apresStructure();
        }
      } : null,
      freres: freres.map(choix),
      cousins: cousinsDe(slug, presents).map(choix),
      surCatalogue: function () { demanderRemplacement(iExo); }
    };
  }

  // ── Les feuilles ────────────────────────────────────────────────────────
  //
  // La fermeture REDESSINE la séance : la note et le repos vivent sur la tête
  // du bloc, et une feuille se ferme aussi par la croix, par le fond, ou par le
  // retour d'Android — trois chemins qui ne passent par aucun de ses boutons.
  function ouvrirFeuille(quoi, iExo, iSerie) {
    feuille = { quoi: quoi, iExo: iExo, iSerie: iSerie };
    rendreFeuille();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (seance) rendreSeance();
    });
  }

  // Les menus de déviation visent un BLOC, et parfois une de ses branches. Ils
  // ne parlent donc pas le même langage d'indices que les feuilles de série —
  // d'où une porte à part, plutôt qu'un troisième sens donné à `iExo`.
  function ouvrirFeuilleBloc(quoi, iBloc, cibleExo) {
    feuille = { quoi: quoi, iBloc: iBloc, cibleExo: cibleExo === undefined ? null : cibleExo };
    rendreFeuille();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (seance) rendreSeance();
    });
  }

  // §3.10 — La feuille « Pourquoi ». Elle vise un EXERCICE par son slug, pas
  // une série ni un bloc : la consigne est celle de l'exercice, et un superset
  // en a une par branche.
  function ouvrirPourquoi(slug) {
    if (!pourquoiDe(slug)) return;
    feuille = { quoi: 'pourquoi', slug: slug, vue: 'fiche', conv: { bulles: [], saisie: '', enCours: false } };
    rendreFeuille();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (seance) rendreSeance();
    });
  }

  // ── 160 — « DEMANDER AU COACH » (ECRAN-SAISIE, la feuille « Pourquoi ») ─────
  //
  // L'IA EXPLIQUE la consigne du plan ; elle ne la change jamais. Le contexte vient du PLAN (`planDuSlug`), des faits
  // (`faits.seancesDeLExercice`) et de la salle (`Profil.salleDeLExercice`) : rien n'est calculé ici (`assistant.js`).
  // Une douleur ne part pas (`Assistant.estSante`, la même liste que la fonction) ; au bout du quota, rien ne part non
  // plus ; sans réseau, le bouton est éteint. La conversation vit dans `feuille.conv` — en mémoire, rien en base.
  function enLigneAssistant() { return !(racine.navigator && racine.navigator.onLine === false); }
  function texteResteAssistant() {
    var r = Assistant.resteDuJour();
    return Assistant.TEXTES.parJour + (r === null ? '' : ' \u00b7 il en reste ' + r);
  }

  function rendreAccordAssistant(cible) {
    var f = feuille;
    return Rendu.rendreFeuilleAccord(cible, {
      textes: Assistant.TEXTES,
      // L'accord s'écrit AVANT la première question (la fonction le relit en base) ; refermer ne le retire pas.
      surAccord: function () {
        poserProfil({ assistant_accord_a: new Date().toISOString() }).catch(function () {}).then(function () {
          if (feuille !== f) return;
          f.vue = 'conv';
          rendreFeuille();
        });
      },
      surRefus: function () { f.vue = 'fiche'; rendreFeuille(); }
    });
  }

  function rendreConversationAssistant(cible, index) {
    var f = feuille, conv = f.conv, slug = f.slug;
    var x = planDuSlug(slug);
    var T = Assistant.TEXTES;
    var redessiner = function () {
      if (feuille !== f || f.vue !== 'conv') return;
      rendreFeuille();
      var fil = $('feuille-contenu').querySelector('.assistant-fil');
      if (fil) fil.scrollTop = fil.scrollHeight;
      var champ = $('feuille-contenu').querySelector('.assistant-champ input');
      if (champ && conv.garderFocus && !conv.enCours) champ.focus();
    };
    var local1 = function (q, texte, sante) { conv.bulles.push({ q: q, r: texte, local: true, sante: !!sante }); };
    var envoyer = function (brut) {
      var q = String(brut || '').trim().slice(0, Assistant.MAX_QUESTION);
      if (!q || conv.enCours) return;
      conv.garderFocus = true;
      conv.saisie = '';
      // 1. Une douleur ne part pas : la bulle locale et le bouton « J'ai mal ».
      if (Assistant.estSante(q)) { local1(q, T.sante, true); return redessiner(); }
      // 2. Le quota du jour atteint : rien ne part.
      if (Assistant.resteDuJour() === 0) { local1(q, T.quota); return redessiner(); }
      if (!enLigneAssistant()) { local1(q, T.reseau); return redessiner(); }
      var contexte = Assistant.contexteDe({
        nom: Modele.nommer(index, slug), x: x,
        groupes: faits.seancesDeLExercice(corpus(), slug),
        salle: Profil.salleDeLExercice(profil, slug, index)
      });
      if (!contexte) { local1(q, T.indisponible); return redessiner(); }
      var bulle = { q: q, r: null, local: false };
      conv.bulles.push(bulle);
      conv.enCours = true;
      redessiner();
      var cfg = racine.THConfig;
      var fin = function (res) {
        conv.enCours = false;
        if (res.genre === 'accord') {
          conv.bulles.pop();
          // 166 (D9) : l'accord local est posé mais pas encore en base : on le dit, on ne boucle pas sur l'écran d'accord.
          if (Assistant.issueAccordRefuse(profil) === 'attente') { bulle.r = T.accordEnAttente; bulle.local = true; conv.bulles.push(bulle); return redessiner(); }
          if (feuille === f) { f.vue = 'accord'; }
          return feuille === f ? rendreFeuille() : undefined;
        }
        if (res.genre === 'quota') { Assistant.noterReste(0); bulle.r = T.quota; bulle.local = true; }
        else if (res.genre === 'indisponible') { bulle.r = T.indisponible; bulle.local = true; }
        else if (res.genre === 'reseau') { bulle.r = T.reseau; bulle.local = true; }
        else {
          if (typeof res.reste === 'number') Assistant.noterReste(res.reste);
          bulle.r = res.texte || T.bloquee;
          // Une réponse sûre porte la mention « Rédigé par une IA » ; la réponse fixe (blocage, douleur) est locale.
          bulle.local = res.genre === 'bloquee';
          bulle.sante = !!res.sante;
        }
        redessiner();
      };
      var session = racine.THClient.obtenir().auth.getSession();
      Promise.resolve(session).then(function (r) {
        var jeton = r && r.data && r.data.session ? r.data.session.access_token : (sessionActive && sessionActive.access_token);
        return Assistant.demander({ url: cfg.URL, cle: cfg.CLE_PUBLISHABLE, jeton: jeton, question: q, slug: slug, contexte: contexte });
      }).catch(function () { return { genre: 'reseau' }; }).then(fin);
    };
    return Rendu.rendreFeuilleAssistant(cible, {
      titre: T.bouton, nom: Modele.nommer(index, slug), textes: T, mention: T.mention, attente: '\u2026', max: Assistant.MAX_QUESTION,
      puces: Assistant.puces(x && x.consigne ? x.consigne.etat : null),
      bulles: conv.bulles, saisie: conv.saisie, enCours: conv.enCours,
      reste: texteResteAssistant(),
      surSaisie: function (v) { conv.saisie = v; },
      surEnvoyer: envoyer,
      surRetour: function () { f.vue = 'fiche'; rendreFeuille(); },
      // « J'ai mal » : la feuille de la douleur de l'exercice, dans la séance (rien si l'exercice n'y est pas).
      surJaiMal: function () {
        if (!seance) return;
        var iExo = -1;
        seance.exercices.forEach(function (e, i) { if (iExo < 0 && e.exercise_slug === slug) iExo = i; });
        if (iExo < 0) return;
        var blocs = Modele.blocsDeSeance(seance, local.exercices), iBloc = -1;
        blocs.forEach(function (b, k) { if (iBloc < 0 && indicesDe(b).indexOf(iExo) >= 0) iBloc = k; });
        if (iBloc < 0) return;
        feuille = { quoi: 'douleur', iBloc: iBloc, cibleExo: iExo };
        rendreFeuille();
      }
    });
  }

  // ── 201 — LES MOTS DU COACH ──────────────────────────────────────────────────────────────────────────────────────
  //
  // Le lexique et les sources se LISENT au moteur (`motDuLexique`, `lexique`) : rien n'est calculé ici. La puce d'intention de
  // l'exercice (« 6-8 reps · garde 1 ») ouvre sa feuille de zone, qui commence par la définition de son mot — « Garde 1 » quand
  // le plan vise une réserve d'une rep ou plus, sinon « Zone » — avec sa source ; « 5+ · garde 1 » ouvre « Au max ».
  function motDeLaPuce(slug) {
    var i = seance && seance.exercices ? seance.exercices.map(function (x) { return x.exercise_slug; }).indexOf(slug) : -1;
    var x = i >= 0 ? planDeLExercice(i) : null;
    var g = x && x.reserveVisee !== undefined ? x.reserveVisee : null;
    return g !== null && g >= 1 ? Moteur.motDuLexique('garde', g) : Moteur.motDuLexique('zone');
  }
  function ouvrirMot(cle) {
    if (!Moteur.motDuLexique(cle)) return;
    feuille = { quoi: 'mot', cle: cle };
    rendreFeuille();
    ouvrirVoile($('feuille-seance'), function () { feuille = null; if (seance) rendreSeance(); });
  }

  // ── 193-3 (maquette de l'ondulation, écran 4) — LA ZONE QUI VIENT DE LA ROUTINE ──────────────────────────────────
  //
  // Toucher l'étiquette « Mix · ta routine » : « Changer la zone de cette routine » (la ligne de la routine, par le chemin qui écrit
  // une routine — la file, hors ligne comme les autres) ou « Juste pour aujourd'hui » (la séance seulement : `zone_plan` de
  // l'exercice, dans le brouillon de l'appareil, rien en base). Dans les deux cas la consigne de l'exercice se recalcule, comme
  // après `poserZone`, et ses séries validées restent figées par leurs paris.
  function ouvrirZonePlan(slug) {
    var i = (seance.exercices || []).map(function (x) { return x.exercise_slug; }).indexOf(slug);
    var exo = i >= 0 ? seance.exercices[i] : null;
    var z = exo ? Moteur.zoneParCle(exo.zone_plan) : null;
    if (!z) return;
    var nom = Modele.nommer(Modele.indexerExercices(local.exercices), slug);
    var choisir = function (portee) {
      Rendu.rendreFeuilleZoneRoutine($('feuille-contenu'), {
        titre: portee === 'routine' ? 'Changer la zone de cette routine' : 'Juste pour aujourd\u2019hui',
        sous: nom + (portee === 'routine' ? ', dans ' + ((routineDeLaSeance() || {}).nom || 'ta routine') : ''),
        zones: Moteur.ZONES,
        choisie: exo.zone_plan,
        aide: portee === 'routine' ? 'La routine change pour les prochaines fois ; la consigne se recalcule dès maintenant.'
                                   : 'Ta routine ne change pas.',
        surChoix: async function (cle) {
          fermerVoile();
          await poserZoneDePlanDe(slug, cle, portee === 'routine');
        },
        surFermer: fermerVoile
      });
    };
    Rendu.rendreFeuilleZonePlan($('feuille-contenu'), {
      nom: nom, mot: motDeLaPuce(slug), libelle: z.libelle, bornes: z.bas + '-' + z.haut,
      surRoutine: function () { choisir('routine'); },
      surAujourdhui: function () { choisir('aujourdhui'); },
      surFermer: fermerVoile
    });
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (seance && !vues.seance.hidden) rendreSeance();
    });
  }

  async function poserZoneDePlanDe(slug, cle, dansLaRoutine) {
    var i = (seance.exercices || []).map(function (x) { return x.exercise_slug; }).indexOf(slug);
    if (i < 0) return;
    var zone = Moteur.zoneParCle(cle) ? cle : null;
    if (dansLaRoutine) {
      var routine = routineDeLaSeance();
      var idLigne = seance.exercices[i].routine_exercise_id;
      var ligne = routine && idLigne ? (routine.exercices || []).filter(function (e) { return e && e.id === idLigne; })[0] : null;
      if (ligne) {
        await poserRoutineVoulue(routine, routine.exercices.map(function (e) {
          return e.id === idLigne ? Object.assign({}, e, { zone: zone }) : e;
        }));
      }
    }
    seance = Seance.poserZoneDePlan(seance, i, zone);
    // La consigne de CET exercice se recalcule, lui seul (la seule exception au gel, comme `poserZone`).
    if (consignes && consignes.parSlug) {
      delete consignes.parSlug[slug];
      versionConsignes++;
      sauverConsignes();
    }
    await apresGeste({ structure: false });
  }

  // 193-3 (D3) — la page d'exercice dit les zones que les routines fixent à cet exercice : « Ta routine « Jeudi » fixe cet exercice en
  // Mix. » Un fait ; le menu de zone de la page reste celui de l'exercice (il vaut pour les jours sans zone de routine).
  function zonesDeRoutinesDe(slug) {
    var lignes = [];
    Routines.visibles(routines || []).forEach(function (r) {
      var l = r && (r.exercices || []).filter(function (e) { return e && e.exercise_slug === slug; })[0];
      var z = l && l.zone ? Moteur.zoneParCle(l.zone) : null;
      if (z) lignes.push('Ta routine \u00ab\u00a0' + (r.nom || 'sans nom') + '\u00a0\u00bb fixe cet exercice en ' + z.libelle + '.');
    });
    return lignes;
  }

  // ── §3.8 — LE MENU DES ZONES, ET SA PROPRE PORTE ────────────────────────
  //
  // ⚠️ IL NE PASSE PAS PAR `rendreFeuille`, ET C'EST LA RAISON D'ÊTRE DE CETTE
  // FONCTION. `rendreFeuille` refuse net s'il n'y a pas de séance en cours —
  // une garde juste, qui protège les feuilles de série, de bloc et de fin, qui
  // toutes lisent `seance`. Or l'étiquette s'ouvre AUSSI depuis la page
  // d'exercice, où il n'y a pas de séance. Lever la garde là-bas, c'était la
  // lever pour les six autres feuilles ; on ouvre donc une porte à part, qui
  // ne lit rien de la séance.
  //
  // `apres` dit ce qu'il faut redessiner à la fermeture : l'écran d'où l'on
  // vient, et la séance ouverte s'il y en a une — un choix fait depuis la page
  // d'exercice change la consigne de la séance, qui est derrière.
  function ouvrirZone(slug, apres) {
    var exo = Modele.indexerExercices(local.exercices)[slug];
    var rendre = function () {
      Rendu.rendreFeuilleZone($('feuille-contenu'), {
        nom: Modele.nommer(Modele.indexerExercices(local.exercices), slug),
        mot: motDeLaPuce(slug),
        zones: Moteur.ZONES,
        choisie: zoneDe(slug),
        deduite: deduiteDe(slug),
        // §9.17 — le mode de l'exercice, dans la même feuille : « Progresser »
        // ou « Entretenir ». En Entretenir, la feuille ne montre que le mode :
        // une zone n'a pas d'objet quand on ne cherche pas à monter.
        mode: modeDe(slug) === 'entretien' ? 'entretien' : 'progresser',
        surMode: async function (mode) {
          await poserMode(slug, mode);
          fermerVoile();
        },
        surChoix: async function (cle) {
          await poserZone(slug, cle);
          fermerVoile();
        },
        surFermer: fermerVoile
      });
    };
    rendre();
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (typeof apres === 'function') apres();
      if (seance && !vues.seance.hidden) rendreSeance();
    });
    return exo;
  }

  // La zone DÉDUITE de l'exercice, et la raison qui l'accompagne : ce sont
  // exactement l'habitude et sa profondeur, que le fondement porte déjà. Le
  // menu ne les recalcule pas — il les lit, comme la feuille « Pourquoi ».
  function deduiteDe(slug) {
    var c = consigneDeLExercice(slug);
    var f = c && c.consigne ? c.consigne.fondement : null;
    if (!f || !f.habitude) return null;
    var cle = f.correction ? f.correction.zoneDeduite : c.consigne.zone;
    return { zone: cle, habitude: f.habitude.valeur, seances: f.habitude.seances };
  }

  function rendreFeuille() {
    if (!feuille || !seance) return;
    var cible = $('feuille-contenu');
    var index = Modele.indexerExercices(local.exercices);
    if (feuille.quoi === 'fin') return rendreFeuilleFin(cible, index);
    if (feuille.quoi === 'abandon') return rendreFeuilleAbandon(cible);
    if (feuille.quoi === 'mot') {
      return Rendu.rendreFeuilleMot(cible, { mot: Moteur.motDuLexique(feuille.cle), surFermer: fermerVoile });
    }
    if (feuille.quoi === 'non-validees') return rendreFeuilleNonValidees(cible);
    if (feuille.quoi === 'duree') return rendreFeuilleDuree(cible, index);
    if (feuille.quoi === 'pourquoi' && feuille.vue === 'accord') return rendreAccordAssistant(cible);
    if (feuille.quoi === 'pourquoi' && feuille.vue === 'conv') return rendreConversationAssistant(cible, index);
    if (feuille.quoi === 'pourquoi') {
      return Rendu.rendreFeuillePourquoi(cible, {
        nom: Modele.nommer(index, feuille.slug),
        pourquoi: pourquoiDe(feuille.slug),
        // 160 — le bouton « Demander au coach », en bas de la feuille (connecté seulement).
        assistant: userId() ? {
          bouton: Assistant.TEXTES.bouton,
          horsLigne: enLigneAssistant() ? null : Assistant.TEXTES.horsLigne,
          reste: texteResteAssistant(),
          surDemander: function () {
            feuille.vue = profil && profil.assistant_accord_a ? 'conv' : 'accord';
            rendreFeuille();
          }
        } : null,
        // ⚠️ ON FERME AVANT DE NAVIGUER. Une feuille laissée ouverte sur un
        // autre écran est un voile qu'on ne sait plus d'où il vient — et le
        // retour d'Android le refermerait au lieu de remonter.
        surProfil: function () {
          fermerVoile();
          allerA(Routeur.PROFIL, {});
          rendreProfilEcran();
        }
      });
    }
    if (feuille.quoi === 'bloc' || feuille.quoi === 'exercice' ||
        feuille.quoi === 'supprimer' || feuille.quoi === 'machine' ||
        feuille.quoi === 'douleur' || feuille.quoi === 'freres') return rendreFeuilleDeviation(cible, index);

    var exo = seance.exercices[feuille.iExo];
    if (!exo) return;
    var nom = Modele.nommer(index, exo.exercise_slug);

    // 132 (ECRAN-SAISIE §3 ter.6, écran 3) — LA FEUILLE DE CHOIX DE L'ÉLASTIQUE : la liste qui va avec l'exercice ; le
    // choix s'écrit dans la série (`poserElastique`), validée ou non.
    if (feuille.quoi === 'elastique' && !elastiqueDeLaGrille(exo.exercise_slug) && elastiqueAAjouter(exo.exercise_slug)) {
      // 163 — « Ajoute tes élastiques » : par son nom ou par son poids ; la série reprend ensuite (la feuille se ferme,
      // la colonne « Élastique » propose alors la liste).
      var ficheA = catalogueIndexe()[exo.exercise_slug];
      return Rendu.rendreFeuilleAjoutElastiques(cible, {
        exercice: nom, mini: ficheA.type_elastique === 'mini', noms: Profil.ELASTIQUES_CLASSIQUES,
        erreur: feuille.erreur || '',
        surValider: function (choix) {
          var r = Profil.elastiquesAjoutes(profil, ficheA, choix);
          if (r.erreur) { feuille.erreur = r.erreur; return rendreFeuille(); }
          ecrireProfil(r.champs);
          fermerVoile();
        },
        surAnnuler: fermerVoile
      });
    }
    if (feuille.quoi === 'elastique') {
      var elg = elastiqueDeLaGrille(exo.exercise_slug);
      var se0 = exo.series[feuille.iSerie];
      if (!elg || !se0) return;
      var fg = fantomeDe(feuille.iExo, feuille.iSerie);
      return Rendu.rendreFeuilleElastique(cible, {
        exercice: nom, numero: feuille.iSerie + 1, liste: elg.liste, mini: elg.fiche.type_elastique === 'mini',
        choisi: se0.elastique || (fg && fg.elastique) || null,
        surChoix: function (n) {
          var i = feuille.iExo, j = feuille.iSerie;
          fermerVoile();
          poserElastique(i, j, n);
        },
        surAnnuler: fermerVoile
      });
    }

    // La note d'EXERCICE (§7 septies.1). Elle ne touche pas à la structure mais
    // elle change ce que `lignes()` produit — toutes les séries de cet exercice
    // la portent — donc elle repose bien les séries.
    if (feuille.quoi === 'note') {
      return Rendu.rendreFeuilleNote(cible, {
        exercice: nom,
        note: exo.note,
        surNote: function (v) {
          seance = Seance.definirNoteExercice(seance, feuille.iExo, v);
          apresGeste({ rendre: false });
        },
        surFermer: fermerVoile
      });
    }

    // Le repos cible (§7 septies.2). ⚠️ `structure: false` : il ne vit sur
    // AUCUNE colonne de `sets`, donc il n'y a rien à reposer — et surtout,
    // RIEN NE PART DANS LA ROUTINE ICI. La question se pose à la fin (§6).
    if (feuille.quoi === 'repos') {
      // ⚠️ LA MOLETTE, LA MÊME QU'À L'ÉDITEUR (§7 sexdecies). C'est la même
      // question posée deux fois : elle n'a qu'un écran. Ce qui diffère est la
      // PHRASE — ici le réglage vaut pour la séance, pas pour la routine.
      var poserRepos = function (v) {
        seance = Seance.definirReposCible(seance, feuille.iExo, v);
        // ⚠️ ON RELIT LA VALEUR EFFECTIVEMENT POSÉE, on ne retarge pas sur `v`.
        // `definirReposCible` REFUSE ce qui sort de ses bornes et rend la
        // séance inchangée : retarger sur `v` ferait bouger la barre pendant que
        // la consigne, elle, n'aurait pas bougé — les deux se remettraient à
        // dire deux choses différentes, ce qui est tout le défaut qu'on répare.
        retargeterChrono(feuille.iExo, seance.exercices[feuille.iExo].repos_cible_s);
        apresGeste({ structure: false, rendre: false });
        fermerVoile();
      };
      return Rendu.rendreFeuilleRepos(cible, {
        exercice: nom,
        repos: exo.repos_cible_s,
        aide: 'Pour cette séance. La routine n\u2019est pas touchée : la question se pose à la fin.',
        surValider: poserRepos,
        // ⚠️ `null`, JAMAIS ZÉRO. `definirReposCible` refuse tout ce qui sort
        // de ses bornes — un zéro serait donc ignoré en silence, et le repos
        // resterait celui d'avant sans que personne ne le voie.
        surDesactiver: function () { poserRepos(null); },
        surAnnuler: fermerVoile
      });
    }

    var serie = exo.series[feuille.iSerie];
    if (!serie) return;
    Rendu.rendreFeuilleSerie(cible, {
      quoi: feuille.quoi,
      modeRPE: modeRPE,
      exercice: nom,
      numero: feuille.iSerie + 1,
      serie: serie,
      // Ce que porterait la série faute de note propre : le placeholder dit
      // donc ce qui s'écrira si on ne tape rien.
      noteExercice: exo.note,
      // 193-6 — « Au max » pour aujourd'hui : la dernière série de travail, pas encore validée ; la routine ne change pas.
      auMax: { possible: derniereSerieDeTravail(exo.series) === feuille.iSerie && !serie.validee_a, actif: Modele.estAuMax(serie),
               aide: 'Pour aujourd’hui seulement : ta routine ne change pas.' },
      // 196 (MOTEUR §9.33) — « Rest-pause » : sur une isolation ou une machine, jamais une barre ni un soulevé ; hors semaine
      // allégée, hors zone à ménager ; une série de travail avec sa charge, pas déjà prolongée.
      restPause: restPauseDeLaFeuille(feuille.iExo, feuille.iSerie),
      surRestPause: function () {
        seance = Seance.ajouterRestPause(seance, feuille.iExo, feuille.iSerie, uuid);
        fermerVoile();
        apresGeste();
      },
      surAuMax: function (actif) {
        seance = Seance.definirAuMax(seance, feuille.iExo, feuille.iSerie, actif);
        fermerVoile();
        apresGeste();
      },
      surNoteSerie: function (v) {
        seance = Seance.definirNoteSerie(seance, feuille.iExo, feuille.iSerie, v);
        apresGeste({ rendre: false });
      },
      surType: async function (type) {
        var i = feuille.iExo, j = feuille.iSerie;
        var etait = Seance.typeDe(seance.exercices[i].series[j]);
        var rangQuitte = etait === 'travail' && type !== 'travail' ? rangDuPlanQuitte(i, j) : null;
        seance = Seance.quitterRang(Seance.changerType(seance, i, j, type), i, rangQuitte);
        // §9.11, G3 (49-17, 28/09/2026) — UNE SÉRIE QUI CESSE D'ÊTRE UNE SÉRIE
        // DE TRAVAIL PERD SON OBSERVATION, comme une série supprimée : des reps
        // d'échauffement ne jugent pas un pari de travail. Sur l'appareil et
        // dans la file (une observation vide) ; la base le garantit aussi.
        // ⚠️ LANCÉ AVANT `fermerVoile`, QUI REDESSINE : le vidage local est la
        // partie synchrone d'`oublierObservationDe`, faite dès l'appel — aucun
        // plan ne voit le type changé sans l'observation vidée.
        // E1 (49-19) — TOUT PASSAGE DE `travail` À UN AUTRE TYPE VIDE :
        // l'échauffement, la dégressive, et l'échec — une TENTATIVE MANQUÉE
        // (« Tentative manquée » à l'écran, « série ratée » chez Hevy), hors
        // couverture et qui ne vote pas au palier. La base suit la même règle
        // (`v2_050`, qui annule `v2_049`).
        var vidage = etait === 'travail' && type !== 'travail' ? oublierObservationDe(i, j) : null;
        fermerVoile();
        if (vidage) await vidage;
        await apresGeste();
      },
      surSupprimer: async function () {
        var i = feuille.iExo, j = feuille.iSerie;
        fermerVoile();
        var rangQuitte = rangDuPlanQuitte(i, j);
        await oublierObservationDe(i, j);
        seance = Seance.quitterRang(Seance.retirerSerie(seance, i, j), i, rangQuitte);
        await apresGeste();
      },
      surEffort: function (effort) {
        return noterEffort(feuille.iExo, feuille.iSerie, effort, fermerVoile);
      },
      surBascule: function () { modeRPE = !modeRPE; memoriserModeRPE(); rendreFeuille(); }
    });
  }

  // L'EFFORT D'UNE SÉRIE, UN SEUL CHEMIN (MOTEUR §17.2 bis, 78) : la feuille d'effort et la question de réserve
  // de la carte de repos passent ici — la séance, puis la file (`apresGeste`). `avant` : ce que le geste fait entre
  // les deux (la feuille se ferme).
  async function noterEffort(iExo, iSerie, effort, avant) {
    seance = Seance.definirEffort(seance, iExo, iSerie, effort);
    if (avant) avant();
    await apresGeste();
    rendreChrono();
  }

  // La bascule se retient : quelqu'un qui pratique le RPE ne veut pas le
  // rechoisir à chaque série.
  function memoriserModeRPE() {
    try { racine.localStorage.setItem('th-v2-effort', modeRPE ? 'rpe' : 'ressenti'); }
    catch (e) { /* stockage refusé : le choix vaut pour la session, pas au-delà */ }
  }

  function lireModeRPE() {
    try { modeRPE = racine.localStorage.getItem('th-v2-effort') === 'rpe'; }
    catch (e) { modeRPE = false; }
  }

  // ── L'écran de fin de séance (§7 septies.4) ─────────────────────────────
  //
  // `majRoutineVoulue` est remis à FAUX à chaque ouverture, et c'est le défaut :
  // ne pas toucher à la routine est le geste qui a le moins de conséquences.
  var majRoutineVoulue = false;

  function routineDeLaSeance() {
    if (!seance || !seance.routine_id) return null;
    return routines.filter(function (r) { return r.id === seance.routine_id; })[0] || null;
  }

  // ECRAN §7 septies.4 (prompt 131, écran 6) — LA DONNÉE FACULTATIVE RESTÉE VIDE, choisie UNE FOIS à l'ouverture de
  // la feuille (`Seance.donneeFacultativeVide`) : un rendu suivant (« Reporter sur la routine ») ne passe pas à la
  // suivante. Tapée, elle s'écrit sur la série, donc avec la séance ; laissée vide, rien ne se passe — la carte
  // « Ce qui manque à tes séances » la reprendra. Jamais en Édition (« Enregistrer » ne passe pas par cette feuille).
  var manqueFin = null;

  function confirmerFin() {
    majRoutineVoulue = false;
    manqueFin = seance ? Seance.donneeFacultativeVide(seance, local.exercices) : null;
    ouvrirFeuille('fin', null, null);
  }

  // La vue de la donnée manquante : la phrase, la série telle qu'elle part, la case (sa valeur, son unité, sa borne).
  function vueManqueFin(index) {
    var m = manqueFin;
    var serie = m && seance && seance.exercices[m.iExo] && seance.exercices[m.iExo].series[m.iSerie];
    if (!m || !serie) return null;
    var c = Modele.champDeMesure(m.nom);
    var v = serie[c.cle];
    return {
      phrase: 'Il manque ' + c.manque + '.',
      serie: Modele.nommer(index, m.slug) + ' \u00b7 ' + Modele.formatMesure(serie),
      champ: m.nom, unite: c.unite, max: Modele.maxDeSaisie(m.nom),
      valeur: v === null || v === undefined ? null : v / (c.facteur || 1),
      surSaisie: function (texte) {
        var o = {};
        o[m.nom] = texte;
        seance = Seance.modifierSerie(seance, m.iExo, m.iSerie, o);
        sauverSeance();
      }
    };
  }

  function rendreFeuilleFin(cible, index) {
    var routine = routineDeLaSeance();
    // §6.2 — on ne demande QUE si la séance a réellement dévié. Une séance
    // conforme n'ouvre aucune question, sinon la question devient un bruit
    // qu'on tape sans lire.
    var verdict = Seance.ecartsRoutine(seance, routine);
    // 137 (E12) — « vide » se lit par la règle de l'abandon (`aEffacerALAbandon`), pas par un compte de plus.
    var remplies = Seance.rempliesNonValidees(seance);
    var vide = !aEffacerALAbandon().lignes;
    Rendu.rendreFeuilleFin(cible, {
      vide: vide,
      remplies: remplies.length,
      surValider: function () { fermerVoile(); amenerEnVue(remplies[0]); },
      surContinuer: function () { fermerVoile(); },
      // 71 (ECRAN-SAISIE §7 septies.4 bis) — LA FEUILLE DÉCLARE, LE RÉCAP CONSTATE : les records du jour et le
      // bloc « Le jeu » sont passés au récap, qui s'ouvre juste après « Terminer ».
      compte: Seance.compter(seance, local.exercices),
      manque: vueManqueFin(index),
      titre: seance.titre,
      note: seance.note,
      salle: seance.salle,
      salleMax: Seance.SALLE_MAX,
      routine: routine ? routine.nom : '',
      ecarts: verdict.ecarts.map(function (e) {
        return Object.assign({}, e, {
          nom: e.exercise_slug ? Modele.nommer(index, e.exercise_slug) : ''
        });
      }),
      majRoutine: majRoutineVoulue,
      surMajRoutine: function (v) { majRoutineVoulue = v; rendreFeuille(); },
      // Les trois champs déclarés n'écrivent que le brouillon : la ligne de
      // séance part entière au moment de terminer. Poser la file à chaque
      // frappe d'un titre n'apporterait rien — la séance est déjà montée.
      surTitre: function (v) { seance = Seance.decrire(seance, { titre: v }); sauverSeance(); },
      surSalle: function (v) { seance = Seance.decrire(seance, { salle: v }); sauverSeance(); },
      surNoteSeance: function (v) { seance = Seance.decrire(seance, { note: v }); sauverSeance(); },
      // 115 (audit du 16/10, E4 ; décision D10) — des séries remplies mais pas validées ne partent pas en
      // silence : une phrase d'abord, « Les valider » ou « Terminer quand même ».
      surTerminer: async function () {
        if (Seance.rempliesNonValidees(seance).length) { feuille.quoi = 'non-validees'; rendreFeuille(); return; }
        await terminerOuDemander(verdict);
      },
      // 115 (audit du 16/10, E1) — « Abandonner et tout effacer » DEMANDE dès qu'une série est faite : la
      // confirmation de « Supprimer cette séance ? », qui compte ce qui part. Sans série faite, rien à perdre :
      // la question serait un bruit qu'on tape sans lire (§6.2), et l'abandon reste immédiat.
      surAbandonner: async function () {
        if (aEffacerALAbandon().lignes) { feuille.quoi = 'abandon'; rendreFeuille(); return; }
        fermerVoile();
        await abandonnerSeance();
      }
    });
  }

  // 147 (23/10/2026) — UNE SÉANCE TROP LONGUE : l'app le dit et demande, AVANT d'écrire. `Seance.alerteDeDuree` décide
  // (pure) ; ici on lit sa réponse. Pas d'alerte : la séance se termine comme avant. Une alerte : la feuille « duree »,
  // avec l'instant du geste (« Garder » écrit CET instant) ; fermer la feuille ne tape rien.
  async function terminerOuDemander(verdict) {
    var maintenant = new Date();
    var alerte = Seance.alerteDeDuree(seance, Modele.indexerExercices(local.exercices), maintenant, 'terminer');
    if (!alerte) { fermerVoile(); return terminerSeance(verdict); }
    feuille.quoi = 'duree';
    feuille.instant = maintenant;
    rendreFeuille();
  }

  function rendreFeuilleDuree(cible, index) {
    var instant = feuille.instant || new Date();
    var alerte = Seance.alerteDeDuree(seance, index, instant, 'terminer');
    if (!alerte) { feuille.quoi = 'fin'; return rendreFeuille(); }
    var verdict = Seance.ecartsRoutine(seance, routineDeLaSeance());
    Rendu.rendreFeuilleDuree(cible, {
      duree: alerte.duree,
      derniere: alerte.derniere ? Modele.heureMinute(alerte.derniere) : '',
      surTerminerA: alerte.derniere ? async function () {
        fermerVoile();
        await terminerSeance(verdict, new Date(alerte.derniere));
      } : null,
      surGarder: async function () { fermerVoile(); await terminerSeance(verdict, instant); },
      surRevenir: function () { fermerVoile(); }
    });
  }

  // 115 (audit du 16/10, E4 ; décision D10) — LA PHRASE AVANT DE TERMINER. Le modèle est la confirmation de
  // « Supprimer cette séance ? » (`rendreFeuilleConfirmer`), dans la même feuille : « Terminer quand même » porte
  // le rouge (il jette ce qui a été tapé), « Les valider » ferme la feuille et amène la première ligne en vue —
  // la valider reste le geste de l'utilisateur, rien n'est validé à sa place.
  function phraseNonValidees(n) {
    return n > 1
      ? n + ' séries remplies ne sont pas validées : elles ne seront pas gardées.'
      : '1 série remplie n\u2019est pas validée : elle ne sera pas gardée.';
  }
  function rendreFeuilleNonValidees(cible) {
    var remplies = Seance.rempliesNonValidees(seance);
    if (!remplies.length) { feuille.quoi = 'fin'; return rendreFeuille(); }
    Rendu.rendreFeuilleConfirmer(cible, {
      titre: phraseNonValidees(remplies.length),
      danger: true,
      libelle: 'Terminer quand même',
      libelleAnnuler: 'Les valider',
      surConfirmer: async function () {
        await terminerOuDemander(Seance.ecartsRoutine(seance, routineDeLaSeance()));
      },
      surAnnuler: function () { fermerVoile(); amenerEnVue(remplies[0]); }
    });
  }

  // « Les valider » : la feuille se ferme, la première série remplie vient en vue ; la valider reste le geste de
  // l'utilisateur (115 E4). Partagé entre la feuille « non-validees » et la feuille de fin d'une séance vide (137).
  function amenerEnVue(p) {
    var l = p && doc.querySelector('#blocs-seance [data-iexo="' + p.iExo + '"][data-iserie="' + p.iSerie + '"]');
    if (l && l.scrollIntoView) l.scrollIntoView({ block: 'center' });
  }

  // Ce qui part avec la séance abandonnée : ses lignes faites (`partEnBase`), chauffes comprises — le compte de
  // `compterAEffacer`, celui de la suppression d'un bloc et d'une séance terminée (chantier 39, C1).
  function aEffacerALAbandon() {
    return Seance.compterAEffacer(seance, ((seance && seance.exercices) || []).map(function (e, i) { return i; }));
  }

  // La même feuille que « Supprimer cette séance ? » (`demanderSuppressionSeance`) : le titre, le sujet, le compte
  // de ce qui part, le rouge sur l'action. « Annuler » revient à la feuille de fin, rien n'a bougé.
  function rendreFeuilleAbandon(cible) {
    var n = aEffacerALAbandon();
    Rendu.rendreFeuilleConfirmer(cible, {
      titre: 'Abandonner la séance ?',
      sujet: seance.titre || 'Séance',
      danger: true,
      libelle: 'Abandonner et tout effacer',
      aide: Rendu.phraseEffacement(n.lignes, n.chauffes) + ' avec elle. Rien ne la remet en place.',
      surConfirmer: async function () { fermerVoile(); await abandonnerSeance(); },
      surAnnuler: function () { if (feuille) { feuille.quoi = 'fin'; rendreFeuille(); } }
    });
  }

  // §6.3 — on ne reporte que les ÉCARTS constatés, jamais les charges, et
  // jamais le nombre de séries fait ce jour-là. Par la FILE : la question se
  // pose en salle, là où le réseau n'est pas, et une réponse perdue parce que
  // la requête a échoué serait la perte silencieuse qu'on s'interdit.
  //
  // ⚠️ DEUX APPELANTS, UN CHEMIN (chantier 52) : la question de fin de séance,
  // et « Mettre à jour une routine » depuis une séance passée (§7 quindecies.4),
  // qui passe la routine choisie. Même intention, même file, même vidange.
  async function reporterSurRoutine(verdict, routineChoisie) {
    var routine = routineChoisie || routineDeLaSeance();
    if (!routine || !verdict || !verdict.voulues.length) return;
    await poserRoutineVoulue(routine, verdict.voulues);
  }

  // ⚠️ LE CHEMIN D'ÉCRITURE D'UNE ROUTINE PAR LA FILE, UNE FOIS (66B). Le report de fin de séance et les gestes de
  // « Le coach relit ta semaine » (§5 ter.4 bis) posent la même intention — la liste VOULUE complète — par la même
  // file et la même vidange (`appliquerReportRoutine`) : hors ligne, elle part au retour du réseau.
  async function poserRoutineVoulue(routine, vouluesDonnees) {
    // ⚠️ CHAQUE LIGNE NEUVE PART AVEC SON IDENTIFIANT, FABRIQUÉ ICI.
    // `routine_exercises.id` a `gen_random_uuid()` en défaut : l'app peut donc
    // choisir le sien, et c'est ce qui rend le report IDEMPOTENT. Sans ça, une
    // vidange rejouée — réseau qui lâche, app relancée — réinsérerait une
    // seconde fois chaque exercice ajouté.
    var voulues = vouluesDonnees.map(function (v) {
      return v.id ? v : Object.assign({}, v, { id: uuid() });
    });

    await poser({
      table: Attente.ROUTINE_EXOS, op: Attente.PLAN,
      id: routine.id, donnees: { voulues: voulues }
    });

    // La bibliothèque en mémoire suit tout de suite : rouvrir la routine juste
    // après ne doit pas montrer la structure d'avant.
    routine.exercices = voulues.map(function (v, rang) {
      return Object.assign({}, v, { routine_id: routine.id, rang: rang });
    });
  }

  // ⚠️ LE PLAN SE CALCULE À LA VIDANGE, PAS À LA POSE. L'intention dit l'ÉTAT
  // VOULU ; le chemin pour y arriver dépend de ce que la routine est devenue
  // entre-temps — modifiée sur un autre appareil, ou déjà à jour parce que
  // cette même vidange a déjà tourné. Recalculé sur place, il est vide au
  // second passage : c'est là qu'est l'idempotence.
  async function appliquerReportRoutine(routineId, donnees) {
    var brutes = await Donnees.mesRoutines();
    var r = brutes.filter(function (x) { return x.id === routineId; })[0];
    // Routine archivée ou supprimée entre-temps : il n'y a plus rien à mettre à
    // jour, et l'intention a fait son temps. On ne la rejoue pas indéfiniment.
    if (!r) return;
    // ⚠️ AU VOCABULAIRE DE LA SAISIE, comme partout ailleurs. `planEcritures`
    // compare les séries d'avant à celles d'après pour n'écrire que ce qui
    // change : lui passer des lignes brutes (`routine_sets`, noms de la cible)
    // lui ferait conclure « différent » à chaque vidange, et réécrire pour rien.
    var existantes = (r.routine_exercises || []).slice()
      .sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); })
      .map(function (e) { return Object.assign({}, e, { series: seriesProgrammees(e) }); });
    // `routine_sets.user_id` est NOT NULL et sans défaut — contrairement à
    // `routine_exercises`, qui n'a pas la colonne. Le plan en a donc besoin.
    var plan = Routines.planEcritures(existantes, (donnees && donnees.voulues) || [], routineId,
      sessionActive && sessionActive.user && sessionActive.user.id);
    await Routines.appliquerPlan(plan, Donnees);
  }

  // ══ « LE COACH RELIT TA SEMAINE » (66B, QUESTIONNAIRE-COACH-V2 §5 ter.4 bis) ════════════════
  //
  // ⚠️ L'ÉCRAN NE CALCULE RIEN. Il assemble l'entrée à partir des faits qui existent (`entreeDeRelecture`), appelle
  // `Generateur.relireSemaine`, et `Rendu.rendreRelecture` dessine la sortie. Un « oui » écrit par les chemins qui
  // existent déjà (`poserProfil`, `poserRoutineVoulue`) ; un « non » n'écrit rien.
  //
  // `relecture` : l'écran ouvert — `{ dossier, entree, sortie, replies, fait, message }`. `replies` : les cartes
  // repliées par « Non merci » (clé `priorite` ou `retirer:{muscle}`), POUR CETTE OUVERTURE : vidé quand on quitte la
  // vue (`montrer`). Rouvrir l'écran, c'est demander une nouvelle relecture.
  var relecture = null;

  // Un dossier = une semaine : ses routines non archivées, dans l'ordre de la bibliothèque. `null` : les routines
  // sans dossier (toute la bibliothèque, quand aucune routine n'a de dossier).
  function routinesDuDossier(dossier) {
    return Routines.visibles(routines).filter(function (r) {
      return r && !r.archivee_a && Routines.dossierPropre(r.dossier) === dossier;
    });
  }

  // L'ENTRÉE (§5 ter.4 bis) : exactement les faits qui existent — le volume du coach (le même que la série de plus,
  // avant maintenant), le fait des barres, le catalogue indexé, les priorités, le profil, le jour civil.
  function entreeDeRelecture(dossier) {
    var maintenant = new Date();
    return {
      routines: routinesDuDossier(dossier).map(function (r) { return { id: r.id, nom: r.nom, exercices: r.exercices }; }),
      volume: volumeDuCoach(maintenant.toISOString()),
      barres: faits.barresDuBilan(corpus(), maintenant),
      catalogue: catalogueIndexe(),
      priorites: Profil.prioritesDe(profil),
      profil: { sexe: (profil && profil.sexe) || null, objectif: Profil.objectifDe(profil), phase: Profil.phaseDe(profil) },
      aujourdhui: Moteur.jourCivil(maintenant)
    };
  }

  function cleDeProposition(p) { return p.type === 'priorite' ? 'priorite' : 'retirer:' + p.muscle; }

  function ouvrirRelecture(dossier) {
    allerA(Routeur.RELECTURE, { dossier: dossier });
    rendreRelectureRoute(dossier);
  }

  // Depuis la route (une rangée, un rechargement, un retour). Les routines pas encore chargées : on attend.
  function rendreRelectureRoute(dossier) {
    montrer('relecture', Routeur.RELECTURE);
    var d = dossier === undefined ? null : dossier;
    $('btn-retour-relecture').textContent = '\u2039 Routines' + (d === null ? '' : ' \u00b7 ' + d);
    if ((etatRoutines.code === 'jamais' || etatRoutines.code === 'charge') && !routines.length) {
      Rendu.message($('relecture'), 'Chargement…');
      chargerRoutines().then(function () { if (!vues.relecture.hidden) rendreRelectureRoute(d); });
      return;
    }
    // Un dossier sans routine active (un lien qui a vieilli) : la bibliothèque, à sa place.
    if (!routinesDuDossier(d).length) {
      allerA(Routeur.SAISIE, {}, true);
      return rendreSaisie();
    }
    if (!relecture || relecture.dossier !== d) relecture = { dossier: d, replies: {}, fait: null, message: null };
    relire();
  }

  // UNE RELECTURE : nouvelle entrée, nouvelle sortie, la garde de développement, le dessin.
  function relire() {
    var r = relecture;
    if (!r) return;
    r.entree = entreeDeRelecture(r.dossier);
    r.sortie = Generateur.relireSemaine(r.entree);
    garde.verifierRelecture(r.entree, r.sortie);
    var index = r.entree.catalogue;
    var seche = r.entree.profil.phase === 'seche'
      ? (profil && profil.phase_depuis ? Modele.quand(profil.phase_depuis) : '') : null;
    Rendu.rendreRelecture($('relecture'), r.sortie, {
      nommer: function (slug) { return Modele.nommer(index, slug); },
      seche: seche,
      message: r.message,
      fait: r.fait,
      replie: function (p) { return !!r.replies[cleDeProposition(p)]; },
      surOui: function (p) { ouiDeRelecture(p).catch(function (e) { console.warn('Relecture :', texteErreur(e)); }); },
      surNon: function (p) { r.replies[cleDeProposition(p)] = true; relire(); }
    });
  }

  // « Ta semaine a changé depuis : je la relis. » — rien n'est écrit, puis une relecture.
  function semaineChangee() {
    relecture.message = 'Ta semaine a changé depuis : je la relis.';
    relecture.fait = null;
    relire();
  }

  // LE « OUI » (§5 ter.4 bis). Toutes les listes voulues se calculent AVANT toute écriture (`Routines.retraitDeSeries`,
  // `Routines.miseEnTete`) ; une routine qui ne correspond plus → rien n'est écrit. Puis : le profil d'abord (la
  // priorité), puis chaque routine touchée, UN `poser` chacune ; puis une relecture.
  async function ouiDeRelecture(p) {
    var r = relecture;
    if (!r || !p) return;
    var parId = {};
    routinesDuDossier(r.dossier).forEach(function (x) { parId[x.id] = x; });
    var ecritures = [];
    if (p.type === 'retirer') {
      var ordre = [], lignes = {};
      (p.lignes || []).forEach(function (l) {
        if (!lignes[l.routine_id]) { lignes[l.routine_id] = []; ordre.push(l.routine_id); }
        lignes[l.routine_id].push(l);
      });
      for (var i = 0; i < ordre.length; i++) {
        var rt = parId[ordre[i]];
        var voulues = rt ? Routines.retraitDeSeries(rt, lignes[ordre[i]]) : null;
        if (!voulues) return semaineChangee();
        ecritures.push({ routine: rt, voulues: voulues });
      }
    } else if (p.type === 'priorite') {
      for (var k = 0; k < (p.deplacements || []).length; k++) {
        var d = p.deplacements[k], rd = parId[d.routine_id];
        var v = rd ? Routines.miseEnTete(rd, d.exercise_slug, d.avant) : null;
        if (!v) {
          // `null` dit « introuvable » OU « déjà avant » (rien à écrire) : seule la routine dit lequel.
          var present = function (slug) { return (rd ? rd.exercices : []).some(function (e) { return e.exercise_slug === slug; }); };
          if (rd && present(d.exercise_slug) && present(d.avant)) continue;
          return semaineChangee();
        }
        ecritures.push({ routine: rd, voulues: v });
      }
    } else return;
    r.message = null;
    if (p.type === 'priorite') {
      var champs = Profil.preparerChamps(profil, { priorites: Profil.basculerPriorite(Profil.prioritesDe(profil), p.slug) }, new Date());
      if (Object.keys(champs).length) await poserProfil(champs);
    }
    for (var j = 0; j < ecritures.length; j++) await poserRoutineVoulue(ecritures[j].routine, ecritures[j].voulues);
    if (relecture !== r) return;
    r.fait = p.type === 'priorite' ? { section: 'historique', texte: 'Le squat est ta priorité.' }
      : { section: 'semaine', texte: 'Séries retirées.' };
    relire();
  }

  // ── Saisie : la bibliothèque de routines ─────────────────────────────────

  // PostgREST rend les exercices imbriqués sous le nom de la table. On traduit
  // ICI, une fois : le rendu et le module pur ne connaissent que `exercices`,
  // triés par rang. Un seul endroit sait à quoi ressemble une réponse.
  // ⚠️ ET LA TRADUCTION VA JUSQU'AUX SÉRIES (chantier 43). `routine_sets`
  // arrive imbriquée, dans un ordre que PostgREST ne garantit pas, et au
  // vocabulaire de la CIBLE. On la trie par rang et on la passe au vocabulaire
  // de la SAISIE ici, une fois : l'éditeur de routine est l'écran de séance et
  // rend ces lignes telles quelles, `Seance.creer` les lit pareil.
  function seriesProgrammees(brut) {
    return ((brut && brut.routine_sets) || []).slice()
      .sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); })
      .map(Routines.enSaisie);
  }

  function normaliserRoutine(brute) {
    var exos = (brute && brute.routine_exercises) || [];
    return {
      id: brute.id, nom: brute.nom, note: brute.note,
      archivee_a: brute.archivee_a,
      // `rang` porte l'ordre de la bibliothèque depuis v2_043 (§7 vicies.4).
      rang: brute.rang === undefined ? null : brute.rang,
      // §7 duodecies.3 (52-1) — le dossier, une étiquette (`null` : Sans dossier).
      dossier: Routines.dossierPropre(brute.dossier),
      // 99 (MOTEUR §9.24, v2_084) — les jours prévus (1 = lundi … 7 = dimanche), `null` : sans jour.
      jours: Array.isArray(brute.jours) && brute.jours.length ? brute.jours.slice() : null,
      // §7 quindecies.4 (52-1) — « En faire une routine » prend le repos d'un
      // exercice dans la routine la plus récemment modifiée qui le contient.
      modifiee_a: brute.modifiee_a === undefined ? null : brute.modifiee_a,
      exercices: exos.slice().sort(function (a, b) { return a.rang - b.rang; })
        .map(function (e) {
          return Object.assign({}, e, { series: seriesProgrammees(e) });
        })
    };
  }

  // ══ 155 — L'APP RELIT LES ROUTINES AU RETOUR (décision d'Aurélien du 24/10/2026) ══
  //
  // Les routines n'ont pas de cache et `synchroniser` ne les lisait jamais : une routine changée ailleurs
  // n'apparaissait qu'au rechargement de la page. À la ré-entrée (retour au premier plan), on relit — au plus
  // une fois par minute, JAMAIS pendant une séance ni quand l'éditeur d'une routine (ou une feuille de
  // renommage / duplication) est ouvert : on n'écrase pas ce qu'on modifie. Un échec garde l'affichage. On ne
  // remplace `routines` que si la signature a changé.
  var RELECTURE_ROUTINES_MS = 60000;
  var derniereLectureRoutines = 0;
  // 164 — GÉNÉRATION DES ROUTINES : +1 à chaque fois que `routines` est remplacée par `chargerRoutines` (après une écriture
  // locale, un import, une création) ou vidée (changement de compte). La relecture lit le compteur AVANT sa requête et jette
  // sa réponse s'il a bougé : une réponse lente, partie avant l'écriture, n'écrase pas la liste qui l'a suivie.
  var generationRoutines = 0;

  function relectureRoutinesPermise() {
    // 164 — « éditeur ouvert » se lit sur la VUE : `brouillon` n'est remis à zéro qu'au changement de compte, donc après le
    // premier éditeur ouvert il bloquait la relecture jusqu'au rechargement. Une saisie non enregistrée ne se perd pas pour
    // autant : elle vit dans `brouillonLocal` (disque), la relecture ne touche que `routines`.
    return etatRoutines.code === 'ok' && !seance && vues.routine.hidden &&
      !duplication && !renommage;
  }

  function signatureDesRoutines(liste) {
    return JSON.stringify((liste || []).map(function (r) {
      // 164 (D2) — le CONTENU aussi : `routines.modifiee_a` n'est écrite que pour le nom ou le dossier, jamais pour un
      // exercice ou une série (autres tables). La signature voit donc le rang, les jours, la note, les exercices et leurs
      // séries — quel que soit l'écrivain (autre appareil, ancienne version), sans dépendre d'un `modifiee_a` tenu à jour.
      return [r.id, r.nom, r.dossier === undefined ? null : r.dossier, r.modifiee_a || null, r.archivee_a || null,
        r.rang === undefined ? null : r.rang, r.jours || null, r.note || null, r.exercices || []];
    }));
  }

  async function relireRoutinesAuRetour() {
    if (!relectureRoutinesPermise()) return false;
    if (Date.now() - derniereLectureRoutines < RELECTURE_ROUTINES_MS) return false;
    derniereLectureRoutines = Date.now();
    var generation = generationRoutines;
    try {
      var brutes = await Donnees.mesRoutines();
      // Pendant la lecture, un éditeur a pu s'ouvrir : on ne touche à rien.
      if (!relectureRoutinesPermise()) return false;
      // 164 — …ou une écriture locale a pu être relue (`chargerRoutines`) : cette réponse est plus vieille qu'elle.
      if (generation !== generationRoutines) return false;
      var neuves = brutes.map(normaliserRoutine);
      if (signatureDesRoutines(neuves) === signatureDesRoutines(routines)) return false;
      routines = neuves;
      return true;
    } catch (e) {
      console.warn('Routines non relues :', texteErreur(e));
      return false;
    }
  }

  async function chargerRoutines() {
    etatRoutines = { code: 'charge', message: '' };
    // Sans routines, pas de « Démarrer » : attendre ici la vérification de la
    // séance en cours en base garantit qu'une séance ouverte ailleurs est
    // reprise AVANT qu'on puisse en lancer une autre (voir `entrerVraiment`).
    if (verificationSeance) await verificationSeance;
    try {
      var brutes = await Donnees.mesRoutines();
      routines = brutes.map(normaliserRoutine);
      generationRoutines++;
      etatRoutines = { code: 'ok', message: '' };
      derniereLectureRoutines = Date.now();
      return true;
    } catch (e) {
      // On ne vide pas `routines` : ce qu'on avait affiché reste affiché. Un
      // écran qui se vide sur une panne de réseau fait croire à une perte.
      etatRoutines = { code: 'echec', message: texteErreur(e) };
      console.warn('Routines indisponibles :', texteErreur(e));
      return false;
    }
  }

  // 171 — les trois gestes de la carte de fin de cycle : les MÊMES dans la bibliothèque et en tête de Saisie.
  var gestesFinDeCycle = {
    surCommencerBloc: function (d) { return commencerBlocSuivant(d); },
    surFaireTest: function (d) { return lancerLaSemaineDeTest(d); },
    surAjusterBloc: function (d) {
      var b = Moteur.blocEnCours(local.blocs, d);
      if (b) ouvrirProgramme(d, b);
    },
    surArreterProgramme: function (d) { return arreterProgramme(d); }
  };

  // 193-4 — le bilan : lignes « Couché : 154 kg → 157,5 kg. » et l'objectif de la barre (1 rep) « Pas encore ». Les phrases sont du moteur.
  function bilanDeLaSemaineDeTest() {
    var T = testDesCartes();
    if (!T || T.vu === true || T.fin >= jourDuJour() || !T.mesures || !Object.keys(T.mesures).length) return null;
    var noms = nomsDuCatalogue();
    var lignes = [], objectifs = [];
    Object.keys(T.mesures).forEach(function (slug) {
      var m = T.mesures[slug];
      if (!m) return;
      lignes.push(Moteur.phraseBilanTest(noms[slug] || slug, m.avant, m.valeur));
      (local.objectifs || []).forEach(function (o) {
        if (!o || o.exercise_slug !== slug || o.reps !== 1 || m.valeur === null) return;
        var p = Moteur.phraseObjectifTest(m.valeur, o.charge_kg);
        if (p) objectifs.push(p);
      });
    });
    return { titre: 'Ta semaine de test est finie.', lignes: lignes, objectifs: objectifs };
  }

  // 171 (famille A) — la fin de cycle en tête de Saisie. Mêmes dossiers, même règle (`programmeDuDossier`) que la
  // bibliothèque : on lit la vue, on ne la recalcule pas. Rien n'est écrit.
  function rendreFinsDeCycleSaisie() {
    var noeud = $('carte-fin-saisie');
    if (!noeud) return;
    var items = [];
    if (!seance && etatRoutines.code === 'ok') {
      var vus = {};
      var dossiers = routines.map(function (r) { return r.dossier; }).concat(dossiersDeProgramme());
      dossiers.forEach(function (d) {
        if (!d || vus[d]) return;
        vus[d] = true;
        var pr = programmeDuDossier(d);
        if (pr && pr.fin) items.push({ dossier: d, fin: pr.fin });
      });
    }
    // 193-4 — le bilan de la semaine de test, une fois la semaine finie : « avant → mesuré », l'objectif « Pas encore ».
    var bilanTest = !seance && etatRoutines.code === 'ok' ? bilanDeLaSemaineDeTest() : null;
    if (bilanTest) items.unshift({ dossier: null, bilanTest: bilanTest });
    Rendu.rendreFinsDeCycleSaisie(noeud, items, Object.assign({}, gestesFinDeCycle, { surCompris: function () {
      var T = testDesCartes();
      if (T) ecrireTest(Object.assign({}, T, { vu: true })).then(rendreSaisie);
    } }));
  }

  // ══ 171 — « LE COACH TE DIT (n) » : les avis de Saisie sur une ligne ═══════════════════════════════════
  //
  // Échelles, ce qui manque, cycles, phase : des informations, pas des décisions. Chacune GARDE sa règle (son
  // `rendre…`, inchangé) ; ici on ne fait que les REGROUPER. La ligne n'existe que s'il y en a au moins une ; elle ne
  // s'ouvre jamais d'elle-même. Un point ambre = un avis pas encore vu ; l'ouvrir les marque vus — une commodité de
  // CET appareil (localStorage, try/catch ; rien n'est écrit en base). Un avis vu reste dans la ligne tant que sa
  // règle le montre. Il est « neuf » à nouveau quand son texte change (une autre semaine d'échelles).
  var AVIS_SAISIE = [
    { id: 'echelles', titre: 'Échelles', noeud: 'carte-echelles', signe: '.ce-etiquette' },
    { id: 'manque', titre: 'Ce qui manque', noeud: 'carte-manque', signe: '.manque-phrase' },
    { id: 'cycles', titre: 'Cycles', noeud: 'carte-cycles', signe: '.reprise-quoi' },
    { id: 'phase', titre: 'Phase', noeud: 'bandeau-phase', signe: '.reprise-quoi' }
  ];
  var CLE_AVIS_VUS = 'th-v2-avis-vus';
  var avisOuvert = false;
  var avisVus = lireAvisVus();

  function lireAvisVus() {
    try {
      var v = JSON.parse(racine.localStorage.getItem(CLE_AVIS_VUS) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function memoriserAvisVus() {
    try { racine.localStorage.setItem(CLE_AVIS_VUS, JSON.stringify(avisVus)); }
    catch (e) { /* stockage refusé : le point reviendra, rien d'autre */ }
  }

  // Les avis que leur règle montre en ce moment, avec leur signature.
  function avisPresents() {
    var liste = [];
    AVIS_SAISIE.forEach(function (a) {
      var n = $(a.noeud);
      if (!n || n.hidden) return;
      var t = n.querySelector(a.signe);
      liste.push({ id: a.id, titre: a.titre, signe: String((t || n).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) });
    });
    return liste;
  }

  function majAvisSaisie() {
    var cadre = $('avis-coach'), ligne = $('avis-ligne'), corps = $('avis-corps');
    if (!cadre || !ligne || !corps) return;
    var presents = avisPresents();
    if (!presents.length) {
      cadre.hidden = true; corps.hidden = true; avisOuvert = false;
      ligne.setAttribute('aria-expanded', 'false');
      return;
    }
    if (avisOuvert) {
      var change = false;
      presents.forEach(function (a) { if (avisVus[a.id] !== a.signe) { avisVus[a.id] = a.signe; change = true; } });
      if (change) memoriserAvisVus();
    }
    var neufs = presents.filter(function (a) { return avisVus[a.id] !== a.signe; }).length;
    cadre.hidden = false;
    corps.hidden = !avisOuvert;
    ligne.setAttribute('aria-expanded', avisOuvert ? 'true' : 'false');
    ligne.setAttribute('data-neufs', String(neufs));
    ligne.textContent = '';
    var tete = Rendu.el('span', 'avis-tete');
    if (neufs) tete.appendChild(Rendu.el('span', 'avis-point'));
    tete.appendChild(Rendu.el('b', 'avis-nom', 'Le coach te dit'));
    ligne.appendChild(tete);
    ligne.appendChild(Rendu.el('span', 'avis-titres', presents.map(function (a) { return a.titre; }).join(' \u00b7 ')));
    ligne.appendChild(Rendu.el('span', 'avis-n num', presents.length + (avisOuvert ? ' \u2304' : ' \u203a')));
  }

  var avisBranches = false;
  function brancherAvisSaisie() {
    if (avisBranches) return;
    var ligne = $('avis-ligne');
    if (!ligne) return;
    avisBranches = true;
    ligne.addEventListener('click', function () { avisOuvert = !avisOuvert; majAvisSaisie(); });
    // Chaque carte se redessine toute seule (un geste, un chargement) et pose son propre `hidden` : la ligne suit.
    if (typeof racine.MutationObserver === 'function') {
      var o = new racine.MutationObserver(function () { majAvisSaisie(); });
      AVIS_SAISIE.forEach(function (a) {
        var n = $(a.noeud);
        if (n) o.observe(n, { attributes: true, attributeFilter: ['hidden'], childList: true });
      });
    }
  }

  // « Démarrer » d'une routine — UN SEUL démarrage, pour la bibliothèque de Saisie et pour « Prochaine séance » (173).
  function demarrerRoutineParId(id) {
    var r = routines.filter(function (x) { return x.id === id; })[0] || null;
    // 60-2b (MOTEUR §9.18) — « J'ai moins de temps en ce moment » : la carte de « J'ai
    // peu de temps » s'ouvre d'elle-même AVANT la séance, une fois par routine et par jour.
    if (r && ouvrirPeuDeTempsDOffice(r)) return;
    demarrerSeance(r);
  }

  // 173 (refonte « Vivant ») — « Prochaine séance », en tête de l'accueil : la routine qui suit la dernière faite (`Routines.routineSuivante`).
  function rendreProchaineSeance() {
    var cible = $('prochaine-seance');
    if (!cible) return;
    var suivante = etatRoutines.code === 'ok' || routines.length ? Routines.routineSuivante(routines, local.seances) : null;
    Rendu.rendreProchaineSeance(cible, {
      routine: suivante ? suivante.routine : null,
      catalogue: local.exercices,
      temps: tempsDeLaRoutine,
      enCours: !!seance,
      surDemarrer: demarrerRoutineParId,
      surReprendre: function () { allerA(Routeur.SAISIE, {}); rendreSeance(); },
      surAutre: function () { allerA(Routeur.SAISIE, {}); rendreSaisie(); }
    });
  }
  var routinesDeLAccueilDemandees = false;
  function demanderLesRoutinesDeLAccueil() {
    if (etatRoutines.code === 'ok' || routinesDeLAccueilDemandees) return;
    routinesDeLAccueilDemandees = true;
    chargerRoutines().then(function () {
      if (etatRoutines.code === 'ok' && ecranCourant === 'liste') { rendreProchaineSeance(); rendreLigneDesEquilibres(); }
      // « Ton parcours » ouvert d'emblée : les causes lisent les routines, elles arrivent après le premier rendu.
      else if (etatRoutines.code === 'ok' && !vues.parcours.hidden) rendreParcours();
    }).catch(function () { /* hors ligne : pas de carte */ }).then(function () { routinesDeLAccueilDemandees = false; });
  }

  function rendreSaisie() {
    // L'onglet Saisie EST la saisie : s'il y a une séance en cours, c'est elle
    // qu'on ouvre. Un rechargement, un retour d'arrière-plan, une app tuée et
    // rouverte — on retombe toujours dedans, sans rien chercher.
    if (seance) return rendreSeance();
    montrer('saisie', Routeur.SAISIE);
    // 91 — mes invitations à un groupe de séance.
    dessinerGroupeAccueil();
    rafraichirGroupe();
    // 60-2a — AVANT les retours anticipés ci-dessous : « Ton questionnaire n'est
    // pas terminé » ne dépend pas du chargement des routines.
    rendreBandeauQuestionnaire();
    rendreBandeauPhase();
    rendreCarteEchelles();
    rendreCarteCycles();
    rendreCarteSemaine();
    rendreCarteManque();
    // 138 — iPhone, hors de l'app : sous le questionnaire et la phrase (l'ordre du DOM). Il ne lit pas le profil : seulement
    // la session, la séance et l'appareil, donc la ligne qui arrive n'a rien à y redessiner.
    rendreBandeauInstaller();
    // 171 — la fin de cycle EN TÊTE (famille A), puis la ligne qui regroupe les avis (famille B).
    rendreFinsDeCycleSaisie();
    brancherAvisSaisie();
    majAvisSaisie();
    var cible = $('liste-routines');
    // ⚠️ « Je ne sais pas encore » n'est PAS « il n'y en a pas ». Tant qu'un
    // chargement n'a pas abouti, on ne montre pas l'état vide : hors ligne, il
    // annoncerait une bibliothèque vide à quelqu'un qui a des routines. Trouvé
    // au banc d'écran, réseau coupé — pas en test.
    if ((etatRoutines.code === 'jamais' || etatRoutines.code === 'charge') && !routines.length) {
      return Rendu.message(cible, 'Chargement…');
    }
    if (etatRoutines.code === 'echec' && !routines.length) {
      Rendu.message(cible, etatRoutines.message + ' Les routines vivent en ligne.', 'erreur');
      var reessayer = Rendu.el('button', 'discret', 'Réessayer');
      reessayer.type = 'button';
      reessayer.addEventListener('click', async function () {
        Rendu.message(cible, 'Chargement…');
        await chargerRoutines();
        rendreSaisie();
      });
      cible.appendChild(reessayer);
      return;
    }
    rendreBandeauBrouillon();
    var ranger = $('btn-ranger-routines');
    // Une seule routine ne se range pas : le bouton n'a rien à proposer.
    if (ranger) ranger.hidden = Routines.reordonnables(routines).length < 2;
    Rendu.rendreListeRoutines(cible, routines, {
      // §7 vicies — le mode Réorganiser, la bibliothèque étant la 3ᵉ surface.
      reorganiser: modeModifier && ecranCourant === 'saisie',
      ordre: reorgOrdre,
      // `apercu` compte les séries de TRAVAIL par `THSemaine.compteSeriesTravail`,
      // dont la règle du volume a besoin des muscles du catalogue.
      catalogue: local.exercices,
      // §7 duodecies.3 (52-1) — les dossiers repliés, une commodité de CET
      // appareil (rien n'est écrit en base).
      replies: dossiersReplies,
      surReplier: function (cle) {
        dossiersReplies[cle] = !dossiersReplies[cle];
        memoriserDossiersReplies();
        rendreSaisie();
      },
      // MOTEUR §9.22 (53-2) — le programme d'un dossier : le badge, la carte de
      // fin de bloc, ou « Faire de ce dossier un programme ».
      programme: programmeDuDossier,
      // 118 (audit du 16/10, 03 #5) — les dossiers d'un programme en cours : celui qui n'a plus de routine reste
      // montré (son badge, « Arrêter le programme »). En carnet, aucun : le badge s'y tait (I13).
      dossiersDeProgramme: dossiersDeProgramme,
      surProgramme: function (d) { ouvrirProgramme(d, null); },
      surBadgeProgramme: ouvrirBlocEnCours,
      // 155 — le menu « \u22ef » du dossier.
      surMenuDossier: ouvrirMenuDossier,
      surCommencerBloc: gestesFinDeCycle.surCommencerBloc,
      surFaireTest: gestesFinDeCycle.surFaireTest,
      surAjusterBloc: gestesFinDeCycle.surAjusterBloc,
      surArreterProgramme: gestesFinDeCycle.surArreterProgramme,
      surChoix: ouvrirRoutine,
      surNouvelle: function () { ouvrirRoutine(null); },
      // 60-3 (ES §7 quindecies.7) — « Retrouver mes séances qui reviennent ».
      surRetrouver: ouvrirSeancesQuiReviennent,
      // 66B (§5 ter.4 bis) — « Le coach relit ce dossier » : seulement un dossier qui a une routine non archivée.
      surRelire: ouvrirRelecture,
      relirable: function (d) { return routinesDuDossier(d).length > 0; },
      surDemarrer: demarrerRoutineParId,
      // §9.18 (51-1) — la durée estimée, et « J'ai peu de temps ».
      temps: tempsDeLaRoutine,
      surPeuDeTemps: function (id) {
        var r = routines.filter(function (x) { return x.id === id; })[0];
        if (r) ouvrirPeuDeTemps(r);
      },
      surSeanceVide: function () { demarrerSeance(null); },
      // 54-1 — l'état vide mène à l'historique des séances, comme l'onglet
      // Séances : c'est là que vit « En faire une routine ».
      surDepuisSeance: function () { afficherSemaine(Semaine.bornesSemaine(new Date()).lundi); }
    });
    brancherReorg('liste-routines');
    brancherAppuiLong('liste-routines');
    rendrePiedReorg();
  }

  // ══ 155 — RENOMMER UN DOSSIER (décision d'Aurélien du 24/10/2026) ═════════
  //
  // Toutes les routines du dossier (archivées comprises), puis tous ses cycles, puis le profil et l'état
  // « replié ». Les routines d'abord, EN DIRECT : si le réseau manque, la première écriture échoue et RIEN n'a
  // bougé (ni cycle, ni profil). Une écriture qui échoue en route rend les précédentes. Les paris gardent leur
  // dossier d'origine (immuables) et rien ne relit ce nom comme clé.
  var renommage = null;   // { ancien, erreur, enCours }

  function planDeRenommage(ancien, texte) {
    return Routines.planRenommageDossier(routines, local.blocs || [], ancien, texte, instantDuJour());
  }

  function ouvrirMenuDossier(dossier) {
    Rendu.rendreFeuilleMenuDossier($('feuille-contenu'), {
      dossier: dossier,
      surRenommer: function () { ouvrirRenommerDossier(dossier); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  function ouvrirRenommerDossier(dossier) {
    renommage = { ancien: dossier, erreur: '', enCours: false };
    rendreFeuilleRenommer();
    // 164 (D3) — remis à zéro à la fermeture, QUEL QU'EN SOIT LE CHEMIN (retour d'Android, fond, « Annuler ») : un
    // `renommage` resté non nul bloque la relecture des routines jusqu'au rechargement.
    ouvrirVoile($('feuille-seance'), function () {
      // 164 (D11) — fermée PENDANT l'écriture : `renommage` reste jusqu'à la fin de l'écriture (la relecture ne passe pas au
      // travers d'un renommage en route) ; `renommerDossier` le remet à zéro, sans rien redessiner dans une feuille fermée.
      if (renommage && renommage.enCours) renommage.fermee = true; else renommage = null;
    });
  }

  function rendreFeuilleRenommer() {
    var ancien = renommage.ancien;
    Rendu.rendreFeuilleRenommerDossier($('feuille-contenu'), {
      nom: renommage.texte === undefined ? ancien : renommage.texte,
      erreur: renommage.erreur,
      verdict: function (texte) {
        var p = planDeRenommage(ancien, texte);
        var phrase = Routines.phraseRenommage(routinesDuDossier(ancien).length, !!Moteur.blocEnCours(local.blocs, ancien));
        return { ok: p.ok, message: p.message, phrase: p.message ? '' : phrase };
      },
      surRenommer: function (texte) { renommerDossier(ancien, texte); },
      surAnnuler: fermerVoile
    });
  }

  async function renommerDossier(ancien, texte) {
    if (!renommage || renommage.enCours) return;
    var plan = planDeRenommage(ancien, texte);
    if (!plan.ok) return;
    var en = renommage;   // 164 (D11) : l'état de CE renommage, que la fermeture de la feuille ne peut plus nous retirer
    en.enCours = true;
    en.texte = texte;   // un échec rend la feuille avec ce qui était tapé
    var faites = [];
    try {
      for (var i = 0; i < plan.routines.length; i++) {
        await Donnees.majRoutine(plan.routines[i].id, plan.routines[i].champs);
        faites.push(plan.routines[i].id);
      }
    } catch (e) {
      for (var j = 0; j < faites.length; j++) {
        try { await Donnees.majRoutine(faites[j], { dossier: ancien }); } catch (e2) { /* rendu au mieux */ }
      }
      en.enCours = false;
      if (en.fermee) { if (renommage === en) renommage = null; return; }
      en.erreur = Routines.messageErreur({ erreur: Routines.classerErreur(e) });
      return rendreFeuilleRenommer();
    }
    for (var k = 0; k < plan.blocs.length; k++) await poserBloc(plan.blocs[k]);
    if (profil && profil.programme_construit_dossier === ancien) {
      var champs = Profil.preparerChamps(profil, { programme_construit_dossier: plan.nouveau }, new Date());
      if (Object.keys(champs).length) poserProfil(champs).catch(function () {});
    }
    if (dossiersReplies[ancien]) {
      dossiersReplies[plan.nouveau] = dossiersReplies[ancien];
      delete dossiersReplies[ancien];
      memoriserDossiersReplies();
    }
    if (renommage === en) renommage = null;
    if (!en.fermee) fermerVoile();   // déjà fermée par l'utilisateur : ne pas fermer une autre feuille ouverte depuis
    await chargerRoutines();
    if (!vues.saisie.hidden && !seance) rendreSaisie();
  }

  // §7 duodecies.3 (52-1) — LES DOSSIERS REPLIÉS. Un confort de lecture, propre
  // à cet appareil : il se retient (localStorage), et s'il ne se peut pas, tout
  // reste déplié — la bibliothèque s'affiche quand même.
  var CLE_DOSSIERS_REPLIES = 'th-v2-dossiers-replies';
  var dossiersReplies = lireDossiersReplies();

  function lireDossiersReplies() {
    try {
      var v = JSON.parse(racine.localStorage.getItem(CLE_DOSSIERS_REPLIES) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }

  function memoriserDossiersReplies() {
    try { racine.localStorage.setItem(CLE_DOSSIERS_REPLIES, JSON.stringify(dossiersReplies)); }
    catch (e) { /* stockage refusé : le repli vaut pour la session */ }
  }

  // ⚠️ IL NE DISPARAÎT PAS ET NE S'ENREGISTRE PAS TOUT SEUL (§7 octodecies.3).
  // Un brouillon oublié se SIGNALE : c'est le seul comportement qui ne décide
  // rien à la place de l'utilisateur. Et l'ancienneté règle le seuil sans
  // qu'on en fixe un — « depuis 3 jours » se lit tout seul comme un oubli.
  //
  // ⚠️ ABANDONNER DEMANDE D'ABORD. Un brouillon de trois jours ne s'efface pas
  // au premier tap d'un bandeau : c'est `showConfirm` du §6.2, ici
  // `rendreFeuilleConfirmer`, la même que la suppression d'une routine.
  function rendreBandeauBrouillon() {
    var noeud = $('bandeau-reprise');
    if (!noeud) return;
    var b = Routines.brouillonASignaler(brouillonLocal);
    if (!b) { Rendu.rendreBandeauReprise(noeud, null); return; }
    Rendu.rendreBandeauReprise(noeud, {
      quoi: 'Routine en cours d\u2019édition',
      sujet: b.nom || 'Sans nom',
      depuis: Modele.anciennete(b.modifie_a, new Date()),
      libelleQuitter: 'Abandonner',
      libelleReprendre: 'Reprendre',
      surReprendre: function () { ouvrirRoutine(b.id); },
      surQuitter: function () { demanderAbandonBrouillon(b); }
    });
  }

  function demanderAbandonBrouillon(b) {
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Abandonner ce brouillon ?',
      sujet: b.nom || 'Sans nom',
      danger: true,
      libelle: 'Abandonner',
      aide: 'Rien n\u2019a été enregistré : ce brouillon n\u2019existe que sur cet appareil. ' +
            'Les routines déjà enregistrées ne bougent pas.',
      surConfirmer: async function () {
        fermerVoile();
        await oublierBrouillon();
        rendreSaisie();
      },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ── §9.18 (51-1) — « J'AI PEU DE TEMPS », SUR LA ROUTINE ─────────────────
  //
  // La durée estimée de chaque routine, et le geste qui la raccourcit. Le
  // temps se décide AVANT de commencer : en séance, il n'y a pas de geste
  // « temps » (terminer plus tôt suffit). Pendant une semaine allégée, pas de
  // « J'ai peu de temps » : la séance est déjà plus courte, et la routine dit
  // sa durée allégée (51-1 ter).

  function semaineAllegeeEnCours() {
    // 60-1 — « JUSTE UN CARNET » : en Entretenir le plan n'applique ni la
    // décharge planifiée ni la semaine allégée (I13) ; la routine ne dirait pas
    // « Semaine allégée : environ 50 min » pour une séance qui ne l'est pas.
    if (Moteur.coachSeTait(profil && profil.intention)) return false;
    var jour = Moteur.jourCivil(new Date().toISOString());
    return !!Moteur.periodeAllegee(Moteur.cartesDesParis(parisEscalierConnus()), jour) ||
      // §9.22 (53-2) — la décharge planifiée est une semaine allégée.
      !!Moteur.dechargeDuJour(local.blocs, jour, finsAllegeesConnues());
  }

  // Les cibles plus courtes que la routine : sans elles, le geste n'a rien à
  // proposer et ne s'affiche pas.
  // 60-1 — la durée déclarée au profil est la cible quand la routine la dépasse
  // (`Moteur.ciblesDeTemps`) ; sinon 45 et 60. Un seul endroit : ni cette
  // fonction ni l'écran ne comparent quoi que ce soit.
  function ciblesPlusCourtes(dureeS) {
    return Moteur.ciblesDeTemps(dureeS, profil ? profil.duree_seance_min : null);
  }

  function tempsDeLaRoutine(routine) {
    if (!routine || !(routine.exercices || []).length) return null;
    var structure = Moteur.structureDeRoutine(routine.exercices, catalogueIndexe());
    if (semaineAllegeeEnCours()) {
      return { texte: Moteur.texteDureeAllegee(Moteur.dureeEstimee(Moteur.structureAllegee(structure))),
               peuDeTemps: false };
    }
    var d = Moteur.dureeEstimee(structure);
    // 60-2b (MOTEUR §9.18) — ce que la personne a dit de son temps : `ambre` (« Ça varie » :
    // l'estimation se montre en couleur du coach) et `ouvrir` (« Moins en ce moment » : la
    // durée visée, en minutes, à laquelle la carte s'ouvre d'elle-même). Une seule règle, au moteur.
    var rep = Moteur.reponseDeTemps(profil && profil.temps_reponse, d,
      profil && profil.duree_seance_min, profil && profil.intention);
    return { texte: Moteur.texteDureeEstimee(d), peuDeTemps: ciblesPlusCourtes(d).length > 0,
             ambre: rep.ambre, ouvrir: rep.ouvrir };
  }

  // 60-2b — « UNE FOIS PAR ROUTINE ET PAR JOUR » : une clé locale PAR COMPTE, dans le
  // préfixe que « Quitter » efface, `{ [routine]: 'AAAA-MM-JJ' }` (jour civil local). Posée
  // à l'OUVERTURE de la carte : la fermer autrement que par « Garder la séance » (retour,
  // fond) ne la rouvre pas dans la journée. Un stockage refusé ou illisible se lit « déjà
  // vu » : on n'ouvre pas à chaque « Démarrer » une carte qu'on ne saurait pas dire montrée.
  var CLE_PEU_DE_TEMPS_VU = 'th-v2-peu-de-temps-vu-';   // + l'identifiant du compte

  function peuDeTempsVus() {
    var id = userId();
    if (!id) return null;
    try {
      var v = JSON.parse(racine.localStorage.getItem(CLE_PEU_DE_TEMPS_VU + id) || '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (e) { return null; }
  }

  function peuDeTempsDejaVu(routineId) {
    var vus = peuDeTempsVus();
    return vus === null || vus[routineId] === jourDuJour();
  }

  // Rend vrai quand la marque est POSÉE : sans elle, la carte s'ouvrirait à chaque « Démarrer ».
  function marquerPeuDeTempsVu(routineId) {
    var id = userId();
    if (!id) return false;
    var jour = jourDuJour();
    var vus = peuDeTempsVus() || {};
    var gardes = {};
    // Les jours passés s'élaguent : la clé ne grossit pas d'une entrée par routine et par jour.
    Object.keys(vus).forEach(function (k) { if (vus[k] === jour) gardes[k] = jour; });
    gardes[routineId] = jour;
    try { racine.localStorage.setItem(CLE_PEU_DE_TEMPS_VU + id, JSON.stringify(gardes)); return true; }
    catch (e) { return false; }   // stockage refusé en écriture seule : on n'ouvre pas une carte qu'on ne saurait pas dire montrée
  }

  // « Démarrer » sur une routine dont la personne a dit « moins de temps » : la carte de
  // « J'ai peu de temps », à sa durée visée, d'abord — c'est toujours une carte à accepter
  // (« Raccourcir » ou « Garder la séance »). Rend vrai quand elle s'est ouverte (la séance
  // ne démarre pas encore). Ce n'est PAS le rendu qui l'ouvre : un geste de la personne.
  function ouvrirPeuDeTempsDOffice(routine) {
    var t = tempsDeLaRoutine(routine);
    if (!t || !t.peuDeTemps || t.ouvrir === null || t.ouvrir === undefined) return false;
    if (peuDeTempsDejaVu(routine.id)) return false;
    if (!marquerPeuDeTempsVu(routine.id)) return false;
    montrerCarteRaccourci(routine, t.ouvrir);
    ouvrirVoile($('feuille-seance'));
    return true;
  }

  function ouvrirPeuDeTemps(routine) {
    var t = tempsDeLaRoutine(routine);
    if (!t || !t.peuDeTemps) return;
    var d = Moteur.dureeEstimee(Moteur.structureDeRoutine(routine.exercices, catalogueIndexe()));
    Rendu.rendreFeuilleTemps($('feuille-contenu'), {
      sujet: routine.nom || 'Sans nom',
      aide: t.texte,
      choix: ciblesPlusCourtes(d).map(function (c) {
        return { libelle: Moteur.libelleCibleTemps(c), surClic: function () { montrerCarteRaccourci(routine, c.min); } };
      }),
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // LA CARTE : le coach propose, la personne décide (§1.1). « Raccourcir »
  // démarre la séance raccourcie, « Garder la séance » la séance normale.
  function montrerCarteRaccourci(routine, cible) {
    var index = catalogueIndexe();
    var complet = Moteur.structureDeRoutine(routine.exercices, index);
    // 188-2 — jamais une priorité : exemptée du raccourci.
    var exemptes = Generateur.exemptsDesPriorites((routine.exercices || []).map(function (l) { return l.exercise_slug; }),
      Profil.prioritesDe(profil), index);
    var resultat = Moteur.raccourcirRoutine(complet, cible, exemptes, { objectif: Profil.objectifDe(profil) });
    Rendu.rendreCarteRaccourci($('feuille-contenu'), {
      carte: Moteur.carteRaccourcir(complet, resultat, cible, function (slug) { return Modele.nommer(index, slug); },
        (Moteur.zonesRaidesConnues(profil && profil.zones_raides) || []).length > 0),
      surRaccourcir: function () {
        fermerVoile();
        demarrerSeance(routine, { cible: cible, complet: complet, resultat: resultat });
      },
      surGarder: function () { fermerVoile(); demarrerSeance(routine); }
    });
  }

  async function afficherSaisie() {
    allerA(Routeur.SAISIE, {});
    rendreSaisie();
    // 91 — toucher l'onglet de la séance relit le groupe tout de suite (le direct, les messages en attente).
    if (seance) chargerGroupe();
    if (etatRoutines.code === 'ok') return;   // déjà chargé : pas de requête de plus
    await chargerRoutines();
    if (vues.saisie.hidden) return;           // l'utilisateur est parti ailleurs
    rendreSaisie();
  }

  // ── L'éditeur ────────────────────────────────────────────────────────────
  //
  // Tout se passe EN MÉMOIRE jusqu'au bouton Enregistrer. Écrire à chaque
  // frappe multiplierait les allers-retours, rendrait chaque geste faillible,
  // et surtout empêcherait de calculer le plan de renumérotation d'un coup —
  // celui qui évite de heurter `routine_exos_rang_uniq`.
  function brouillonDe(routine) {
    if (!routine) return { id: null, nom: '', dossier: null, exercices: [], existantes: [], nomChange: false };
    return {
      id: routine.id,
      nom: routine.nom,
      nomChange: false,
      // §7 duodecies.3 (52-1) — le dossier se choisit dans l'éditeur.
      dossier: Routines.dossierPropre(routine.dossier),
      // Copie : on édite le brouillon, jamais la routine chargée. Sans ça, un
      // enregistrement raté laisserait la liste montrant des valeurs qui ne
      // sont pas en base.
      // ⚠️ LE BROUILLON TRANSPORTE TOUT CE QUE LA LISTE BLANCHE ÉCRIT.
      // `groupe_superset` et `note` sont entrés dans `CHAMPS_EXERCICE` au
      // chantier 28 : les oublier ici les ferait partir à `null` au premier
      // enregistrement, c'est-à-dire effacer le superset et la note en voulant
      // seulement renommer la routine.
      //
      // ⚠️ ET IL LES NORMALISE (§7 decies). Une routine ancienne peut porter un
      // groupe à UN seul exercice — l'état que `v2_041` a nettoyé en base.
      // Le relire tel quel, puis enregistrer, le réécrirait : l'éditeur serait
      // un chemin par lequel l'état interdit revient.
      //
      // ⚠️ ET LES SÉRIES SE RECOPIENT LIGNE À LIGNE (chantier 43). `series` est
      // maintenant un TABLEAU d'objets : le partager avec la routine chargée
      // ferait muter la liste à chaque frappe dans l'éditeur, et un
      // enregistrement raté laisserait la bibliothèque montrant des valeurs
      // qui ne sont pas en base — exactement ce que la copie ci-dessus évite.
      exercices: Routines.renumeroter(routine.exercices.map(function (e) {
        return {
          id: e.id, exercise_slug: e.exercise_slug,
          series: (e.series || []).map(function (l) { return Object.assign({}, l); }),
          repos_cible_s: e.repos_cible_s,
          groupe_superset: e.groupe_superset === undefined ? null : e.groupe_superset,
          note: e.note === undefined ? null : e.note,
          // 193-3 — la zone de la routine est transportée par le brouillon : l'oublier la ferait partir à `null` au premier
          // enregistrement (renommer la routine effacerait la zone du jeudi).
          zone: Routines.zoneValide(e.zone)
        };
      })),
      existantes: routine.exercices.slice()
    };
  }

  // ══ LE BROUILLON VIT SUR L'APPAREIL (§7 octodecies.2) ════════════════════
  //
  // ⚠️ LE MÊME MÉCANISME QUE LA SÉANCE EN COURS (chantier 22), pas un second.
  // `Cache.ecrireBrouillon` porte déjà une séance sous la clé `'seance'` ; la
  // routine en cours d'édition prend la clé `'routine'`, et c'est tout. Le
  // problème est le même — quitter l'écran ne doit rien perdre — et il a déjà
  // été résolu une fois.
  //
  // ⚠️ LOCAL, JAMAIS EN BASE. Une routine en cours d'édition n'a rien à faire
  // sur le serveur, et `routines_nom_court` ou les bornes de `routine_sets`
  // refuseraient un état transitoire — un nom vide le temps de le taper, un
  // exercice sans ligne le temps d'en ajouter une. L'enregistrement reste
  // EXPLICITE : le brouillon protège du départ accidentel, la routine n'existe
  // que quand l'utilisateur le dit.
  var CLE_BROUILLON = 'routine';
  var brouillonLocal = null;   // ce que le disque porte, relu au démarrage

  // ⚠️ ON N'ÉCRIT QU'À LA MODIFICATION, JAMAIS À L'OUVERTURE. Sans cette règle,
  // ouvrir une routine pour la REGARDER effacerait le brouillon d'une autre —
  // et le bandeau qu'on vient d'ignorer aurait menti.
  async function sauverBrouillon() {
    if (!brouillon) return;
    brouillonLocal = {
      modifie_a: new Date().toISOString(),
      nom: $('champ-nom-routine') ? $('champ-nom-routine').value : brouillon.nom,
      brouillon: brouillon
    };
    brouillon.nom = brouillonLocal.nom;
    try {
      await Cache.ecrireBrouillon(CLE_BROUILLON, brouillonLocal);
    } catch (e) {
      // Même règle que la séance : le disque local est la dernière ligne, et
      // s'il refuse, l'utilisateur doit le savoir avant de partir.
      console.error('Brouillon non sauvegardé :', texteErreur(e));
      Rendu.message($('erreur-routine'),
        'Sauvegarde impossible sur cet appareil. N\u2019oublie pas d\u2019enregistrer.', 'erreur');
    }
  }

  async function oublierBrouillon() {
    brouillonLocal = null;
    try { await Cache.ecrireBrouillon(CLE_BROUILLON, null); }
    catch (e) { console.warn('Brouillon non effacé :', texteErreur(e)); }
  }

  async function chargerBrouillonLocal() {
    try { brouillonLocal = await Cache.lireBrouillon(CLE_BROUILLON); }
    catch (e) {
      console.warn('Brouillon local illisible :', texteErreur(e));
      brouillonLocal = null;
    }
  }

  async function ouvrirRoutine(id) {
    allerA(Routeur.ROUTINE, id ? { id: id } : { neuve: true });
    await prepererEditeur(id);
  }

  // Ouvrable par URL directe : la routine peut ne pas être chargée.
  async function prepererEditeur(id) {
    montrer('routine', Routeur.ROUTINE);
    if (id && etatRoutines.code !== 'ok') {
      Rendu.message($('exos-routine'), 'Chargement…');
      await chargerRoutines();
      if (vues.routine.hidden) return;
    }
    var routine = id ? routines.filter(function (r) { return r.id === id; })[0] : null;
    if (id && !routine) {
      // Une routine qui n'existe plus, ou qu'on n'a pas pu charger. On ne
      // fabrique pas un éditeur vide qui créerait un doublon à l'enregistrement.
      allerA(Routeur.SAISIE, {}, true);
      return rendreSaisie();
    }
    // ⚠️ LE BROUILLON REPREND LA MAIN, MAIS SEULEMENT SUR SA PROPRE ROUTINE.
    // Un brouillon de la routine Y ne doit pas se déverser dans l'éditeur de X
    // — ni être effacé par le seul fait d'ouvrir X. Il attend son tour ;
    // c'est le bandeau qui y ramène (§7 octodecies.3).
    var reprise = Routines.brouillonReprenable(brouillonLocal, id || null);
    brouillon = reprise || brouillonDe(routine);
    $('champ-nom-routine').value = brouillon.nom;
    $('btn-supprimer-routine').hidden = !brouillon.id;
    // §7 quindecies.4 (52-1) — Dupliquer : une routine enregistrée seulement.
    $('btn-dupliquer-routine').hidden = !brouillon.id;
    $('erreur-routine').textContent = '';
    annoncerDansLEditeur('');
    rendreEditeur();
  }

  function nomExoBrouillon(i) {
    var e = brouillon.exercices[i];
    return e ? Modele.nommer(Modele.indexerExercices(local.exercices), e.exercise_slug) : '';
  }

  // ══ L'ÉDITEUR EST L'ÉCRAN DE SÉANCE (§7 quindecies) ══════════════════════
  //
  // ⚠️ AUCUN RENDU PROPRE. Pas de seconde `construireBlocs`, pas de second
  // rendu de ligne, pas de second pavé de chronométrage, pas de second badge de
  // chauffe : l'éditeur appelle `Rendu.rendreBlocsSeance` avec `programme:
  // true`, et le reste suit. C'est ce qui garantit qu'une routine se lit
  // exactement comme la séance qu'elle produira — deux rendus se seraient
  // contredits un jour, et le jour où ils se contrediraient serait celui où on
  // découvre que la routine ne dit pas ce qu'elle fait.
  //
  // Le brouillon a donc la FORME d'une séance : `exercices[].series[]`, aux
  // noms de la saisie. `Modele.blocsDeSeance` l'entrelace, groupe les supersets
  // et compte les tours sans savoir qu'il s'agit d'une routine.
  function brouillonCommeSeance() {
    return { exercices: brouillon.exercices };
  }

  // ⚠️ UN SEUL ENTONNOIR APRÈS UNE MODIFICATION, comme `apresGeste` en séance.
  // Le brouillon part sur disque à CHAQUE modification (§7 octodecies.2) ;
  // N points d'appel qui écriraient chacun le leur finiraient par en oublier
  // un, et l'oubli ne se verrait qu'en perdant une routine.
  //
  // `rendre: false` pour la saisie de ligne : re-rendre à chaque frappe
  // arracherait le focus et le clavier d'Android avec lui. L'écriture sur
  // disque, elle, a lieu dans les deux cas.
  function apresEditeur(options) {
    var o = options || {};
    var p = sauverBrouillon();
    if (o.rendre !== false) rendreEditeur();
    return p;
  }

  function exoBrouillon(i) { return brouillon.exercices[i] || null; }

  function ligneBrouillon(i, j) {
    var e = exoBrouillon(i);
    return (e && e.series && e.series[j]) || null;
  }

  function rendreEditeur() {
    var index = Modele.indexerExercices(local.exercices);
    var blocs = Modele.blocsDeSeance(brouillonCommeSeance(), local.exercices);
    var ranger = $('btn-ranger-routine');
    if (ranger) ranger.hidden = blocs.length < 2;
    var chargesDuRendu = {};
    // §7 duodecies.3 (52-1) — le dossier, sous le nom.
    var dossier = $('dossier-routine');
    if (dossier) {
      while (dossier.firstChild) dossier.removeChild(dossier.firstChild);
      dossier.appendChild(Rendu.champDossier(brouillon.dossier, ouvrirDossierRoutine));
    }
    Rendu.rendreBlocsSeance($('exos-routine'), null, {
      programme: true,
      blocs: blocs,
      // §7 vicies — l'éditeur est la 2ᵉ surface du mode. Le repli vient du MÊME
      // `blocReplie` que la séance : l'éditeur ne l'avait simplement jamais
      // demandé (`modifier` n'était pas passé). Rien de neuf, un branchement.
      modifier: modeModifier && ecranCourant === 'routine',
      reorganiser: modeModifier && ecranCourant === 'routine',
      // Les deux flèches du bloc replié — le chemin accessible au clavier, et
      // le filet quand le glissement rate. Même geste qu'en séance.
      surDeplacerBloc: function (i, d) { deplacerBlocRoutine(blocs, i, d); },
      exercice: function (slug) { return index[slug]; },
      // §7 septendecies.2 — la charge RÉELLEMENT soulevée à la dernière séance
      // s'affiche en gris sur chaque ligne. Même fonction qu'en séance
      // (`Seance.precedent`), donc pas de seconde lecture d'historique ; c'est
      // `rangeeDeSerie` qui l'aligne par type et par rang (chantier 38).
      precedent: precedentDe,
      // §7 quindecies.3 (52-1) — LA CHARGE DE DÉPART : un champ sur un exercice
      // jamais fait, le coach seul sinon — et l'éditeur le dit.
      chargeProgramme: function (slug) {
        // Une lecture d'historique par exercice et par rendu, pas par ligne.
        if (!Object.prototype.hasOwnProperty.call(chargesDuRendu, slug)) chargesDuRendu[slug] = chargeDansLEditeur(slug);
        return chargesDuRendu[slug];
      },
      // ⚠️ LE TAP EST REBRANCHÉ (§7 octodecies.4). Il avait été retiré au
      // chantier 43 parce que le brouillon n'était pas persisté : partir de
      // l'écran coûtait la routine en cours d'édition. Le raisonnement était
      // juste, la conclusion non — il traitait la conséquence comme une
      // fatalité. **La réponse était de persister le brouillon, pas de retirer
      // le geste** (§7 octodecies.1), et c'est fait au §2 de ce chantier.
      //
      // Et c'est précisément là qu'on en a besoin : consulter l'historique d'un
      // exercice pendant qu'on construit une routine est le moment où l'on
      // décide combien de séries y mettre.
      surExercice: function (slug) { afficherExercice(slug); },
      // ⚠️ LES CHAMPS MUTENT SANS REDESSINER. Re-rendre à chaque frappe
      // arracherait le focus, et le clavier d'Android avec lui — c'est la même
      // règle qu'en séance, pour la même raison.
      surChamp: function (i, j, champ, valeur) {
        var l = ligneBrouillon(i, j);
        if (!l) return;
        // Audit 130 n°1 — le nom de saisie (`duree`, `distance_km`) se traduit en
        // colonne du brouillon par la table de la séance, sinon la cible se perd.
        var t = Routines.champDeLEditeur(champ, valeur);
        l[t.cle] = t.valeur;
        apresEditeur({ rendre: false });
      },
      surNumero: ouvrirTypeSerieRoutine,
      surNote: ouvrirNoteExoRoutine,
      surRepos: ouvrirReposExoRoutine,
      // 193-3 — la zone que la routine fixe à cet exercice (maquette de l'ondulation, écran 1).
      surZoneRoutine: ouvrirZoneExoRoutine,
      libelleDeZone: function (cle) { var z = Moteur.zoneParCle(cle); return z ? z.libelle + ' \u00b7 ' + z.bas + ' à ' + z.haut : 'Automatique'; },
      surAjoutSerie: function (i) {
        var e = exoBrouillon(i);
        if (!e) return;
        // La nouvelle ligne REPREND LA PRÉCÉDENTE de son exercice : programmer
        // « 5, 5, 5 » se fait alors en trois taps au lieu de trois saisies. Le
        // type suit aussi — trois chauffes d'affilée sont le cas courant d'une
        // rampe. Rien n'est repris quand il n'y a pas de précédente.
        var derniere = e.series[e.series.length - 1];
        e.series.push(derniere
          ? Object.assign({}, derniere, { id: null })
          : Routines.enSaisie(null));
        apresEditeur();
      },
      surSupprimerSerie: function (i, j) {
        var e = exoBrouillon(i);
        if (!e || !e.series[j]) return;
        e.series.splice(j, 1);
        apresEditeur();
      },
      // Sur un bloc d'un seul, bloc et exercice sont le même objet : le menu du
      // bloc EST celui de l'exercice. Sur un superset, `teteDeBloc` ne rend pas
      // de menu de bloc en mode programme — les cinq gestes portent tous sur une
      // branche, et c'est le menu d'exercice qui les donne.
      surMenuBloc: function (iBloc) {
        var b = blocs[iBloc];
        var x = b && b.exercices[0];
        if (x && x._iExo !== null && x._iExo !== undefined) ouvrirFeuilleExoRoutine(x._iExo);
      },
      surMenuExercice: function (iBloc, iExo) { ouvrirFeuilleExoRoutine(iExo); }
    });
    brancherReorg('exos-routine');
    brancherAppuiLong('exos-routine');
    rendrePiedReorg();
  }

  // Le type d'une série programmée — chauffe, travail, dégressive, échec. C'est
  // la MÊME feuille qu'en séance, `programme: true` en moins de la note de
  // série : `routine_sets` n'a pas de colonne où la mettre.
  function ouvrirTypeSerieRoutine(i, j) {
    var l = ligneBrouillon(i, j);
    if (!l) return;
    Rendu.rendreFeuilleSerie($('feuille-contenu'), {
      quoi: 'type',
      programme: true,
      numero: j + 1,
      exercice: nomExoBrouillon(i),
      serie: l,
      // 193-6 — « Au max » dans la routine : sur la dernière série de travail seulement ; une seule par exercice.
      auMax: { possible: derniereSerieDeTravail((exoBrouillon(i) || {}).series) === j, actif: l.au_max === true,
               aide: 'Dans ta routine : le coach la lit à chaque séance, et te dit comment la mener.' },
      surAuMax: function (actif) {
        var e = exoBrouillon(i);
        (e ? e.series : []).forEach(function (q, k) { q.au_max = actif && k === j; });
        fermerVoile(); apresEditeur();
      },
      surType: function (t) { l.type_serie = t; fermerVoile(); apresEditeur(); },
      surSupprimer: function () {
        fermerVoile();
        var e = exoBrouillon(i);
        if (e) e.series.splice(j, 1);
        apresEditeur();
      }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ⚠️ LA NOTE DE LA ROUTINE, PAS CELLE DE LA SÉANCE (§7 quindecies.4). Ce
  // qu'on écrit ici REVIENT à chaque réutilisation — c'est un rappel de
  // technique. Celle qu'on prendra en séance restera sur la séance : ce sont
  // deux colonnes, sur deux tables, et la question de fin (§6) les distingue.
  function ouvrirNoteExoRoutine(i) {
    var e = exoBrouillon(i);
    if (!e) return;
    Rendu.rendreFeuilleNote($('feuille-contenu'), {
      exercice: nomExoBrouillon(i),
      note: e.note,
      surNote: function (v) { e.note = v; },
      surFermer: function () { fermerVoile(); apresEditeur(); }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ⚠️ LA MÊME MOLETTE QU'EN SÉANCE (§7 sexdecies), et c'est tout l'objet du
  // chantier 44 : le pavé de décalage vivait ici et une grille de huit valeurs
  // vivait là-bas, pour la même question. Il n'en reste qu'un écran.
  //
  // Trois sorties, et elles diffèrent : « Valider » pose la valeur centrée,
  // « Annuler » ne touche à rien — le brouillon reste exactement ce qu'il
  // était — et « Désactiver » écrit `null`, jamais zéro.
  function ouvrirReposExoRoutine(i) {
    var e = exoBrouillon(i);
    if (!e) return;
    var poser = function (v) { e.repos_cible_s = v; fermerVoile(); apresEditeur(); };
    Rendu.rendreFeuilleRepos($('feuille-contenu'), {
      exercice: nomExoBrouillon(i),
      repos: e.repos_cible_s,
      surValider: poser,
      surDesactiver: function () { poser(null); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // 193-3 (maquette de l'ondulation, écran 1) — « Automatique » + les cinq zones, sur chaque exercice de la routine. Un choix
  // EXPLICITE, écrit dans le brouillon (`zone`, NULL = Automatique) : rien ne part avant « Enregistrer ». Deux lignes du même
  // exercice avec deux zones : la séance prend la première (la consigne est par exercice) — la feuille le dit.
  function ouvrirZoneExoRoutine(i) {
    var e = exoBrouillon(i);
    if (!e) return;
    var autres = brouillon.exercices.filter(function (x, k) { return k !== i && x.exercise_slug === e.exercise_slug; });
    var doublon = autres.length > 0;
    Rendu.rendreFeuilleZoneRoutine($('feuille-contenu'), {
      titre: 'Zone de cet exercice',
      sous: nomExoBrouillon(i) + ', dans cette routine',
      zones: Moteur.ZONES,
      choisie: Routines.zoneValide(e.zone),
      aide: doublon ? 'Cet exercice est deux fois dans la routine\u00a0: le coach prend la zone de la première ligne.' : null,
      surChoix: function (cle) { e.zone = Routines.zoneValide(cle); fermerVoile(); apresEditeur(); },
      surFermer: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ⚠️ LES CINQ GESTES DU §7 duodecies.2, ET AUCUN CALCUL ICI. Ce qui a du sens
  // — grouper, dégrouper — se lit sur les liens, par `THRoutines`. L'écran ne
  // redécide pas tout seul ce qu'est un groupe.
  function ouvrirFeuilleExoRoutine(i) {
    if (!brouillon.exercices[i]) return;
    annoncerDansLEditeur('');          // la phrase d'un geste précédent ne reste pas affichée sur un état qui a changé
    Rendu.rendreFeuilleExoRoutine($('feuille-contenu'), {
      nom: nomExoBrouillon(i),
      surRemplacer: function () { ouvrirRemplacerDansLEditeur(i); },
      surNeVeuxPas: function () { fermerVoile(); neVeutPasDansLEditeur(i); },
      peutGrouper: Routines.peutGrouper(brouillon.exercices, i),
      estGroupe: Routines.estGroupe(brouillon.exercices, i),
      // Le lien avec le voisin du dessous : c'est lui, et lui seul, qui fait un
      // superset dans une liste (§2.3 — un bloc est une suite contiguë).
      surGrouper: function () {
        brouillon.exercices = Routines.basculerLien(brouillon.exercices, i);
        fermerVoile(); apresEditeur();
      },
      // Sortir l'exercice de son groupe. Un superset à deux se DISSOUT : il
      // n'existe pas de groupe à un (§7 decies), et `appliquerLiens` le sait.
      surDegrouper: function () {
        brouillon.exercices = Routines.degrouper(brouillon.exercices, i);
        fermerVoile(); apresEditeur();
      },
      surReorganiser: brouillon.exercices.length > 1
        ? function () { fermerVoile(); ouvrirReorganisation(); }
        : null,
      // Rien n'est écrit tant qu'on n'a pas enregistré : retirer une ligne du
      // brouillon ne perd rien, et une question ici serait le bruit qu'on tape
      // sans lire (§6.2).
      surSupprimer: function () {
        fermerVoile();
        brouillon.exercices.splice(i, 1);
        renumeroterBrouillon();
      }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ES §7 quindecies.8 (60-3) — « REMPLACER » DANS L'ÉDITEUR : la feuille de
  // « Machine prise » en séance (MOTEUR §9.19) SANS « Plus tard ». Les frères
  // par `Seance.freresProposes` — LA MÊME FONCTION : le même ordre, le même
  // rangement par matériel, le même « Dernière fois… » (`faitsDesFreres`) —,
  // puis « Chercher dans le catalogue », le sélecteur de l'éditeur. Le
  // remplaçant prend la place (`Routines.exerciceRemplace`) ; rien n'est écrit
  // avant « Enregistrer », comme tout geste de l'éditeur.
  function ouvrirRemplacerDansLEditeur(i) {
    var e = brouillon && brouillon.exercices[i];
    if (!e) return;
    var index = Modele.indexerExercices(local.exercices);
    var presents = brouillon.exercices.map(function (x) { return x.exercise_slug; });
    var freres = freresDe(e.exercise_slug, presents);
    var choix = function (f) {
      return { nom: Modele.nommer(index, f.slug), fait: f.fait, ecarte: f.ecarte,
               surChoisir: function () { fermerVoile(); remplacerDansLEditeur(i, f.slug); } };
    };
    Rendu.rendreFeuilleMachinePrise($('feuille-contenu'), {
      titre: 'Remplacer',
      nom: Modele.nommer(index, e.exercise_slug),
      tard: null,
      freres: freres.map(choix),
      cousins: cousinsDe(e.exercise_slug, presents).map(choix),
      chercher: 'Chercher dans le catalogue',
      surCatalogue: function () { fermerVoile(); ouvrirCatalogue(null, i); }
    });
    ouvrirVoile($('feuille-seance'));
  }

  function remplacerDansLEditeur(i, slug) {
    if (!brouillon || !brouillon.exercices[i] || !slug) return;
    brouillon.exercices[i] = Routines.exerciceRemplace(brouillon.exercices[i], slug,
      mesuresDuRemplacement(brouillon.exercices[i].exercise_slug, slug));
    renumeroterBrouillon();
  }

  // ES §7 quindecies.9 (60-4) — « JE N'EN VEUX PAS », dans le menu ⋯ d'un exercice de l'éditeur, à côté de « Remplacer ».
  // Le remplaçant est LE PREMIER FRÈRE de la feuille de « Remplacer » (`freresDe` : la même fonction, le même ordre)
  // qui n'est ni écarté ni déjà dans la routine ; aucun : la feuille de « Remplacer » s'ouvre. L'exercice est écarté
  // AU GESTE (le profil), même sans remplaçant ; le remplacement, lui, suit les règles de « Remplacer » et ne
  // s'écrit qu'avec « Enregistrer ». Jamais en séance : là, un refus est souvent passager (« Machine prise »).
  function neVeutPasDansLEditeur(i) {
    var e = brouillon && brouillon.exercices[i];
    if (!e) return;
    var slug = e.exercise_slug;
    var ecartes = Profil.ecartesDe(profil);
    if (ecartes.indexOf(slug) < 0) {
      var champs = Profil.preparerChamps(profil, { exercices_ecartes: ecartes.concat([slug]) }, new Date());
      if (Object.keys(champs).length) poserProfil(champs).catch(function () {});
    }
    var presents = brouillon.exercices.map(function (x) { return x.exercise_slug; });
    var premier = freresDe(slug, presents).filter(function (f) { return !f.deja_dans_la_seance && !f.ecarte; })[0];
    if (!premier) return ouvrirRemplacerDansLEditeur(i);
    var ancien = nomExoBrouillon(i);
    remplacerDansLEditeur(i, premier.slug);
    annoncerDansLEditeur(ancien + ' est remplacé par ' + Modele.nommer(Modele.indexerExercices(local.exercices), premier.slug) +
      '. Je ne te le proposerai plus.');
  }

  // La voix du coach sous les exercices de l'éditeur : une phrase, effacée à l'ouverture d'une routine.
  function annoncerDansLEditeur(texte) {
    var n = $('voix-routine');
    if (!n) return;
    n.textContent = texte || '';
    n.hidden = !texte;
  }

  // ⚠️ DÉPLACER RELIT LES LIENS DE LA NOUVELLE ADJACENCE. Sortir un exercice
  // d'un superset le dégroupe ; en glisser un au milieu le coupe en deux. Les
  // deux se voient tout de suite — le lien est dessiné entre les cartes, à
  // l'endroit exact où il vient de céder.
  function renumeroterBrouillon() {
    brouillon.exercices = Routines.renumeroter(brouillon.exercices);
    return apresEditeur();
  }

  // ⚠️ L'ÉDITEUR DÉPLACE DÉSORMAIS DES BLOCS, PLUS DES VOISINS (ch. 46).
  // `echanger(i, i±1)` échangeait deux EXERCICES : sur un superset, ça sortait
  // une branche de son groupe. En séance, `deplacerBloc` déplace le bloc entier
  // depuis le chantier 28 — les deux écrans disaient donc deux choses
  // différentes du même geste. Maintenant qu'ils partagent le repli, le
  // glissement et le mode, ils partagent aussi la règle.
  function ordreBlocsCourant(blocs) {
    return blocs.map(function (_, i) { return String(i); });
  }

  function reordonnerBrouillonParBlocs(cles) {
    var blocs = Modele.blocsDeSeance(brouillonCommeSeance(), local.exercices);
    var neufs = [];
    cles.forEach(function (k) {
      (indicesDe(blocs[Number(k)]) || []).forEach(function (i) {
        if (brouillon.exercices[i]) neufs.push(brouillon.exercices[i]);
      });
    });
    if (neufs.length !== brouillon.exercices.length) return;
    brouillon.exercices = neufs;
    renumeroterBrouillon();
  }

  function deplacerBlocRoutine(blocs, iBloc, delta) {
    var cible = iBloc + delta;
    if (cible < 0 || cible >= blocs.length) return;
    var cles = ordreBlocsCourant(blocs);
    var pris = cles.splice(iBloc, 1)[0];
    cles.splice(cible, 0, pris);
    reordonnerBrouillonParBlocs(cles);
  }

  async function enregistrerBrouillon() {
    if (enregistrementEnCours) return;
    var bouton = $('btn-enregistrer-routine'), erreur = $('erreur-routine');
    brouillon.nom = $('champ-nom-routine').value;

    var routineDOrigine = brouillon.id
      ? routines.filter(function (r) { return r.id === brouillon.id; })[0] : null;
    brouillon.nomChange = !routineDOrigine ||
      Routines.nomPropre(brouillon.nom) !== Routines.nomPropre(routineDOrigine.nom);
    // §7 duodecies.3 (52-1) — un brouillon d'avant le chantier ne porte pas de
    // dossier (`undefined`) : il ne touche pas à celui de la routine.
    brouillon.dossierChange = !!routineDOrigine && brouillon.dossier !== undefined &&
      Routines.dossierPropre(brouillon.dossier) !== Routines.dossierPropre(routineDOrigine.dossier);

    var verdict = Routines.valider(brouillon, routines);
    if (!verdict.valide) { erreur.textContent = messageVerdict(verdict); return; }

    enregistrementEnCours = true;
    erreur.textContent = '';
    bouton.disabled = true; bouton.textContent = 'Enregistrement…';
    try {
      var r = await Routines.enregistrer(brouillon, Donnees, {
        userId: sessionActive && sessionActive.user && sessionActive.user.id,
        // Les séries programmées visent leur exercice par clé étrangère : un
        // exercice neuf doit donc porter son identifiant AVANT d'être écrit,
        // sinon sa structure ne peut pas partir dans le même passage.
        uuid: uuid,
        // ⚠️ LE RANG D'UNE ROUTINE NEUVE SE CALCULE ICI, parce que c'est ici
        // qu'on a la liste complète — `routines_user_rang_uniq` porte sur
        // (user_id, rang), donc le prochain libre se lit sur TOUT l'utilisateur.
        rangSuivant: rangSuivantBibliotheque()
      });
      if (!r.ok) {
        // Le brouillon reste À L'ÉCRAN, intact. Rien n'est vidé, rien n'est
        // perdu — c'est la première question de quelqu'un dont l'enregistrement
        // vient d'échouer, et la réponse doit être visible.
        erreur.textContent = Routines.messageErreur(r);
        return;
      }
      // ⚠️ LE BROUILLON EST CONSOMMÉ, PAS LAISSÉ DERRIÈRE. Il n'existait que
      // pour protéger du départ accidentel ; la routine est en base, donc il
      // n'a plus rien à protéger — et un bandeau qui proposerait de « reprendre »
      // ce qui vient d'être enregistré ferait douter de l'enregistrement.
      await oublierBrouillon();
      await chargerRoutines();
      allerA(Routeur.SAISIE, {}, true);
      rendreSaisie();
    } finally {
      enregistrementEnCours = false;
      bouton.disabled = false; bouton.textContent = 'Enregistrer';
    }
  }

  // Un message par cause, jamais la liste brute des soucis : on nomme le
  // premier problème, celui qu'il faut corriger maintenant.
  function messageVerdict(verdict) {
    var s = verdict.soucis[0];
    if (s.champ === 'nom' && s.raison === 'vide') return 'Donne un nom à ta routine.';
    if (s.champ === 'nom' && s.raison === 'trop-long') return 'Le nom fait plus de ' + Routines.NOM_MAX + ' caractères.';
    if (s.champ === 'nom' && s.raison === 'doublon') return Routines.MESSAGES.doublon;
    if (s.champ === 'dossier') return 'Le nom du dossier fait plus de ' + Routines.DOSSIER_MAX + ' caractères.';
    // ⚠️ IL N'Y A PLUS DE BORNE SUR LE NOMBRE DE SÉRIES (chantier 43) : une
    // ligne par série, et `routine_sets` n'impose aucun minimum de lignes. Le
    // seul refus qui reste est l'exercice VIDE — qui démarrerait une séance
    // sans rien à y faire.
    if (s.champ === 'series') return 'Un exercice n\u2019a aucune série. Ajoute-lui une ligne, ou retire-le.';
    if (s.champ === 'reps_visees') return 'Les reps visées vont de ' + Routines.REPS_MIN + ' à ' + Routines.REPS_MAX + ', ou restent vides.';
    // ⚠️ LE MESSAGE PARLE LA LANGUE DU CHAMP (chantier 42). Le repos se saisit
    // en mm:ss depuis le §7 quaterdecies.2 : annoncer une borne « en secondes »
    // obligerait à convertir de tête pour comprendre ce qu'on vient de taper.
    if (s.champ === 'repos_cible_s') return 'Le repos va de ' + Rendu.mmss(Routines.REPOS_MIN) +
      ' à ' + Rendu.mmss(Routines.REPOS_MAX) + ', ou reste vide.';
    return 'Il manque un exercice sur une ligne.';
  }

  // ══ SUPPRIMER UNE ROUTINE (§7 duodecies.1) ═══════════════════════════════
  //
  // ⚠️ L'ARCHIVAGE EST PARTI, ET C'EST LE POINT. Archiver était irréversible
  // DEPUIS L'APP : une routine archivée par erreur n'avait aucun chemin de
  // retour, et il a fallu une écriture en base le 13/09. Un geste franc, avec
  // confirmation, vaut mieux qu'un geste doux dont on ne revient pas.
  //
  // ⚠️ ET LA CONFIRMATION NE PARLE PAS DE « LIEN ». Une séance passée n'est pas
  // liée à sa routine, elle en est ISSUE : `sessions_routine_fk` est
  // ON DELETE SET NULL, donc rien de ce qui a été fait ne bouge. C'est la
  // crainte légitime de quelqu'un qui supprime, et la phrase doit y répondre.
  function demanderSuppressionRoutine() {
    if (!brouillon || !brouillon.id) return;
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Supprimer cette routine ?',
      sujet: Routines.nomPropre(brouillon.nom) || 'Routine',
      danger: true,
      libelle: 'Supprimer',
      aide: 'Les séances que tu as déjà faites avec elle restent intactes, ' +
            'avec toutes leurs séries. Seule la routine part, et rien ne la remet en place.',
      surConfirmer: async function () { fermerVoile(); await supprimerCourante(); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  async function supprimerCourante() {
    if (!brouillon || !brouillon.id) return;
    var erreur = $('erreur-routine');
    erreur.textContent = '';
    try {
      // `routine_exercises_routine_id_fkey` est ON DELETE CASCADE : les
      // exercices partent avec la routine, sans second appel.
      await Donnees.supprimerRoutine(brouillon.id);
      // La routine n'existe plus : son brouillon non plus. Le garder ferait
      // proposer la reprise d'une routine supprimée.
      await oublierBrouillon();
      await chargerRoutines();
      allerA(Routeur.SAISIE, {}, true);
      rendreSaisie();
    } catch (e) {
      erreur.textContent = Routines.messageErreur({ erreur: Routines.classerErreur(e) });
    }
  }

  // ══ LE DOSSIER D'UNE ROUTINE (§7 duodecies.3, chantier 52) ══════════════
  //
  // Une étiquette, choisie dans l'éditeur : « Sans dossier », un dossier
  // existant, ou un nouveau nom. Comme le reste du brouillon, rien ne part en
  // base avant « Enregistrer ».
  function ouvrirDossierRoutine(erreur) {
    if (!brouillon) return;
    Rendu.rendreFeuilleDossier($('feuille-contenu'), {
      sujet: Routines.nomPropre($('champ-nom-routine').value) || 'Routine',
      dossiers: Routines.dossiersDe(routines),
      actuel: Routines.dossierPropre(brouillon.dossier),
      erreur: typeof erreur === 'string' ? erreur : '',
      surChoix: function (d) { brouillon.dossier = d; fermerVoile(); apresEditeur(); },
      surNouveau: function (texte) {
        var d = Routines.dossierPropre(texte);
        if (d === null) return ouvrirDossierRoutine('Donne un nom au dossier.');
        if (!Routines.dossierValide(d)) {
          return ouvrirDossierRoutine('Le nom du dossier fait plus de ' + Routines.DOSSIER_MAX + ' caractères.');
        }
        brouillon.dossier = d; fermerVoile(); apresEditeur();
      },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ══ DUPLIQUER (§7 quindecies.4, chantier 52) ═════════════════════════════
  //
  // ⚠️ PAR LE CHEMIN DE CRÉATION, PAS UN SECOND. La copie est un brouillon de
  // routine NEUVE (`Routines.copieDeRoutine`) que `Routines.enregistrer` crée
  // comme n'importe quelle autre : le rang suivant, et l'annulation si une
  // écriture échoue en route. On copie la routine ENREGISTRÉE — celle de la
  // bibliothèque —, jamais le brouillon : l'originale ne bouge pas, et la copie
  // s'ouvre aussitôt dans l'éditeur, pour la modifier.
  var duplication = null;   // { routine, nom, erreur }

  function nomsReserves() {
    return routines.filter(function (r) { return r && !r.archivee_a; }).map(function (r) { return r.nom; });
  }

  function demanderDuplication() {
    var r = brouillon && brouillon.id ? routines.filter(function (x) { return x.id === brouillon.id; })[0] : null;
    if (!r) return;
    duplication = { routine: r, nom: Routines.nomLibre(r.nom, nomsReserves(), 'copie'), erreur: '' };
    rendreFeuilleDuplication();
    ouvrirVoile($('feuille-seance'), function () { duplication = null; });   // 164 (D3) : à toute fermeture
  }

  function rendreFeuilleDuplication() {
    Rendu.rendreFeuilleDupliquer($('feuille-contenu'), {
      sujet: duplication.routine.nom,
      nom: duplication.nom,
      erreur: duplication.erreur,
      surNom: function (v) { duplication.nom = v; },
      surDupliquer: dupliquerRoutine,
      surAnnuler: fermerVoile
    });
  }

  async function dupliquerRoutine() {
    if (!duplication || enregistrementEnCours) return;
    var dup = duplication;   // 164 (D11) : la fermeture de la feuille remet `duplication` à zéro pendant l'écriture
    var copie = Routines.copieDeRoutine(dup.routine, dup.nom);
    var verdict = Routines.valider(copie, routines);
    if (!verdict.valide) { dup.erreur = messageVerdict(verdict); return rendreFeuilleDuplication(); }
    enregistrementEnCours = true;
    try {
      var r = await Routines.enregistrer(copie, Donnees, {
        userId: sessionActive && sessionActive.user && sessionActive.user.id,
        uuid: uuid,
        rangSuivant: rangSuivantBibliotheque()
      });
      if (!r.ok) { dup.erreur = Routines.messageErreur(r); if (duplication === dup) rendreFeuilleDuplication(); return; }
      if (duplication === dup) { duplication = null; fermerVoile(); }
      await chargerRoutines();
      // La copie s'ouvre À LA PLACE de l'originale (on remplace l'entrée
      // d'historique) : c'est elle qu'on vient faire, la semaine 2 à partir de
      // la semaine 1, et le retour remonte à la bibliothèque.
      allerA(Routeur.ROUTINE, { id: r.routine.id }, true);
      await prepererEditeur(r.routine.id);
    } finally {
      enregistrementEnCours = false;
    }
  }

  // ══ LA CHARGE DE DÉPART (§7 quindecies.3, MOTEUR §9.21 — chantier 52) ═══
  //
  // ⚠️ UNE DÉFINITION DE « JAMAIS FAIT » : aucune séance de l'historique ne
  // porte l'exercice. L'éditeur, la charge passée au coach et la cascade du
  // pré-remplissage (`Seance.fantome`, sur `precedent`) lisent la même chose.
  function jamaisFait(slug) {
    return derniereSeanceDe(slug) === null;
  }

  // Ce que l'éditeur dit de la charge d'un exercice : un champ « départ » sur un
  // exercice jamais fait, le coach seul sinon — avec la dernière fois, par
  // « Dernière séance » (#356). `null` : rien à en dire — pas de colonne de
  // charge, ou une charge de NATURE (lest, aide : §9.17, leur départ a ses
  // propres règles, et l'aide se tape en positif là où le coach la range en
  // négatif).
  function chargeSimple(slug) {
    var exo = catalogueIndexe()[slug];
    var g = exo ? Modele.gabaritDe(exo) : null;
    return !!g && !g.inconnue && g.mesure === 'charge_reps' && !g.nature;
  }

  function chargeDansLEditeur(slug) {
    if (!chargeSimple(slug)) return null;
    if (jamaisFait(slug)) return { depart: true, fait: null };
    return { depart: false, fait: derniereSeanceDe(slug) };
  }

  // La charge de départ telle que la séance ouverte la porte (les lignes
  // viennent de la routine) : la première série de travail qui en a une, ses
  // reps visées, et les séries de travail de l'exercice. Seulement sur un
  // exercice jamais fait : déjà fait, le coach décide seul.
  function chargeDeDepartDe(slug) {
    var exo = ((seance && seance.exercices) || []).filter(function (x) { return x && x.exercise_slug === slug; })[0];
    if (!exo) return null;
    // 193-1 — un recul n'est pas un départ : sa charge suit la grosse série, qui n'existe pas encore.
    var travail = (exo.series || []).filter(function (x) { return Modele.estTravail(x) && !Modele.estRecul(x); });
    // 180 (A-F-09, D4) — AU POIDS DU CORPS, le départ est fait des reps de la routine (pas de charge) : la première série de
    // travail qui les porte, sur un exercice jamais fait.
    var cat = catalogueIndexe()[slug];
    var gab = cat ? Modele.gabaritDe(cat) : null;
    if (gab && !gab.inconnue && gab.mesure === 'reps') {
      var avecReps = travail.filter(function (x) { return x.reps_visees !== null && x.reps_visees !== undefined && x.reps_visees >= 1; })[0];
      if (!avecReps || !jamaisFait(slug)) return null;
      return { charge: null, reps: avecReps.reps_visees, n: travail.length };
    }
    if (!chargeSimple(slug)) return null;
    var avec = travail.filter(function (x) { return x.charge_cible_kg !== null && x.charge_cible_kg !== undefined; })[0];
    // L'historique ne se lit que s'il y a une charge de départ à donner.
    if (!avec || !jamaisFait(slug)) return null;
    return { charge: avec.charge_cible_kg, reps: avec.reps_visees === undefined ? null : avec.reps_visees,
             n: travail.length };
  }

  // ── Le catalogue ─────────────────────────────────────────────────────────
  //
  // Il vit dans le cache local (237 entrées, synchronisées avec le reste) :
  // chercher un exercice marche donc HORS LIGNE, contrairement à
  // l'enregistrement. C'est la moitié du problème que le cache résout déjà.
  // Le catalogue sert trois intentions, et c'est lui qui les distingue :
  // ajouter en fin de séance (rien), insérer APRÈS un bloc (`apres`), ou
  // REMPLACER un exercice (`remplace`).
  var intentionCatalogue = { apres: null, remplace: null, apercu: null, rattacher: null };

  // ⚠️ DEUX INDICES, ET RIEN D'AUTRE (chantier 33). Les deux boutons généraux
  // étaient câblés `addEventListener('click', ouvrirCatalogue)` : le gestionnaire
  // recevait donc le MouseEvent comme `apres`, qui n'est pas `undefined` et
  // passait la garde. `Math.min(n, MouseEvent)` vaut `NaN`, `splice(NaN, …)`
  // insère à l'index 0 — et tout exercice ajouté en séance se posait EN TÊTE.
  // Effet de bord : `ajouterExercice` en devenait inatteignable, ce qui masquait
  // la moitié du défaut d'identifiant du chantier 32.
  //
  // Comme pour `serieVide`, on corrige le CONTRAT : ce qui n'est pas un indice
  // n'est pas un indice. Le câblage est explicite en face, mais c'est cette
  // garde qui survit au prochain appelant.
  function indiceOuNul(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // §9.13 (49-C) — le nombre de séries proposé au départ, hors routine :
  // `n` de la consigne (l'habitude), sinon les séries de travail de la
  // dernière séance, sinon l'intention (`Plan.seriesDeDepart`, 49-U6).
  //
  // ⚠️ PAS EN ÉDITION. Corriger une séance passée (§7 octies), c'est noter ce
  // qui a été fait, pas démarrer une séance : il n'y a pas de « séance en
  // cours » à proposer, et le moteur s'y tait déjà. Une ligne, comme avant.
  function seriesDeDepartPour(slug) {
    if (enEdition()) return 1;
    var c = seance ? consigneDe(slug) : null;
    return Plan.seriesDeDepart(c ? c.consigne : null, precedentDe(slug), intentionDeLExercice(slug));
  }

  function ouvrirCatalogue(apres, remplace, apercu, rattacher) {
    // 60-4 — `apercu` : le catalogue ouvert depuis « Remplacer » de l'aperçu du programme construit
    // (`{ i, k, retour }`) : le choix prend la place de CETTE ligne, et `retour` rouvre l'aperçu à la fermeture.
    // 69 — `rattacher` : le nom Hevy à rattacher (ECRAN-PROFIL §2.4 quater). Le MÊME catalogue, ses filtres
    // compris : le choix retourne à l'aperçu de l'import, sans toucher ni séance ni routine.
    intentionCatalogue = { apres: indiceOuNul(apres), remplace: indiceOuNul(remplace), apercu: apercu || null,
                           rattacher: rattacher || null };
    $('titre-catalogue').hidden = !rattacher;
    $('titre-catalogue').textContent = rattacher ? Import.titreRattacher(rattacher) : '';
    $('pied-rattacher').hidden = !rattacher;
    // 60-1 — les exercices déjà faits, relevés UNE FOIS à l'ouverture : la
    // recherche se relance à chaque frappe, et le balayage des séries est le
    // coût que `faits` garde déjà hors de la saisie. 126 — et le contexte d'ouverture, avec lui.
    faitsDuCatalogue = null;
    contexteDuCatalogue = null;
    // 126 (ES §7 quindecies.11) — LE CHAMP S'OUVRE VIDE, Rattacher compris : « Les plus proches » disent pourquoi.
    $('champ-recherche-exo').value = '';
    // 67B (ES §7 quindecies.10) — les filtres reviennent à zéro à chaque ouverture : un filtre oublié cacherait des
    // exercices la fois suivante.
    filtresCatalogue = { equipement: null, muscle: null };
    $('choix-filtre-exo').hidden = true;
    $('resultats-exo').hidden = false;
    rendreCatalogue();
    ouvrirVoile($('catalogue'), apercu ? apercu.retour : undefined);
    $('champ-recherche-exo').focus();
  }

  // 126 — `faitsDuCatalogue` : le nombre de séances de chaque exercice fait (`faits.seancesParExercice`), relevé à
  // l'ouverture ; `contexteDuCatalogue` : d'où le catalogue s'ouvre (`contexteCatalogue`), relevé avec lui.
  var faitsDuCatalogue = null;
  var contexteDuCatalogue = null;
  // 67B — les deux filtres du catalogue (`Routines.chercher`, `filtres`), remis à zéro par `ouvrirCatalogue`.
  var filtresCatalogue = { equipement: null, muscle: null };
  var FILTRES_CATALOGUE = {
    equipement: { titre: 'Matériel', tous: 'Tout le matériel', libelle: function (c) { return Profil.libelleEquipement(c); } },
    muscle: { titre: 'Muscle principal', tous: 'Tous les muscles', libelle: function (c) { return Semaine.libelleMuscle(c); } }
  };

  // Le choix d'un filtre : la feuille de choix de l'app (`rendreFeuilleChoix`), À LA PLACE des résultats, dans le
  // catalogue — un second voile fermerait le catalogue (`ouvrirVoile` n'en tient qu'un). Un seul choix à la fois ;
  // la première ligne remet à zéro. Seuls les choix présents au catalogue local (`Routines.filtresDuCatalogue`).
  function ouvrirChoixFiltre(cle) {
    var f = FILTRES_CATALOGUE[cle];
    if (!f) return;
    var presents = Routines.filtresDuCatalogue(local.exercices)[cle === 'equipement' ? 'equipements' : 'muscles'];
    var fermer = function () { $('choix-filtre-exo').hidden = true; $('resultats-exo').hidden = false; };
    Rendu.rendreFeuilleChoix($('choix-filtre-exo'), {
      titre: f.titre,
      options: [{ cle: '', libelle: f.tous }].concat(presents.map(function (c) { return { cle: c, libelle: f.libelle(c) }; })),
      valeur: filtresCatalogue[cle] === null ? '' : filtresCatalogue[cle],
      surChoix: function (c) { filtresCatalogue[cle] = c === '' ? null : c; fermer(); rendreCatalogue(); },
      surAnnuler: fermer
    });
    $('resultats-exo').hidden = true;
    $('choix-filtre-exo').hidden = false;
  }

  function retirerFiltre(cle) {
    filtresCatalogue[cle] = null;
    rendreCatalogue();
  }

  // La sous-ligne d'un résultat : « Machine · Grand dorsal » ; sans muscle, le matériel seul (et l'inverse).
  function descriptionExo(e) {
    var mats = e.equipement ? Profil.libelleEquipement(e.equipement) : '';
    var m = (e.muscles_primaires || [])[0];
    return [mats, m ? Semaine.libelleMuscle(m) : ''].filter(Boolean).join(' · ');
  }

  // 126 (ES §7 quindecies.11) — LE CONTEXTE D'OUVERTURE, déduit de l'intention (`apres`, `remplace`, `apercu`,
  // `rattacher`) et de la séance ouverte. Rend la forme de `Routines.suggestions` (`type`, `dans`, et ce que chaque
  // type lit), plus `va` : « va avec le contexte » pour `Routines.chercher` (les frères, les muscles principaux).
  //   · Rattacher → `rattacher` ; « Remplacer » (séance, éditeur, aperçu du programme) → `remplacer`, ses frères dans
  //     l'ordre de la feuille « Remplacer » (`freresDe` : `Seance.freresProposes`), ses muscles ;
  //   · en séance partie d'une routine → `seance_routine` (l'historique de la routine, `faits.exercicesDeLaRoutine`) ;
  //     séance libre → `seance_libre` (`faits.exercicesRecents`) ; l'éditeur → `routine`. Les muscles de ce qui est là.
  function slugsDesLignes(l) {
    return (l || []).map(function (x) { return x && x.exercise_slug; }).filter(Boolean);
  }
  function contexteCatalogue(pourSeance) {
    var i = intentionCatalogue;
    var index = Modele.indexerExercices(local.exercices);
    var musclesDe = function (slugs) {
      var m = [];
      slugs.forEach(function (s) {
        ((index[s] && index[s].muscles_primaires) || []).forEach(function (x) { if (m.indexOf(x) < 0) m.push(x); });
      });
      return m;
    };
    var pourRemplacer = function (slug, dans) {
      var freres = slug ? freresDe(slug, dans).map(function (f) { return f.slug; }) : [];
      return { type: 'remplacer', remplace: slug, dans: dans, freres: freres,
               va: { freres: freres, muscles: slug ? musclesDe([slug]) : [] } };
    };
    if (i.rattacher) return { type: 'rattacher', dans: [], va: {} };
    if (i.apercu) {
      var rt = construit && construit.routines && construit.routines[i.apercu.i];
      var ligne = rt && rt.exercices[i.apercu.k];
      return pourRemplacer(ligne ? ligne.exercise_slug : null, slugsDesLignes(rt && rt.exercices));
    }
    var lignes = pourSeance ? seance.exercices : (brouillon && brouillon.exercices);
    var dans = slugsDesLignes(lignes);
    if (i.remplace !== null && lignes && lignes[i.remplace]) return pourRemplacer(lignes[i.remplace].exercise_slug, dans);
    var va = { muscles: musclesDe(dans) };
    if (pourSeance && seance.routine_id) {
      return { type: 'seance_routine', dans: dans, va: va,
               souvent: faits.exercicesDeLaRoutine(corpus(), seance.routine_id, seance.id) };
    }
    if (pourSeance) {
      var r = faits.exercicesRecents(corpus(), new Date(), seance.id);
      return { type: 'seance_libre', dans: dans, va: va, recents: r.recents, plus_faits_3_mois: r.plusFaits };
    }
    return { type: 'routine', dans: dans, va: va };
  }

  // 126 — LES OPTIONS DE LA RECHERCHE (`Routines.chercher`, `Routines.suggestions`) : les noms alternatifs du cache, le
  // nombre de séances de chaque exercice, le matériel déclaré (60-1 : `Profil.equipementsDe`, la règle du matériel
  // reste `Profil.estHorsMateriel`, appelée par la recherche), les écartés (60-4, à la fin), et le contexte : « va
  // avec », et l'exercice remplacé, qui n'apparaît jamais.
  function optionsDuCatalogue(ctx) {
    if (faitsDuCatalogue === null) faitsDuCatalogue = faits.seancesParExercice(corpus());
    var c = ctx || {};
    return { alias: local.alias, faits: faitsDuCatalogue, equipements: Profil.equipementsDe(profil && profil.materiel),
             sansBarre: Profil.sansBarreDeTraction(profil),
             ecartes: Profil.ecartesDe(profil), contexte: c.va || {}, exclu: c.type === 'remplacer' ? c.remplace : null };
  }

  // 126 — LES MENTIONS d'un résultat : « Pas dans Ma salle » (hors du matériel déclaré, jamais fait — la règle de
  // `Profil.estHorsMateriel`) ; « Déjà dans la routine », dans l'éditeur seulement. « écarté » : le rendu le pose.
  function mentionsExo(o, ctx) {
    return function (e) {
      var m = [];
      if (!(o.faits[e.slug] > 0) && Profil.estHorsDeMaSalle(e.slug, e, o.equipements, o.sansBarre)) m.push('Pas dans Ma salle');
      if (ctx.type === 'routine' && ctx.dans.indexOf(e.slug) >= 0) m.push('Déjà dans la routine');
      return m;
    };
  }

  function rendreCatalogue() {
    // « Aucun exercice ne correspond » serait FAUX tant que le catalogue n'est
    // pas arrivé — il dirait que la recherche a échoué alors que c'est la
    // synchronisation qui n'a pas fini. Trouvé au banc d'écran, pas en test.
    if (!local.exercices.length) {
      return Rendu.message($('resultats-exo'), 'Le catalogue arrive… Il est enregistré sur l’appareil à la première synchronisation.');
    }
    // Le même catalogue sert deux écrans : l'éditeur de routine et la séance en
    // cours. C'est la séance qui gagne quand elle est ouverte — on y est.
    var pourSeance = !!seance && !vues.seance.hidden;
    if (contexteDuCatalogue === null) contexteDuCatalogue = contexteCatalogue(pourSeance);
    var ctx = contexteDuCatalogue;
    var o = optionsDuCatalogue(ctx);
    // 67B — les deux filtres, combinés au nom (ET), avant l'ordre et la limite ; le compte quand l'un est actif.
    var requete = $('champ-recherche-exo').value;
    var actif = filtresCatalogue.equipement !== null || filtresCatalogue.muscle !== null;
    var n = actif ? Routines.chercher(local.exercices, requete,
      Object.assign({}, o, { filtres: filtresCatalogue, limite: Infinity })).length : 0;
    Rendu.rendreFiltresExo($('filtres-exo'), $('compte-exo'), {
      filtres: ['equipement', 'muscle'].map(function (cle) {
        var v = filtresCatalogue[cle];
        return { cle: cle, actif: v !== null, libelle: v === null ? FILTRES_CATALOGUE[cle].tous : FILTRES_CATALOGUE[cle].libelle(v) };
      }),
      compte: actif ? n + (n > 1 ? ' exercices' : ' exercice') : null,
      surOuvrir: ouvrirChoixFiltre,
      surRetirer: retirerFiltre
    });
    var choisir = function (exo) {
      // `fermerVoile` rouvre l'aperçu du programme construit (son `retour`) ; le choix prend alors la place.
      var versApercu = intentionCatalogue.apercu;
      // 69 — le nom Hevy rattaché : le choix retourne à l'aperçu de l'import.
      var nomHevy = intentionCatalogue.rattacher;
      fermerVoile();
      if (nomHevy) return rattacherNom(nomHevy, exo.slug);
      if (versApercu) return poserDansLeProgramme(versApercu.i, versApercu.k, exo.slug);
      if (pourSeance) {
        // §14.7 (49-U17, delta 49-35) — l'exercice ajouté dont la série de
        // plus est active reçoit sa ligne de plus, comme à l'ouverture.
        var avantAjout = seance.exercices;
        var puisLigneDePlus = function () { return ligneDePlusPourAjout(avantAjout, exo.slug); };
        // §14.4 (consolidation 4/7) — et, en semaine allégée, ses seules
        // lignes allégées. Pas au remplacement : la place reprend les lignes
        // de l'exercice remplacé, déjà allégées à l'ouverture — les réduire
        // encore les allégerait deux fois. Le remplaçant hérite de sa
        // routine (`heriterRoutine`).
        var puisAllegeeEtLigneDePlus = function () {
          return allegeePourAjout(avantAjout, exo.slug).then(puisLigneDePlus);
        };
        if (intentionCatalogue.remplace !== null) {
          return remplacerDansLaSeance(intentionCatalogue.remplace, exo.slug);
        }
        // §9.13 (49-C) — HORS ROUTINE, les séries de travail sont posées
        // d'emblée : l'habitude de l'exercice, sinon l'intention. Un
        // pré-remplissage, pas une prescription : « + Série » et le retrait
        // restent libres.
        var depart = { series: seriesDeDepartPour(exo.slug) };
        if (intentionCatalogue.apres !== null) {
          seance = Seance.insererExercice(seance, intentionCatalogue.apres, exo.slug, uuid, depart);
          return apresStructure().then(puisAllegeeEtLigneDePlus);
        }
        seance = Seance.ajouterExercice(seance, exo.slug, uuid, depart);
        return apresGeste({ structure: false }).then(puisAllegeeEtLigneDePlus);
      }
      // ⚠️ UNE SEULE LIGNE, VIDE (chantier 43). L'ancien modèle posait
      // `series: 3` — un défaut hérité de la colonne, qui prescrivait trois
      // séries à la place de l'utilisateur. Avec une ligne par série, en
      // poser trois serait le même geste en pire : trois lignes à effacer.
      // On en pose UNE, parce qu'un exercice à zéro série ne se saisit pas,
      // et « + Série » recopie la précédente — trois taps pour trois séries.
      //
      // Ni reps ni repos par défaut : une valeur inventée se lirait comme une
      // prescription, et serait pire qu'une absence.
      //
      // 60-3 (ES §7 quindecies.8) — « Chercher dans le catalogue » depuis
      // « Remplacer » : le choix prend la place, il ne s'ajoute pas.
      if (intentionCatalogue.remplace !== null && brouillon.exercices[intentionCatalogue.remplace]) {
        return remplacerDansLEditeur(intentionCatalogue.remplace, exo.slug);
      }
      brouillon.exercices.push({
        id: null, exercise_slug: exo.slug,
        series: [Routines.enSaisie(null)],
        repos_cible_s: null, groupe_superset: null, note: null, zone: null
      });
      apresEditeur();
    };
    var mentions = mentionsExo(o, ctx);
    // 126 (ES §7 quindecies.11) — LE CHAMP VIDE, SANS FILTRE : les suggestions du contexte, puis la phrase. Un filtre
    // actif : pas de sections, la liste filtrée dans l'ordre de la recherche.
    if (!Routines.replier(requete) && !actif) {
      var index = Modele.indexerExercices(local.exercices);
      var ligne = function (s, m) {
        var e = index[s];
        return e ? { exo: e, mentions: mentions(e).concat(m ? [m] : []) } : null;
      };
      var sections;
      if (ctx.type === 'rattacher') {
        sections = [{ titre: Routines.TITRES_SUGGESTIONS.proches,
          lignes: Routines.plusProches(local.exercices, intentionCatalogue.rattacher, o).map(function (p) {
            return ligne(p.slug, p.comme ? 'comme « ' + p.comme + ' »' : null);
          }).filter(Boolean) }];
      } else {
        sections = Routines.suggestions(local.exercices, ctx, o).map(function (sec) {
          return { titre: sec.titre, lignes: sec.slugs.map(function (s) { return ligne(s, null); }).filter(Boolean) };
        });
      }
      var pied = ctx.type === 'rattacher' ? 'Ou tape le nom de l’exercice.'
        : ctx.type === 'remplacer' ? 'Tape pour chercher dans tout le catalogue.'
        : 'Tape pour chercher dans les ' + local.exercices.length + ' exercices.';
      return Rendu.rendreSuggestionsExo($('resultats-exo'), {
        sections: sections.filter(function (sec) { return sec.lignes.length; }),
        pied: pied, surChoix: choisir, ecartes: o.ecartes, decrire: descriptionExo
      });
    }
    Rendu.rendreResultatsExo($('resultats-exo'),
      Routines.chercher(local.exercices, requete, Object.assign({}, o, { filtres: filtresCatalogue })),
      choisir, o.ecartes, descriptionExo, mentions);
  }

  // ── Vue Volume : la semaine, le relevé, puis le radar ────────────────────
  function rendreVolume(lundi) {
    if (lundi) lundiAffiche = lundi;
    montrer('volume', Routeur.VOLUME);

    var sem = semaineCourante();
    Rendu.rendreBarreSemaine($('barre-progression'), barrePour(sem, false));
    Rendu.rendreReleveZones($('releve-zones'), sem.zones, zoneOuverte,
      function (cle) {
        // Une zone ouverte à la fois : ouvrir Dos referme Jambes.
        zoneOuverte = (zoneOuverte === cle) ? null : cle;
        rendreVolume();
      },
      ouvrirFenetreMuscle);

    rendreRadar();
  }

  // Le radar ne suit PAS la semaine affichée : il compare deux fenêtres
  // glissantes ancrées sur aujourd'hui. Faire glisser la semaine du dessus ne
  // le fait donc pas bouger — c'est voulu, ce sont deux questions différentes
  // (« cette semaine » et « ces trente jours contre les trente d'avant »).
  function rendreRadar() {
    var p = Periode.periodeDe(periodeRadar);
    var f = Periode.fenetres(p.jours, new Date());
    var c = Periode.decouper(local.seances, local.series, f.courante);
    var a = Periode.decouper(local.seances, local.series, f.precedente);

    var comparaison = Periode.comparerZones(
      Semaine.volumeParZone(c.series, local.exercices),
      Semaine.volumeParZone(a.series, local.exercices),
      Semaine.ZONES);

    Rendu.rendrePeriodes($('periodes-radar'), Periode.PERIODES, periodeRadar, function (cle) {
      periodeRadar = cle;
      rendreRadar();
    });
    Rendu.rendreRadar($('radar'), comparaison, p, Periode);
    Rendu.rendreCartesPeriode($('cartes-radar'),
      comparaison.vide ? [] : Periode.cartes(comparaison,
        Semaine.bilanSemaine(c.seances, c.series, local.exercices),
        Semaine.bilanSemaine(a.seances, a.series, local.exercices)),
      p);
    $('note-radar').hidden = comparaison.vide;
  }

  // ── Vue Poids ────────────────────────────────────────────────────────────
  function rendrePoids() {
    montrer('poids', Routeur.POIDS);
    var p = Poids.periodeDe(periodePoids);
    var fenetre = Poids.filtrer(local.pesees, p.jours, new Date());

    Rendu.rendrePeriodes($('periodes-poids'), Poids.PERIODES, periodePoids, function (cle) {
      periodePoids = cle;
      rendrePoids();
    });
    Rendu.rendreCourbePoids($('courbe-poids'), Poids.courbe(fenetre, 300, 104));
    Rendu.rendreListePesees($('liste-pesees'), Poids.dernieres(fenetre, 12), fenetre.length);
  }

  // ── Fenêtre d'un muscle ──────────────────────────────────────────────────
  function ouvrirFenetreMuscle(muscle) {
    var sem = semaineCourante();
    var zone = Semaine.zoneDuMuscle(muscle.muscle);
    Rendu.rendreFenetreMuscle($('fen-muscle-contenu'), muscle,
      zone ? zone.libelle : null,
      Semaine.apportsParMuscle(muscle.muscle, sem.series, local.exercices, sem.seances),
      sem.bornes);
    ouvrirVoile($('fenetre-muscle'));
  }

  // ── Calendrier ───────────────────────────────────────────────────────────
  function ouvrirCalendrier() {
    var l = lundiAffiche || Semaine.bornesSemaine(new Date()).lundi;
    moisCalendrier = { annee: l.getFullYear(), mois: l.getMonth() };
    rendreCalendrier();
    ouvrirVoile($('calendrier'));
  }

  function rendreCalendrier() {
    var grille = Calendrier.grilleMois(moisCalendrier.annee, moisCalendrier.mois, local.seances);
    $('cal-mois-nom').textContent = grille.libelle;
    Rendu.rendreCalendrier($('cal-grille'), grille, lundiAffiche, function (lundi) {
      fermerVoile();
      afficherSemaine(lundi);
    });
  }

  // ── Voiles ───────────────────────────────────────────────────────────────
  //
  // Un voile ouvert pose une GARDE : le retour d'Android le ferme au lieu de
  // naviguer. C'est le point d'accroche prévu depuis le chantier 8, utilisé
  // pour la première fois ici.
  var voileOuvert = null;
  var apresVoile = null;
  // `apres` court à la FERMETURE, quel qu'en soit le chemin : la croix, le
  // fond, le retour d'Android, ou un bouton de la feuille. Une feuille qui
  // laisse l'écran derrière elle périmé est un écran faux affiché une seconde —
  // et la leçon du chantier 21 est qu'on mesure aussi les états transitoires.
  function ouvrirVoile(noeud, apres) {
    fermerVoile();
    voileOuvert = noeud;
    apresVoile = apres || null;
    noeud.hidden = false;
    gardeOverlay = function () { return { raison: 'voile', afficher: fermerVoile }; };
    ajouterGarde(gardeOverlay);
  }

  function fermerVoile() {
    // Pris AVANT de fermer, et remis à zéro tout de suite : `apres` peut
    // rouvrir une feuille, et il ne doit pas se rappeler lui-même.
    var apres = apresVoile;
    apresVoile = null;
    if (gardeOverlay) { retirerGarde(gardeOverlay); gardeOverlay = null; }
    if (voileOuvert) { voileOuvert.hidden = true; voileOuvert = null; }
    if (apres) apres();
  }

  // Navigation explicite : elle écrit l'URL, puis rend.
  //
  // `remplacer` sert au bouton « ← Séances » (voir son branchement) : il ne veut
  // pas EMPILER la liste par-dessus le détail qu'il quitte, il veut la METTRE
  // À SA PLACE. Le détail disparaît de l'historique au lieu de dormir dessous,
  // et aucun retour d'Android ne peut le rouvrir — ce que le chantier 40
  // reprochait à la navigation explicite tient donc à l'empilement, pas à
  // l'explicite.
  function afficherSemaine(lundi, remplacer) {
    var l = lundi || lundiAffiche || Semaine.bornesSemaine(new Date()).lundi;
    allerA(Semaine.memeSemaine(l, new Date()) ? Routeur.RACINE : Routeur.SEMAINE, { lundi: l }, remplacer === true);
    rendreSemaine(l);
  }

  function afficherDetail(sessionId) {
    allerA(Routeur.SEANCE, { id: sessionId });
    rendreDetail(sessionId);
  }

  function naviguer(n) {
    var l = Semaine.decalerSemaine(lundiAffiche, n).lundi;
    if (!vues.volume.hidden) { lundiAffiche = l; return rendreVolume(); }
    afficherSemaine(l);
  }

  function rendreDetail(sessionId) {
    montrer('detail', Routeur.SEANCE);
    var ligne = local.seances.filter(function (s) { return s.id === sessionId; })[0] || null;
    var series = seriesDe(sessionId);
    var blocs = Modele.construireBlocs(series, local.exercices);
    // ⚠️ LA MÊME RÈGLE QUE LA CARTE (chantier 47). Sans elle, cet écran offrait
    // « Modifier » sur une séance dont les séries n'étaient pas arrivées — et
    // l'enregistrement les effaçait en base. Une séance INCONNUE (`ligne` nulle)
    // n'est pas incomplète : elle n'existe pas, et aucun geste ne lui est offert
    // de toute façon.
    var incomplet = !!ligne && Seance.seriesIncompletes(series);
    // §2.8 — un tap sur le nom d'un exercice donne sa page. C'est la porte
    // d'entrée la plus naturelle, et elle était inerte depuis le chantier 27.
    Rendu.rendreDetail($('detail-seance'), ligne, blocs, {
      incomplet: incomplet,
      surExercice: function (slug) { afficherExercice(slug); },
      surSupprimer: ligne ? function () { demanderSuppressionSeance(ligne); } : null,
      surModifier: ligne ? function () { modifierSeance(ligne, blocs); } : null,
      surRefaire: ligne ? function () { refaireSeance(ligne, blocs); } : null,
      surEnFaireUneRoutine: ligne ? function () { enFaireUneRoutine(ligne); } : null,
      // 131 (écran 4) — « Ajouter le D+ » sous une série qui ne l'a pas.
      ajout: ajoutDuDetail(ligne, blocs)
    });
    rendreReactionsDeLaSeance(sessionId);
    // 91 — « Faite en groupe avec … » et le récap figé.
    rendreGroupeDuDetail(sessionId);
  }

  // ══ LA PAGE D'EXERCICE (§7 quater) ═══════════════════════════════════════
  //
  // ⚠️ ELLE NE CALCULE RIEN QUI EXISTE DÉJÀ (`CADRAGE-V2` §2 undecies). Cette
  // fonction n'est qu'un CÂBLAGE : elle rassemble les séries, appelle les
  // mêmes fonctions que la carte de séance et que la barre de semaine, et passe
  // le résultat au rendu.
  //
  //   dernière séance  → `Modele.meilleureSerieDe`, le chemin de la carte et
  //                      du sommaire de Progression ;
  //   record de charge → `Modele.recordDeLaTable`, la ligne la plus lourde de
  //                      la table par reps (PR 5) ;
  //   zone, cible      → la consigne de la séance (`consigneDeLExercice`) ;
  //   séries de travail→ `Semaine.compteSeriesTravail`, la règle unique du §1 ;
  //   historique       → `Modele.construireBlocs`, qui rend déjà le détail.
  var PAS_HISTORIQUE = 20;     // §7 quater.4 — 20 séances, puis « voir plus »
  // ⚠️ RIEN D'AUTRE QUE CE QUI SE LIT. Cet état ne retient QUE combien de
  // séances l'historique déplie, et pour quel exercice. L'onglet courant, lui,
  // vient de l'URL à chaque rendu : le garder ici en ferait une seconde source
  // — un champ écrit que personne ne lit, exactement le défaut C1 du chantier 39.
  var exoAffiche = null;       // { slug, combien }
  // 206 — la période de la courbe d'un exercice (3 mois, 6 mois, 1 an, tout) : un choix de lecture, jamais écrit.
  var periodeCourbe = Courbe ? Courbe.PERIODE_PAR_DEFAUT : '6m';

  // 58-1 — les séances d'un exercice (`faits.seancesDeLExercice`) : le module des faits.

  // « DERNIÈRE SÉANCE » d'un exercice : la meilleure série de sa séance la plus
  // récente, datée de cette séance ; `null` s'il n'a jamais été fait. La page
  // d'exercice l'affiche, et « Machine prise » (MOTEUR §9.19) l'écrit sous
  // chaque frère (« Dernière fois : 80 kg × 10, le 12 sept. ») — UNE fonction
  // pour les deux, sinon le frère dirait un autre chiffre que sa propre page,
  // à un tap. `groupes` est facultatif : la page les a déjà lus.
  function derniereSeanceDe(slug, groupes) {
    var g = groupes || faits.seancesDeLExercice(corpus(), slug);
    if (!g.length) return null;
    var d = Modele.meilleureSerieDe(slug, g[0].series, local.exercices, Palier, etatsExercices, meilleurNomme);
    d.date = g[0].seance.debut;
    return d;
  }

  function rendreExercice(slug, onglet) {
    montrer('exercice', Routeur.EXERCICE);
    // Le « voir plus » ne survit pas à un changement d'exercice : on repart des
    // 20 dernières, sinon une page ouverte sur 60 séances en afficherait 60
    // pour l'exercice suivant sans que personne ne l'ait demandé.
    if (!exoAffiche || exoAffiche.slug !== slug) {
      exoAffiche = { slug: slug, combien: PAS_HISTORIQUE };
    }

    var index = Modele.indexerExercices(local.exercices);
    var exo = index[slug] || null;
    var mesure = exo ? exo.mesure : null;
    var groupes = faits.seancesDeLExercice(corpus(), slug);
    var toutes = [].concat.apply([], groupes.map(function (g) { return g.series; }));
    // 125 (ECRAN-SAISIE §7 quater.5) — « COMMENT FAIRE » : la description de la base, mot pour mot, et les
    // libellés de la fiche, faits ICI (le rendu ne les fabrique pas, comme `descriptionExo`). Sans description,
    // pas d'onglet. L'onglet ouvert se lit sur l'adresse, les séances et la description (`Routeur.ongletExercice`).
    var comment = exo && exo.description && String(exo.description).trim() ? vueCommentFaire(exo) : null;
    var vueOnglet = Routeur.ongletExercice(onglet, groupes.length > 0, !!comment);

    // La date d'un record est celle de la SÉANCE, pas `validee_a` : les séries
    // importées ont `validee_a` à NULL (chantier 35, D3).
    var debutDe = {};
    groupes.forEach(function (g) {
      g.series.forEach(function (x) { debutDe[x.id] = g.seance.debut; });
    });
    var maintenant = new Date();
    var rp = recordDeLaPage(slug, exo, groupes, maintenant);
    var optionsRecords = rp.optionsRecords;
    var pourRecords = rp.pourRecords;
    // ECRAN §7 quater.3 (H3, #371) — LA TABLE PAR REPS SUIT CE PÉRIMÈTRE : une
    // page ne montre jamais deux périmètres pour un même record (un 150 kg de
    // février 2025 sous « Record sur 12 mois : 120 kg »). Les séances plus
    // anciennes restent dans l'historique.
    var dansLePerimetre = [];
    Modele.seancesDuPerimetre(pourRecords, maintenant, optionsRecords).forEach(function (h) {
      // 132 — une série notée par nom n'entre dans aucun record, ni dans la table par reps (MOTEUR §10 ter).
      h.series.forEach(function (x) { if (!(x && x.elastique)) dansLePerimetre.push(x); });
    });
    var table = Modele.tableParReps(dansLePerimetre, mesure, function (x) { return debutDe[x.id] || null; });
    // Un jour de record se DÉDUIT de la table, il ne se recalcule pas : ce sont
    // exactement les dates de ses lignes non déduites. On garde le plus grand
    // nombre de reps du jour — « record à 6 reps » dit de quoi il s'agit.
    var joursRecord = {};
    table.forEach(function (l) {
      if (l.deduit || !l.date) return;
      if (!joursRecord[l.date] || l.reps > joursRecord[l.date]) joursRecord[l.date] = l.reps;
    });

    // PR 5 de la consolidation (décision du 02/10/2026) — « DERNIÈRE SÉANCE »
    // EST LA MEILLEURE SÉRIE DU JOUR, sur toutes les mesures : le même chiffre
    // que Progression et que la carte de séance, à un tap de distance. Elle
    // affichait le palier sur `charge_reps` — deux nombres pour le même
    // exercice et la même date.
    var derniere = derniereSeanceDe(slug, groupes);

    // PR 5 (décision du 02/10/2026) — « RECORD DE CHARGE » EST LA LIGNE LA
    // PLUS LOURDE DE LA TABLE : un record est un fait, en vraies barres,
    // exploration comprise. Il écartait les explorations (140 × 1 quand on
    // travaille à 10), et pouvait s'afficher sous la ligne « 1 rep » de la
    // table, sur la même page. Les autres mesures gardent leur meilleure série.
    // §9.23 (55-1) — ET IL SE LIT SUR LA TABLE CUMULÉE, la source de tout
    // record (la médaille, le tableau des records, le bloc de Progression),
    // AVEC LE PÉRIMÈTRE DE LA MÉDAILLE : un matériel de salle (machines,
    // poulies, haltères, Smith) sur ses 12 derniers mois.
    var recordsExo = rp.recordsExo;
    var record = rp.record;

    // MOTEUR §9.23 (55-1), ECRAN §7 bis.15 — LES RECORDS EN TÊTE : la charge
    // la plus lourde, avec sa date (120, D1 : la force estimée — « ≈ », 3 à 10
    // reps — se dit À PART, hors des records : « d'après 140 kg × 5 ») ;
    // le tableau à 1, 3, 5, 8, 10 reps — aujourd'hui, il y a 6 mois, il y a
    // 1 an ; le rapport au poids (la charge de travail du coach, divisée par
    // une pesée de moins de 14 jours).
    var teteRecords = null;
    // 132 — pas de records en kg pour un exercice noté par nom (MOTEUR §10 ter) : son meilleur, par son nom, suffit.
    if (mesure === 'charge_reps' && groupes.length && !rp.nommes) {
      var il6 = new Date(maintenant.getTime()); il6.setMonth(il6.getMonth() - 6);
      var il12 = new Date(maintenant.getTime()); il12.setFullYear(il12.getFullYear() - 1);
      var travail = null;
      Moteur.chargesDeTravailDe(faits.seancesDeLExercice(corpus(), slug), etatsExercices[slug], optionsDeConsigne(slug, exo, instantDuCalcul()))
        .forEach(function (x) { if (!travail || String(x.date) > String(travail.date)) travail = x; });
      teteRecords = {
        douzeMois: recordsExo.douzeMois,
        lourde: record && record.charge !== null ? record : null,
        unRM: recordsExo.unRM,
        tableau: Modele.tableauDesRecords(pourRecords, [maintenant, il6, il12], optionsRecords),
        travail: travail && travail.palier > 0 && !optionsRecords.corps ? travail : null,
        rapport: travail && travail.palier > 0 && !optionsRecords.corps
          ? Poids.rapportAuPoids(travail.palier, local.pesees, maintenant) : null
      };
    }

    // 206 — LA COURBE EN TÊTE : les points sont un fait (`faits.pointsDeLExercice`), la géométrie est pure (`THCourbe`), la
    // période choisie ne vit que le temps de la page. Elle ne dit pas un autre chiffre que la fiche : même Epley que les records.
    var pts = faits.pointsDeLExercice(corpus(), slug);
    var courbe = null;
    if (pts.mesure && pts.points.length) {
      var per = Courbe.periodeDe(periodeCourbe);
      var fenetre = Courbe.dansLaPeriode(pts.points, per.cle, maintenant);
      courbe = {
        nom: exo ? exo.nom : slug,
        genre: pts.mesure,
        geo: Courbe.geometrie(fenetre, null, pts.mesure),
        resume: Courbe.resume(fenetre),
        periode: per.cle,
        periodeLongue: per.long,
        periodes: Courbe.PERIODES,
        surPeriode: function (cle) { periodeCourbe = cle; rendreExercice(slug, vueOnglet); }
      };
    }

    var visibles = groupes.slice(0, exoAffiche.combien);
    // 127 (ECRAN-SAISIE §7 quater.6) — « TON ÉCHELLE », en tête du Résumé d'un exercice d'échelle (`null` sinon).
    var echelle = vueEchelleDe(slug, maintenant);
    // 109 (MOTEUR §9.25) — « MON OBJECTIF » : la carte se LIT (`THObjectif.vue`), la date est celle posée.
    var carteObjectif = carteObjectifDe(slug, exo, groupes, maintenant, vueOnglet);
    // §7 quater — L'ÉTIQUETTE DE ZONE SUR LA PAGE D'EXERCICE. La zone
    // appartient à l'exercice : la montrer seulement en séance la ferait
    // passer pour un réglage de la séance du jour.
    //
    // ⚠️ LA DATE DE COUPURE EST CELLE DE LA SÉANCE OUVERTE quand il y en a
    // une, comme partout ailleurs (MOTEUR §9.12) : sinon la page d'exercice
    // lirait une séance que l'écran de saisie, lui, ne voit pas — deux zones
    // pour un même exercice à la même seconde.
    //
    // PR 5 — ET C'EST LA CONSIGNE DE LA SÉANCE (`consigneDeLExercice`) : la
    // page la recalculait avec cinq options de moins.
    var consigneExo = consigneDeLExercice(slug);
    // La ligne mise en avant dans la table : la VISÉE de l'en-tête — le plan
    // quand l'exercice est dans la séance (semaine allégée comprise), sinon la
    // consigne. Rien quand le coach se tait.
    var xPlan = seance && !enEdition() ? planDuSlug(slug) : null;
    var kVise = xPlan ? xPlan.consigne : (consigneExo ? consigneExo.consigne : null);
    var cibleReps = kVise ? ((kVise.ligne || kVise.haut || {}).vise || null) : null;
    Rendu.rendrePageExercice($('page-exercice'), {
      nom: exo ? exo.nom : slug,
      etiquette: consigneExo ? consigneExo.etiquette : null,
      zoneChoisie: !!zoneDe(slug),
      lignesDeRoutine: zonesDeRoutinesDe(slug),
      // §9.17 — en Entretenir par son propre choix, la page montre « Entretien »
      // et garde la porte vers le mode.
      modeEntretien: modeDe(slug) === 'entretien',
      // ⚠️ ET LA PAGE SE REDESSINE APRÈS LE CHOIX. Elle n'est pas rendue par
      // `rendreSeance` : sans ce rappel, l'étiquette et la consigne y
      // resteraient celles d'avant la correction — la ligne écrite, l'écran
      // muet. Trouvé au banc, pas en test. `ouvrirZone` s'occupe de la séance
      // ouverte s'il y en a une, et il peut n'y en avoir aucune : c'est
      // précisément d'ici qu'on ouvre le menu sans séance.
      surZone: consigneExo || modeDe(slug) === 'entretien' ? function () {
        ouvrirZone(slug, function () { rendreExercice(slug, vueOnglet); });
      } : null,
      mesure: mesure,
      onglet: vueOnglet,
      comment: comment,
      sousTitre: sousTitreExercice(groupes),
      surOnglet: function (o) { afficherExercice(slug, o); },
      // §7 quater.1 — la séance en cours reste visible, et « Reprendre » y
      // ramène : on consulte sans avoir l'impression d'avoir quitté.
      seanceEnCours: seance ? {
        titre: seance.titre || 'Séance',
        surReprendre: function () { afficherSaisie(); }
      } : null,
      derniere: derniere,
      record: record,
      // §9.23 (H1, #371) — le record d'un matériel de salle se dit « sur 12 mois ».
      recordSurDouzeMois: mesure === 'charge_reps' && recordsExo.douzeMois,
      teteRecords: teteRecords,
      objectif: carteObjectif,
      tonEchelle: echelle,
      // 175 (MOTEUR §10 bis) — « Pour continuer à monter » : les leviers du plafond, relus du plan (jamais recalculés ici).
      leviers: xPlan && xPlan.leviersGardes ? {
        liste: xPlan.leviersGardes.leviers,
        surLevier: (function () {
          var iL = seance ? (seance.exercices || []).findIndex(function (z) { return z && z.exercise_slug === slug; }) : -1;
          return iL >= 0 && xPlan.escalier && xPlan.escalier.carte && xPlan.escalier.carte.type === Moteur.MARCHE_LEVIERS
            ? function (cle) { afficherSaisie(); repondreLevier(iL, cle); } : null;
        })()
      } : null,
      surMarche: function (s) { afficherExercice(s); },
      volume: {
        nbSeries: Semaine.compteSeriesTravail(toutes, local.exercices),
        nbSeances: groupes.length
      },
      courbe: courbe,
      table: table,
      // H3 — la table d'un matériel de salle se lit sur 12 mois, et le dit.
      tableSurDouzeMois: recordsExo.douzeMois,
      cibleReps: cibleReps,
      historique: visibles.map(function (g) {
        return {
          id: g.seance.id,
          titre: g.seance.titre,
          debut: g.seance.debut,
          note: g.seance.note || '',
          // 115 (D8) — plus de « Repos moyen » : `repos_s` n'est pas un vrai repos (MODIFICATEURS §4).
          record: (g.seance.debut && joursRecord[g.seance.debut]) || 0,
          blocs: Modele.construireBlocs(g.series, local.exercices)
        };
      }),
      surSeance: function (id) { afficherDetail(id); },
      reste: Math.max(0, groupes.length - visibles.length),
      surVoirPlus: function () {
        exoAffiche.combien += PAS_HISTORIQUE;
        rendreExercice(slug, vueOnglet);
      }
    });
    // 89 — « Entre amis », en bas de la page, pour un exercice à la barre (mutuels, à poids de corps égal).
    entreAmis(slug, exo);
  }

  // LE RECORD QUE LA PAGE D'UN EXERCICE AFFICHE, une fonction pour deux lecteurs : la fiche (« Record de charge »,
  // « Record de reps »…) et « Ton échelle » (127), qui montre le même meilleur sur chaque marche faite.
  //   record de charge → `Modele.recordDeLaTable`, la ligne la plus lourde de la table cumulée (PR 5, §9.23), sur
  //                      le périmètre de la médaille (12 mois pour un matériel de salle) ;
  //   autres mesures   → la meilleure série de tout l'historique, datée de sa séance.
  function recordDeLaPage(slug, exo, groupes, maintenant) {
    var mesure = exo ? exo.mesure : null;
    // §9.23 (55-1) — LE PÉRIMÈTRE D'UN RECORD : celui de la médaille (12 mois pour un matériel de salle, toute la
    // vie ailleurs).
    var optionsRecords = Modele.optionsDeRecord(exo);
    // 193-4 (MOTEUR §9.32) — le max MESURÉ par une semaine de test prime sur l'estimation (90 jours) ; jamais une ligne du journal des records.
    var mesureDeTest = testDesCartes() && testDesCartes().mesures ? testDesCartes().mesures[slug] : null;
    if (mesureDeTest && mesureDeTest.valeur !== null && mesureDeTest.valeur !== undefined) {
      optionsRecords = Object.assign({}, optionsRecords, { mesures: [mesureDeTest] });
    }
    var pourRecords = groupes.map(function (g) { return { debut: g.seance.debut, series: g.series }; });
    var recordsExo = Modele.recordsDeLExercice(pourRecords, maintenant, optionsRecords);
    // 132 (MOTEUR §10 ter) — un exercice noté par nom : son meilleur se calcule à l'affichage, sur l'ordre de Ma salle
    // (« Rouge × 10 », `Profil.meilleurElastique`) — jamais un record en kg (un record est immuable, l'ordre change).
    var nommes = groupes.some(function (g) { return (g.series || []).some(function (x) { return x && x.elastique; }); });
    var record = nommes || mesure !== 'charge_reps'
      ? Modele.meilleureSerieDeTout(slug, groupes.map(function (g) {
        return { cle: g.seance.debut, series: g.series };
      }), local.exercices, Palier, etatsExercices, meilleurNomme)
      : Modele.recordDeLaTable(recordsExo.table);
    if (record && (nommes || mesure !== 'charge_reps')) record.date = record.cle || null;
    // Le libellé dit ce que c'est : un meilleur, pas un record (« Ton meilleur », comme « Ton échelle »).
    if (record && nommes) record.libelle = 'Ton meilleur';
    return { record: record, recordsExo: recordsExo, optionsRecords: optionsRecords, pourRecords: pourRecords, nommes: nommes };
  }

  // 127 (ECRAN-SAISIE §7 quater.6, maquette validée le 21/10/2026) — LA VUE DE « TON ÉCHELLE ». Un câblage, sans
  // calcul : l'échelle du catalogue et la marche suivante (`Modele.vueEchelle`, qui lit `Modele.marcheSuivante`), les
  // exercices faits et leur dernière date (`faits.datesDesExercices`), le meilleur de chacun tel que SA page l'affiche
  // (`recordDeLaPage`, `Modele.texteMeilleure`) et sa date (`Modele.quandDeLEchelle`), le haut de la zone en vigueur
  // de l'exercice de départ (sa consigne), et la phrase du coach (`Moteur.phraseDeLaSuivante`) — sans phrase en
  // « Juste un carnet » ou quand l'exercice de départ est en Entretenir. `null` pour un exercice sans échelle.
  function vueEchelleDe(slug, maintenant) {
    var index = catalogueIndexe();
    var E = Modele.echelleDe(index[slug]);
    if (E === null) return null;
    var dates = faits.datesDesExercices(corpus());
    var faites = {};
    Object.keys(index).forEach(function (s) {
      var x = index[s];
      if (Modele.echelleDe(x) !== E || !dates[s]) return;
      var r = recordDeLaPage(s, x, faits.seancesDeLExercice(corpus(), s), maintenant).record;
      faites[s] = { meilleur: Modele.texteMeilleure(r) || null,
                    quand: r && r.date ? Modele.quandDeLEchelle(r.date, maintenant) : null, derniere: dates[s] };
    });
    var zonesHaut = {};
    var actifs = {};
    Object.keys(faites).forEach(function (s) {
      var k = consigneDeLExercice(s);
      var z = k && k.consigne ? Moteur.zoneParCle(k.consigne.zone) : null;
      if (z) zonesHaut[s] = z.haut;
      actifs[s] = !Moteur.coachSeTait(profil && profil.intention, modeDe(s));
    });
    // La phrase se tait en carnet (le profil) ; en Entretenir (l'exercice de départ), `phraseDe` le sait.
    var phraseDe = function (e) { return actifs[e.depart] === false ? null : Moteur.phraseDeLaSuivante(Object.assign({}, e, { reglage: Profil.rythmeDe(profil) })); };
    return Modele.vueEchelle(index, slug, faites, zonesHaut, !Moteur.coachSeTait(profil && profil.intention), phraseDe,
      { lestRefuse: lestReponseDe() === 'non', objectif: objectifDeLEchelle() });
  }

  // 145 (ECRAN-SAISIE §7 quater.7, maquette `maquette-semaine-echelles-v1.html`, validée le 23/10/2026) — « TES ÉCHELLES
  // CETTE SEMAINE », en tête de Saisie. Un câblage, sans calcul : les faits de la semaine ÉCOULÉE (lundi → dimanche qui
  // précède celle d'aujourd'hui : `faits.echellesDeLaSemaine`), le meilleur de chaque semaine par le formateur unique
  // (`Modele.meilleureSerieDeTout` + `Modele.texteMeilleure`, comme la page d'exercice), « Ton échelle » (`Modele.vueEchelle`
  // : ta marche, la suivante) et sa phrase COURTE (`Moteur.phraseDeLaSuivante`, option `court`), les deux ronds
  // (`Moteur.rondsDeLaSuivante`, sur le fondement de la consigne : `deuxSeances`). `[]` sans exercice d'échelle travaillé
  // cette semaine-là (une barre seule n'en est pas un). En « Juste un carnet » : les marches et les séries, ni phrase ni
  // ronds (`Modele.vueEchellesDeLaSemaine`).
  function deuxSeancesDeLExercice(slug, exo, instant) {   // `instant` : celui de la consigne (ISO)
    var o = Object.assign(optionsDeConsigne(slug, exo, instantDuCalcul()), { edition: false, echelle: true }), g = groupesDuMoteur(slug, o.salle);
    var k = Moteur.consigneDExercice(g, etatDuMoteur(slug, o.salle, g), instant, o);
    var ds = k && k.consigne && k.consigne.fondement ? k.consigne.fondement.deuxSeances : null;
    return Array.isArray(ds) ? ds : null;
  }
  function vueCarteEchelles(maintenant) {
    var index = catalogueIndexe();
    var cette = Semaine.bornesSemaine(maintenant);
    var ecoulee = cette ? Semaine.decalerSemaine(cette.lundi, -1) : null;
    if (!ecoulee) return null;
    var semaine = faits.echellesDeLaSemaine(corpus(), ecoulee.lundi);
    if (!semaine.length) return null;
    var dates = faits.datesDesExercices(corpus());
    var meilleurTexte = function (slug, series) {
      if (!series || !series.length) return null;
      var parSeance = {}, ordre = [];
      series.forEach(function (x) {
        var k = x.session_id || '';
        if (!parSeance[k]) { parSeance[k] = { cle: k, series: [] }; ordre.push(k); }
        parSeance[k].series.push(x);
      });
      var r = Modele.meilleureSerieDeTout(slug, ordre.map(function (k) { return parSeance[k]; }), local.exercices, Palier,
        etatsExercices, meilleurNomme);
      return Modele.texteMeilleure(r) || null;
    };
    var faites = {}, zonesHaut = {}, actifs = {};
    semaine.forEach(function (it) {
      Object.keys(index).forEach(function (s) {
        if (Modele.echelleDe(index[s]) !== it.echelle || !dates[s]) return;
        faites[s] = { meilleur: null, quand: null, derniere: dates[s] };
        var k = consigneDeLExercice(s);
        var z = k && k.consigne ? Moteur.zoneParCle(k.consigne.zone) : null;
        if (z) zonesHaut[s] = z.haut;
        actifs[s] = !Moteur.coachSeTait(profil && profil.intention, modeDe(s));
      });
    });
    var items = semaine.map(function (it) {
      var exercices = {};
      Object.keys(it.exercices).forEach(function (s) {
        var e = it.exercices[s];
        // 149 — une FIGURE se lit en secondes : « 12 s, 10 s, 9 s, 8 s » (le formateur des durées), pas en reps.
        var enSecondes = Modele.estUneFigure(index, s);
        exercices[s] = { semaine: meilleurTexte(s, e.semaine), avant: meilleurTexte(s, e.avant),
                         reps: enSecondes
                           ? e.semaine.map(function (x) { return Modele.formatDuree(x.duree_s); }).filter(Boolean)
                           : e.semaine.map(function (x) { return x.reps; }).filter(function (r) { return r !== null && r !== undefined; }) };
      });
      var n = it.nouvelle;
      return { echelle: it.echelle, exercices: exercices,
               nouvelle: n ? { slug: n.slug, ancienne: { nom: (index[n.ancienne.slug] || {}).nom || n.ancienne.slug,
                                                         texte: meilleurTexte(n.ancienne.slug, n.ancienne.series) } } : null };
    });
    var cartes = Modele.vueEchellesDeLaSemaine(index, items, {
      lestRefuse: lestReponseDe() === 'non', objectif: objectifDeLEchelle(),
      faites: faites, zonesHaut: zonesHaut, coachActif: !Moteur.coachSeTait(profil && profil.intention),
      phraseDe: function (e) { return actifs[e.depart] === false ? null : Moteur.phraseDeLaSuivante(Object.assign({}, e, { court: true, reglage: Profil.rythmeDe(profil) })); },
      rondsDe: function (slug, e) {
        // 149 — une FIGURE : les tenues max des séances (un fait de `faits.js`) contre le seuil du catalogue.
        if (e.seuil) {
          var tn = faits.tenuesDeLExercice(corpus(), slug).map(function (t) { return { niveau: t.max, charge: 0 }; });
          return tn.length ? Moteur.rondsDeLaSuivante({ seuil: e.seuil, seances: tn, reglage: Profil.rythmeDe(profil) }) : null;
        }
        var ds = deuxSeancesDeLExercice(slug, index[slug], new Date(maintenant).toISOString());
        return ds ? Moteur.rondsDeLaSuivante({ haut: e.haut, aide: e.aide, seances: ds, reglage: Profil.rythmeDe(profil) }) : null;
      }
    });
    if (!cartes.length) return null;
    return { libelle: Modele.libelleDeLaSemaine(ecoulee.lundi, ecoulee.dimanche), echelles: cartes };
  }
  function rendreCarteEchelles() {
    var noeud = $('carte-echelles');
    if (!noeud) return;
    if (seance) { Rendu.rendreCarteEchelles(noeud, null); return; }
    var vue = vueCarteEchelles(new Date());
    if (vue) vue.surOuvrir = function (slug) { afficherExercice(slug); };
    Rendu.rendreCarteEchelles(noeud, vue);
  }

  // 125 — la vue de « Comment faire » : Matériel (`Profil.libelleEquipement`), Travaille (muscles primaires), Aussi
  // (secondaires), `Semaine.libelleMuscle`, séparés par « · ». Les stabilisateurs restent hors de l'écran (§7 quater.5).
  function vueCommentFaire(exo) {
    var muscles = function (l) {
      return (l || []).map(function (m) { return Semaine.libelleMuscle(m); }).filter(Boolean).join(' \u00b7 ');
    };
    return {
      description: String(exo.description),
      materiel: exo.equipement ? Profil.libelleEquipement(exo.equipement) : '',
      travaille: muscles(exo.muscles_primaires),
      aussi: muscles(exo.muscles_secondaires)
    };
  }

  // « 123 séances depuis janvier 2024 · dernière le 11 sept. » — trois faits
  // lus sur la liste déjà rangée, aucun jugement. Rien du tout quand il n'y a
  // rien : un exercice jamais fait n'a pas d'histoire à résumer.
  function sousTitreExercice(groupes) {
    if (!groupes.length) return '';
    var n = groupes.length;
    var depuis = new Date(groupes[n - 1].seance.debut);
    var derniere = new Date(groupes[0].seance.debut);
    var bouts = [n + ' séance' + (n > 1 ? 's' : '')];
    if (!isNaN(depuis.getTime())) {
      bouts[0] += ' depuis ' + Modele.moisAnnee(depuis);
    }
    if (!isNaN(derniere.getTime())) {
      bouts.push('dernière le ' + Modele.jourMois(derniere));
    }
    return bouts.join(' \u00b7 ');
  }

  function afficherExercice(slug, onglet) {
    var params = { slug: slug };
    // 125 — `comment` s'adresse comme `historique` (ECRAN-SAISIE §7 quater.5).
    if (onglet === Routeur.EXO_HISTORIQUE || onglet === Routeur.EXO_COMMENT) params.onglet = onglet;
    allerA(Routeur.EXERCICE, params);
    rendreExercice(slug, onglet);
  }

  // §7 octies — LE MÊME MENU, DEPUIS LA LISTE. Supprimer une séance demandait de
  // l'ouvrir : un détour pour un geste courant. Les trois gestes sont ceux du
  // détail, appelés tels quels — refus compris quand une séance est en cours.
  function ouvrirMenuSeance(id) {
    var ligne = local.seances.filter(function (s) { return s.id === id; })[0];
    if (!ligne) return;
    var blocs = Modele.construireBlocs(seriesDe(id), local.exercices);
    Rendu.rendreFeuilleSeance($('feuille-contenu'), {
      titre: ligne.titre,
      surRefaire: function () { fermerVoile(); refaireSeance(ligne, blocs); },
      surEnFaireUneRoutine: function () { enFaireUneRoutine(ligne); },
      surModifier: function () { fermerVoile(); modifierSeance(ligne, blocs); },
      surSupprimer: function () { fermerVoile(); demanderSuppressionSeance(ligne); }
    });
    ouvrirVoile($('feuille-seance'));
  }

  // ══ EN FAIRE UNE ROUTINE (ECRAN-SAISIE §7 quindecies.4, chantier 52) ══════
  //
  // Depuis n'importe quelle séance — importée de Hevy ou saisie dans l'app :
  // « Une nouvelle routine » (un aperçu, puis la création par le chemin de
  // l'éditeur) ou « Mettre à jour une routine » (le chemin de la question de
  // fin de séance, §6.3). La STRUCTURE seulement : jamais une charge.
  var enRoutine = null;   // { ligne, structure, nom, dossier, erreur }

  function structureDeLaSeance(ligne) {
    return Routines.routineDepuisSeance(seriesDe(ligne.id), {
      titre: ligne.titre, exercices: local.exercices, routines: routines, existants: nomsReserves()
    });
  }

  async function enFaireUneRoutine(ligne) {
    if (!ligne) return;
    // La même garde que « Modifier » : une séance dont les séries ne sont pas
    // toutes arrivées donnerait une routine amputée.
    if (seriesIncompletes(ligne.id)) {
      Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
        titre: 'Séance pas encore complète',
        aide: 'Ses séries finissent d\u2019arriver. Réessaie dans un instant.',
        libelle: 'Compris', surConfirmer: fermerVoile, surAnnuler: fermerVoile
      });
      ouvrirVoile($('feuille-seance'));
      return;
    }
    // Le nom libre et les repos lisent la bibliothèque : on la charge si elle
    // ne l'est pas encore (on vient des séances, pas de l'onglet Saisie).
    if (etatRoutines.code !== 'ok') await chargerRoutines();
    Rendu.rendreFeuilleEnFaireUneRoutine($('feuille-contenu'), {
      sujet: ligne.titre || 'Séance',
      surNouvelle: function () { ouvrirApercuRoutine(ligne); },
      surMettreAJour: routines.length ? function () { choisirRoutineAMettreAJour(ligne); } : null,
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  function ouvrirApercuRoutine(ligne) {
    var st = structureDeLaSeance(ligne);
    enRoutine = { ligne: ligne, structure: st, nom: st.nom, dossier: null, erreur: '' };
    rendreApercuEnRoutine();
  }

  function rendreApercuEnRoutine() {
    var index = catalogueIndexe();
    Rendu.rendreApercuRoutine($('feuille-contenu'), {
      nom: enRoutine.nom,
      dossier: enRoutine.dossier,
      erreur: enRoutine.erreur,
      lignes: enRoutine.structure.exercices.map(function (e) {
        return { nom: Modele.nommer(index, e.exercise_slug), series: e.series,
                 repos: e.repos_cible_s, origine: e.repos_origine };
      }),
      surNom: function (v) { enRoutine.nom = v; },
      surDossier: function () {
        var poser = function (d) { enRoutine.dossier = d; rendreApercuEnRoutine(); };
        var choisir = function (erreur) {
          Rendu.rendreFeuilleDossier($('feuille-contenu'), {
            sujet: Routines.nomPropre(enRoutine.nom) || 'Nouvelle routine',
            dossiers: Routines.dossiersDe(routines),
            actuel: enRoutine.dossier,
            erreur: erreur || '',
            surChoix: poser,
            surNouveau: function (texte) {
              var d = Routines.dossierPropre(texte);
              if (d === null) return choisir('Donne un nom au dossier.');
              if (!Routines.dossierValide(d)) return choisir('Le nom du dossier fait plus de ' + Routines.DOSSIER_MAX + ' caractères.');
              poser(d);
            },
            surAnnuler: rendreApercuEnRoutine
          });
        };
        choisir();
      },
      surCreer: creerRoutineDepuisSeance,
      surAnnuler: function () { enRoutine = null; fermerVoile(); }
    });
  }

  // ⚠️ LA CRÉATION EST CELLE DE L'ÉDITEUR (`Routines.enregistrer`) : le rang
  // suivant, l'annulation en cas d'échec. Le brouillon porte la structure au
  // vocabulaire de la saisie (`enSaisie`) — et aucune charge : la structure
  // n'en a pas. 60-3 — « En faire mes routines (N) » (la feuille « Tes séances
  // qui reviennent ») passe par ces deux mêmes fonctions : un seul chemin.
  function brouillonDeStructure(structure, nom, dossier, jours) {
    return {
      id: null, nom: nom, nomChange: true, dossier: dossier, existantes: [], jours: jours || null,
      exercices: Routines.renumeroter(structure.exercices.map(function (e) {
        return { id: null, exercise_slug: e.exercise_slug, series: e.series.map(Routines.enSaisie),
                 repos_cible_s: e.repos_cible_s, groupe_superset: e.groupe_superset, note: null, zone: e.zone || null };
      }))
    };
  }

  function creerRoutineNeuve(b, rang) {
    return Routines.enregistrer(b, Donnees, {
      userId: sessionActive && sessionActive.user && sessionActive.user.id,
      uuid: uuid,
      rangSuivant: rang
    });
  }

  async function creerRoutineDepuisSeance() {
    if (!enRoutine || enregistrementEnCours) return;
    var b = brouillonDeStructure(enRoutine.structure, enRoutine.nom, enRoutine.dossier);
    var verdict = Routines.valider(b, routines);
    if (!verdict.valide) { enRoutine.erreur = messageVerdict(verdict); return rendreApercuEnRoutine(); }
    enregistrementEnCours = true;
    try {
      var r = await creerRoutineNeuve(b, rangSuivantBibliotheque());
      if (!r.ok) { enRoutine.erreur = Routines.messageErreur(r); return rendreApercuEnRoutine(); }
      enRoutine = null;
      fermerVoile();
      await chargerRoutines();
      await ouvrirRoutine(r.routine.id);
    } finally {
      enregistrementEnCours = false;
    }
  }

  // ══ « TES SÉANCES QUI REVIENNENT » (ECRAN-SAISIE §7 quindecies.7, 60-3) ══════
  //
  // Deux entrées, UNE feuille : la ligne de la bibliothèque (pour tout le monde)
  // et « Garder ce que je fais » (l'écran 8 du questionnaire), après
  // « Commencer ». Les routines viennent de la règle (`faits.programmeDeduit`,
  // QUESTIONNAIRE §5). RIEN N'EST ÉCRIT avant « En faire mes routines (N) », qui
  // crée chaque routine cochée PAR LE CHEMIN DE « Créer la routine » (§7
  // quindecies.4 : la même structure, les mêmes repos et leur origine, des noms
  // rendus uniques, jamais de charge), dans un dossier « Mon programme »
  // (« Mon programme (2) » s'il existe déjà), dans l'ordre de la feuille. Pas de
  // second éditeur ici : tout se modifie ensuite, comme toute routine.
  //
  // ⚠️ LA CRÉATION D'UNE ROUTINE VIT EN LIGNE, comme « Créer la routine » : hors
  // ligne, le message de l'éditeur (« Pas de réseau : rien n'a été enregistré. »)
  // et la feuille reste ouverte. Une panne au milieu : les routines déjà créées
  // quittent la feuille, les autres restent cochées, et « En faire mes routines »
  // reprend dans le MÊME dossier.
  var DOSSIER_DU_PROGRAMME = 'Mon programme';
  var retrouver = null;   // { routines: [{ deduite, cochee, faite }], dossier, erreur, enCours }

  async function ouvrirSeancesQuiReviennent() {
    // Les noms uniques, les repos et le rang lisent la bibliothèque : on la
    // charge si elle ne l'est pas encore.
    if (etatRoutines.code !== 'ok') await chargerRoutines();
    retrouver = {
      routines: faits.programmeDeduit(corpus()).map(function (d) {
        return { deduite: d, cochee: d.cochee, faite: false };
      }),
      dossier: null, erreur: '', enCours: false
    };
    rendreFeuilleRetrouver();
    var ouverte = retrouver;
    ouvrirVoile($('feuille-seance'), function () { if (retrouver === ouverte) retrouver = null; });
  }

  // Ce qu'une carte dit : « 12 fois · dernière fois mardi », les exercices avec
  // séries × reps, et pour une ancienne « Pas faite depuis le 9 mai. ».
  function carteDeduite(x, index, aujourdhui) {
    var d = x.deduite;
    var j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.derniere || '');
    var jour = j ? new Date(Number(j[1]), Number(j[2]) - 1, Number(j[3]), 12) : null;
    return {
      nom: d.nom || 'Routine',
      ligne: d.fois + ' fois' + (jour ? ' \u00b7 dernière fois ' + Modele.quand(jour, aujourdhui) : ''),
      exercices: d.exercices.map(function (e) {
        var nom = Modele.nommer(index, e.exercise_slug);
        return e.reps === null
          ? nom + ' ' + e.series + (e.series > 1 ? ' séries' : ' série')
          : nom + ' ' + e.series + '\u00a0\u00d7\u00a0' + e.reps;
      }).join(' \u00b7 '),
      // « le 26 juil. » porte déjà son point : la phrase n'en ajoute pas un second.
      ancienne: !d.cochee && jour ? ('Pas faite depuis ' + Modele.quand(jour)).replace(/\.?$/, '.') : null,
      cochee: x.cochee
    };
  }

  function rendreFeuilleRetrouver() {
    var f = retrouver;
    if (!f) return;
    var index = catalogueIndexe(), aujourdhui = new Date();
    var restantes = f.routines.filter(function (x) { return !x.faite; });
    Rendu.rendreFeuilleSeancesQuiReviennent($('feuille-contenu'), {
      routines: restantes.map(function (x) { return carteDeduite(x, index, aujourdhui); }),
      erreur: f.erreur,
      enCours: f.enCours,
      surCocher: function (i) {
        var x = restantes[i];
        if (!x || f.enCours) return;
        x.cochee = !x.cochee;
        f.erreur = '';
        rendreFeuilleRetrouver();
      },
      surCreer: creerRoutinesDeduites,
      surPasMaintenant: fermerVoile,
      surNouvelle: function () { fermerVoile(); ouvrirRoutine(null); }
    });
  }

  // ⚠️ LE CHEMIN COMMUN DE « CRÉER N ROUTINES DANS UN DOSSIER » (60-3, 60-4). « En faire mes routines (N) » (la
  // feuille « Tes séances qui reviennent ») et « Créer ces N routines » (l'aperçu du programme construit) passent
  // ICI : une structure (`routineDeduite`) → un brouillon (`brouillonDeStructure`) → la création de l'éditeur
  // (`creerRoutineNeuve`), dans l'ordre, des noms rendus uniques, jamais de charge. `f` est l'état de la feuille
  // (`dossier`, `erreur`, `enCours`, `orphelines`) ; `choisies` : `[{ deduite, faite, surFaite? }]` — `surFaite` court
  // dès qu'UNE routine est écrite ; `redessiner` montre « Création… ». Rend le nombre de routines créées.
  //
  // ⚠️ L'ÉTAT RESTE « EN COURS » JUSQU'À LA FIN DU RECHARGEMENT (revue adverse de 60-4) : tant que la bibliothèque n'est
  // pas relue, l'écran montrerait un bouton « Créer » actif sur des routines déjà écrites.
  // ⚠️ UNE ROUTINE ORPHELINE (créée, mais ses exercices ou ses séries ne sont pas partis, et l'annulation non plus : le
  // réseau était mort) est DÉFAITE avant toute reprise, puis la bibliothèque est relue — sinon la reprise bute sur son
  // propre nom (« doublon ») sans fin.
  // 99 (MOTEUR §9.24, v2_084) — `avecJours` : le programme construit écrit les jours prévus de chaque routine, lus
  // sur le préfixe de son nom (« Lundi — Haut A » → lundi), la règle même de la migration (`Deraille.jourDuNom`).
  async function creerDansUnDossier(f, choisies, nomDuDossier, redessiner, avecJours) {
    f.enCours = true;
    f.erreur = '';
    enregistrementEnCours = true;
    redessiner();
    var creees = 0, echec = false;
    try {
      var orphelines = f.orphelines || [];
      f.orphelines = [];
      for (var k = 0; k < orphelines.length; k++) {
        try { await Donnees.supprimerRoutine(orphelines[k]); } catch (e) { f.orphelines.push(orphelines[k]); }
      }
      if (orphelines.length || etatRoutines.code !== 'ok') await chargerRoutines();
      // Hors ligne dès le départ : ni noms, ni repos, ni rang ne se calculent sur une bibliothèque vide. Rien n'est
      // écrit, et le dossier n'est pas encore figé.
      if (etatRoutines.code !== 'ok') { f.erreur = Routines.MESSAGES.reseau; return 0; }
      // Le dossier, une fois : une reprise après une panne reste dans le même.
      if (!f.dossier) f.dossier = Routines.nomLibre(nomDuDossier, Routines.dossiersDe(routines));
      var rang = rangSuivantBibliotheque(), noms = nomsReserves(), dejaLa = routines.slice();
      for (var i = 0; i < choisies.length; i++) {
        var x = choisies[i];
        var st = Routines.routineDeduite(x.deduite, { exercices: local.exercices, routines: routines, existants: noms });
        var b = brouillonDeStructure(st, st.nom, f.dossier, avecJours ? Deraille.jourDuNom(st.nom) : null);
        var verdict = Routines.valider(b, dejaLa);
        if (!verdict.valide) { f.erreur = messageVerdict(verdict); echec = true; break; }
        var r = await creerRoutineNeuve(b, rang);
        if (!r.ok) {
          echec = true;
          if (r.orpheline) {
            // L'écriture a coupé en route : la routine existe en base, incomplète. On la défera à la reprise ; le
            // message ne ment pas (« rouvre la routine » n'a pas de sens depuis ici).
            f.orphelines.push(r.orpheline);
            f.erreur = Routines.MESSAGES[r.erreur] || Routines.MESSAGES.inconnue;
          } else f.erreur = Routines.messageErreur(r);
          break;
        }
        x.faite = true;
        if (typeof x.surFaite === 'function') x.surFaite();
        creees++;
        rang++;
        noms.push(st.nom);
        dejaLa.push({ nom: st.nom, archivee_a: null });
      }
      if (creees || echec) await chargerRoutines();
    } finally {
      enregistrementEnCours = false;
      f.enCours = false;
    }
    return creees;
  }

  // « En faire mes routines (N) ». ⚠️ DEUX TAPS N'ÉCRIVENT PAS DEUX FOIS : la
  // garde des créations de routine (`enregistrementEnCours`), plus `enCours` qui
  // éteint le bouton pendant l'écriture.
  async function creerRoutinesDeduites() {
    var f = retrouver;
    if (!f || f.enCours || enregistrementEnCours) return;
    var choisies = f.routines.filter(function (x) { return x.cochee && !x.faite; });
    if (!choisies.length) return;
    var creees = await creerDansUnDossier(f, choisies, DOSSIER_DU_PROGRAMME, rendreFeuilleRetrouver);
    // La feuille a pu être fermée pendant l'écriture (« Fermer ») : on ne
    // ramène alors personne nulle part, on rafraîchit Saisie si on y est.
    var ouverte = retrouver === f;
    if (!ouverte) { if (!vues.saisie.hidden && !seance) rendreSaisie(); return; }
    if (f.erreur) {
      // Une création partielle : la bibliothèque derrière la feuille montre déjà ce qui est créé.
      if (creees && !vues.saisie.hidden && !seance) rendreSaisie();
      return rendreFeuilleRetrouver();
    }
    fermerVoile();
    await ouvrirBibliothequeSur(f.dossier);
  }

  // « La bibliothèque s'ouvre ensuite sur ce dossier » : déplié (le repli est une
  // commodité de l'appareil), et amené en vue.
  async function ouvrirBibliothequeSur(dossier) {
    if (dossiersReplies[dossier]) { delete dossiersReplies[dossier]; memoriserDossiersReplies(); }
    await afficherSaisie();
    if (vues.saisie.hidden) return;
    var lignes = $('liste-routines').querySelectorAll('.dossier-ligne');
    for (var i = 0; i < lignes.length; i++) {
      if (lignes[i].getAttribute('data-dossier') === dossier) {
        if (lignes[i].scrollIntoView) lignes[i].scrollIntoView({ block: 'start' });
        return;
      }
    }
  }

  // ══ LE PROGRAMME CONSTRUIT (QUESTIONNAIRE-COACH-V2 §5 bis, 60-4) ══════════════
  //
  // « Construis-le-moi » : le coach propose un point de départ, la personne le regarde et refuse ce qu'elle ne
  // veut pas, puis « Créer ces N routines ». Ce câblage NE DÉCIDE RIEN : `Generateur` choisit les exercices, leur
  // ordre, les séries et les reps (jamais une charge, une chauffe, un repos, une durée) ; les repos viennent du
  // chemin de « Créer la routine » (`routineDeduite`), la durée de `Moteur.dureeEstimee` sur la MÊME structure,
  // et le raccourci de `Moteur.raccourcirRoutine` seulement si `Moteur.cibleDuProgramme` y trouve une durée à tenir
  // (MOTEUR §9.18, G8). RIEN n'est écrit avant « Créer », sauf les exercices écartés (au geste, par le profil).
  //
  // ⚠️ SEULE LA PLACE TOUCHÉE CHANGE (§7 quindecies.9) : « Je n'en veux pas » et « Remplacer » ne regénèrent pas le
  // programme, ils changent une ligne de l'état `construit.routines` — et l'aperçu est recalculé de cet état.
  //
  // 66D (QUESTIONNAIRE-COACH-V2 §5 quater.5) — AVEC UN HISTORIQUE (`aUnHistorique`), le programme part des séances de la
  // personne (le programme déduit complété, rangé, habillé, en supersets si le temps manque, puis raccourci) :
  // `historique` garde de quoi le RECALCULER — ses faits, les refus de l'aperçu (« Retirer » / « Remettre ») et ses
  // retouches (« Je n'en veux pas », « Remplacer ») — et `assemblerLeProgramme` est la seule fonction qui calcule.
  // Sans historique : le gabarit, comme en 60-4.
  var construit = null;   // { entree, routines, faites, dossier, erreur, enCours, annonce, neuf, versCatalogue,
                          //   historique, changements, ajouts, reprises }

  // L'entrée du générateur : le profil et ce que les séances ont fait, rien d'autre.
  function entreeDuProgramme() {
    var p = profil || {};
    return {
      jours: Generateur.bornerJours(p.seances_par_semaine),
      objectif: Profil.objectifDe(p),
      phase: Profil.phaseDe(p),
      materiel: p.materiel,
      barre_traction: Profil.barreTractionDe(p),   // 190 — Ma salle : `true`, `false`, ou `null` (inconnue)
      plus65: Profil.plus65DuProfil(p, new Date()),   // 197 : `true` / `false` / `null` (pas de date de naissance : rien de deviné)
      anciennete: p.anciennete,               // 60-6 : « moins d'un an » = débutant (le profil en cache, rien de lu en plus)
      priorites: Profil.prioritesDe(p),
      menager: Profil.zonesAMenagerValides(p.zones_a_menager) || [],
      ecartes: Profil.ecartesValides(p.exercices_ecartes) || [],
      faits: faits.historiqueDesExercices(corpus()),
      depart_calisthenie: p.depart_calisthenie || null,   // 195 : les quatre chiffres du questionnaire
      // 199 (MOTEUR §9.37) — les jours de cardio réguliers (lundi = 0), lus dans les séances : rien n'est demandé.
      cardioJours: cardioReguliers().jours,
      cardioSemaines: cardioReguliers().semaines
    };
  }
  function cardioReguliers() { return faits.joursDeCardioReguliers(corpus(), new Date()); }

  // 66D (G1, §5 quater.5) — LA PERSONNE A UN HISTORIQUE quand elle a des habitudes (`faits.habitudes`), au moins une
  // séance au programme déduit, et au moins un muscle qui a son fait du coach (MOTEUR §14.6) lu jusqu'à la semaine de
  // sa DERNIÈRE séance comprise. `Semaine.semainesDeVolume` ne lit que les semaines dont le lundi PRÉCÈDE celui
  // d'`avant` (une borne exclusive) : `avant` est donc le lundi de la semaine qui suit sa dernière séance. Rend les
  // faits qui assemblent le programme (`{ deduit, volume, habitudes, fois }`), ou `null` : le gabarit.
  function aUnHistorique() {
    var c = corpus();
    var habitudes = faits.habitudes(c);
    if (!habitudes) return null;
    var deduit = faits.programmeDeduit(c);
    if (!deduit.length) return null;
    var avant = Semaine.decalerSemaine(Semaine.bornesSemaine(faits.derniereSeance(c)).lundi, 1).lundi;
    var volume = volumeDuCoach(avant.toISOString());
    if (!Object.keys(volume).some(function (m) { return !!volume[m]; })) return null;
    return { deduit: deduit, volume: volume, habitudes: habitudes, fois: faits.historiqueDesExercices(c) };
  }

  // La durée visée du programme (MOTEUR §9.18, G8) : `null`, rien à tenir.
  function cibleDuProgrammeConstruit() {
    return Moteur.cibleDuProgramme(profil && profil.temps_reponse, profil && profil.duree_seance_min,
      profil && profil.intention);
  }

  // La structure d'une séance du programme TELLE QU'ELLE SERA CRÉÉE (les repos de `routineDeduite`, les chauffes, le
  // superset) : la même chaîne pour les supersets (`associer`) et pour le raccourci.
  function structureDuProgramme(rt) {
    var st = Routines.routineDeduite(deduiteDuProgramme(rt), { exercices: local.exercices, routines: routines,
                                                               existants: nomsReserves() });
    return Moteur.structureDeRoutine(brouillonDeStructure(st, st.nom, null).exercices, catalogueIndexe());
  }

  // 66D — L'ASSEMBLAGE (§5 quater.5), la seule fonction qui calcule le programme d'un historique : `completer` (le
  // nombre de séances de l'écran 8b quand il est valide — la personne décide ; ses séances cochées ne sont jamais
  // retirées) → `ranger` → chaque ligne habillée en place → les retouches de la personne réappliquées (retrouvées par
  // séance et exercice ; une retouche qui ne trouve plus sa ligne ne s'applique pas) → `associer` → le raccourci → les
  // voisins fondus. Les journaux du complément et des supersets donnent « Ce que j'ai changé ». Rien n'est écrit.
  function assemblerLeProgramme() {
    var c = construit, h = c && c.historique;
    if (!h) return;
    var index = catalogueIndexe();
    var habitudes = Object.assign({}, h.habitudes);
    if (Questionnaire.joursValides(profil && profil.seances_par_semaine)) habitudes.seances_par_semaine = profil.seances_par_semaine;
    var compl = Generateur.completer({ deduit: h.deduit, volume: h.volume, habitudes: habitudes, fois: h.fois,
      catalogue: index, profil: { phase: c.entree.phase }, priorites: c.entree.priorites, refus: h.refus,
      ecartes: c.entree.ecartes });
    var habillees = Generateur.ranger({ routines: compl.routines, journal: compl.journal, catalogue: index })
      .map(function (rt) {
        return { nom: rt.nom, exercices: rt.exercices.map(function (l) { return Generateur.habiller(index, l, c.entree); }) };
      });
    h.retouches.forEach(function (t) {
      var rt = habillees.filter(function (x) { return x.nom === t.routine; })[0];
      var k = rt ? rt.exercices.map(function (x) { return x.exercise_slug; }).indexOf(t.de) : -1;
      if (k < 0) return;
      // Les séries restent celles de la place (comme `neVeuxPas` et `remplacePar`).
      if (t.ligne === null) rt.exercices.splice(k, 1);
      else rt.exercices[k] = Object.assign({}, t.ligne, { series: rt.exercices[k].series });
    });
    // Fondues AVANT `associer` : une ligne, une entrée de structure (deux voisins identiques feraient un seul bloc).
    habillees = fondreLesVoisins(habillees);
    var assoc = Generateur.associer({ routines: habillees, structures: habillees.map(structureDuProgramme),
      cible_min: cibleDuProgrammeConstruit(), catalogue: index, refus_paires: h.refusPaires });
    var faitesNoms = c.routines.filter(function (rt, i) { return c.faites[i]; }).map(function (rt) { return rt.nom; });
    c.routines = fondreLesVoisins(raccourcirLeProgramme(assoc.routines)).filter(function (rt) { return rt.exercices.length; });
    c.faites = c.routines.map(function (rt) { return faitesNoms.indexOf(rt.nom) >= 0; });
    c.changements = Generateur.changementsDeLApercu(compl.journal, assoc.journal,
      { muscles: h.refus.muscles, reprises: h.refus.reprises, tirage: h.refus.tirage, paires: h.refusPaires },
      function (slug) { return Modele.nommer(index, slug); }, c.routines);   // 66D bis : les nombres de la carte
    c.ajouts = {};
    c.reprises = {};
    compl.journal.forEach(function (j) {
      if (j.type === 'exercice') c.ajouts[j.routine + '\u0000' + j.exercise_slug] = true;
      if (j.type === 'reprise') c.reprises[j.routine] = true;
    });
  }

  // « Retirer » / « Remettre » une ligne de « Ce que j'ai changé » : sa clé entre dans les refus, ou en sort, puis tout
  // se recalcule. Retirer ne remplace rien, et rien n'est écrit au profil (ce n'est pas « Je n'en veux pas »).
  // Clés (`changementsDeLApercu`) : `muscle:<muscle>`, `tirage`, `reprise:<séance>`, `paire:<séance>:<a>:<b>` — une
  // séance peut contenir « : », ses deux exercices non.
  function basculerChangement(cle) {
    var c = construit, h = c && c.historique;
    if (!h || c.enCours || typeof cle !== 'string') return;
    var basculer = function (liste, x) { var k = liste.indexOf(x); if (k >= 0) liste.splice(k, 1); else liste.push(x); };
    var i = cle.indexOf(':'), type = i < 0 ? cle : cle.slice(0, i), reste = i < 0 ? '' : cle.slice(i + 1);
    if (type === 'muscle') basculer(h.refus.muscles, reste);
    else if (type === 'reprise') basculer(h.refus.reprises, reste);
    else if (type === 'tirage') h.refus.tirage = !h.refus.tirage;
    else if (type === 'paire') {
      var parts = reste.split(':'), b = parts.pop(), a = parts.pop(), seance = parts.join(':');
      var deja = -1;
      h.refusPaires.forEach(function (p, k) { if (p[0] === seance && p[1] === a && p[2] === b) deja = k; });
      if (deja >= 0) h.refusPaires.splice(deja, 1); else h.refusPaires.push([seance, a, b]);
    } else return;
    c.neuf = {};
    c.annonce = null;
    c.erreur = '';
    assemblerLeProgramme();
    rendreApercuDuProgramme();
  }

  // Une retouche garde la ligne choisie, sans ce que l'assemblage recalcule (le raccourci, le superset).
  function ligneDeRetouche(l) {
    var x = Object.assign({}, l);
    delete x.raccourcie;
    delete x.groupe_superset;
    return x;
  }

  // La séance du programme, au vocabulaire de `routineDeduite`. 66D (§5 quater.5) : ses chauffes (celles de la
  // personne, avec un historique ; le gabarit n'en a aucune) et son superset (`groupe_superset`, posé par `associer`)
  // vont jusqu'à la routine écrite.
  // 187 (A5) — la charge de départ d'une barre, donnée par une série récente au questionnaire (sinon `null`).
  var chargesDeDepartDuQuestionnaire = [];
  function departRecentDe(slug) {
    var x = chargesDeDepartDuQuestionnaire.filter(function (y) { return y.slug === slug; })[0];
    return x ? x.depart : null;
  }
  function deduiteDuProgramme(rt) {
    return { nom: rt.nom, exercices: rt.exercices.map(function (l) {
      var depart = departRecentDe(l.exercise_slug);
      var x = { exercise_slug: l.exercise_slug, series: l.series, reps: l.reps, chauffes: l.chauffes || 0,
                groupe_superset: l.groupe_superset === undefined ? null : l.groupe_superset };
      // 193-2 — une grosse série et ses reculs (193-1), la zone du jour (193-3) : portées jusqu'à la routine créée.
      if (l.reculs > 0) { x.reculs = l.reculs; x.reps_recul = l.reps_recul; }
      if (l.zone) x.zone = l.zone;
      if (l.au_max === true) x.au_max = true;       // 193-6 : la dernière série « Au max »
      if (l.duree_s > 0) x.duree_s = l.duree_s;     // 195 : une figure se tient en secondes (`duree_cible_s`), jamais en reps
      // 188-2 — un repos d'isolation raccourci par la compression (étape 2) se porte jusqu'à la routine créée.
      if (l.repos_raccourci_s > 0) x.repos_raccourci_s = l.repos_raccourci_s;
      if (depart !== null) x.charge_cible_kg = depart;
      return x;
    }) };
  }

  // Deux lignes voisines du même exercice n'en feraient qu'un bloc à l'écriture (`memeBloc`) : on les fond ICI,
  // pour que l'aperçu montre ce qui sera écrit.
  function fondreLesVoisins(routinesDuProgramme) {
    return routinesDuProgramme.map(function (rt) {
      var sortie = [];
      rt.exercices.forEach(function (l) {
        var avant = sortie[sortie.length - 1];
        // Seulement dans le même superset (ou hors de tout superset) : `memeBloc` ne les joindrait pas sinon.
        // 193-2 — jamais deux lignes qui portent des reculs ou des zones : ce sont deux places (la même barre, deux zones).
        if (avant && avant.exercise_slug === l.exercise_slug && !avant.reculs && !l.reculs && !avant.zone && !l.zone &&
            (avant.groupe_superset || null) === (l.groupe_superset || null)) avant.series += l.series;
        else sortie.push(Object.assign({}, l));
      });
      return Object.assign({ nom: rt.nom, exercices: sortie }, rt.hybride ? { hybride: rt.hybride } : {});
    });
  }

  // « C'est mon maximum », « Moins en ce moment », « Ça varie » + une durée déclarée : chaque séance passe par
  // `raccourcirRoutine`, qui coupe les dernières séries (jamais un muscle). Une seule fois, à l'ouverture : les
  // séries restent ensuite celles de la place, que la personne change ou non l'exercice.
  //
  // R4/R6 (60-5) : les exercices dont la place charge une zone à ménager sont EXEMPTÉS (`exemptsDuRaccourci`) — leurs
  // séries ne sont jamais coupées, le temps se prend sur les autres ; s'il ne reste qu'eux, la cible n'est pas tenue
  // et l'aperçu montre la durée réelle (`lectureDuProgramme` la lit sur la structure écrite, jamais sur la cible).
  //
  // 66D : une ligne garde son `groupe_superset` ; une paire dont le raccourci retire un membre redevient une série
  // classique (§5 quater.5).
  function raccourcirLeProgramme(routinesDuProgramme) {
    var cible = cibleDuProgrammeConstruit();
    if (cible === null) return routinesDuProgramme;
    return routinesDuProgramme.map(function (rt) {
      // 188-2 — jamais une priorité (la personne l'a choisie) ni une zone à ménager : exemptées.
      var exemptes = Generateur.exemptsDuRaccourci(rt).concat(Generateur.exemptsDesPriorites(
        rt.exercices.map(function (l) { return l.exercise_slug; }), Profil.prioritesDe(profil), catalogueIndexe()));
      var r = Moteur.raccourcirRoutine(structureDuProgramme(rt), cible, exemptes);
      var lignes = [];
      rt.exercices.forEach(function (l, j) {
        var tr = r.exercices[j] ? r.exercices[j].tr : l.series;
        // `raccourcie` : cet exercice a perdu des séries pour tenir la durée (l'aperçu ne promet plus « toutes leurs séries »).
        var nl = Object.assign({}, l, { series: tr }, tr < l.series ? { raccourcie: true } : {});
        // 193-2 — les reculs que le raccourci a retirés (étape 3 bis) : le nombre qui reste est celui de la ligne.
        if (l.reculs > 0 && r.exercices[j] && r.exercices[j].rec < l.reculs) {
          nl.raccourcie = true;
          if (r.exercices[j].rec > 0) nl.reculs = r.exercices[j].rec; else { delete nl.reculs; delete nl.reps_recul; }
        }
        // 188-2 — les deux premiers pas de la compression : un superset de plus, un repos d'isolation raccourci.
        r.journal.forEach(function (t) {
          if (t.quoi === 'superset' && (t.i === j || t.j === j)) nl.groupe_superset = t.groupe;
          if (t.quoi === 'repos' && t.i === j) nl.repos_raccourci_s = t.apres;
        });
        if (tr > 0) lignes.push(nl);
      });
      var membres = {};
      lignes.forEach(function (l) {
        if (l.groupe_superset !== null && l.groupe_superset !== undefined) membres[l.groupe_superset] = (membres[l.groupe_superset] || 0) + 1;
      });
      lignes = lignes.map(function (l) {
        var g = l.groupe_superset;
        return g !== null && g !== undefined && membres[g] < 2 ? Object.assign({}, l, { groupe_superset: null }) : l;
      });
      return Object.assign({ nom: rt.nom, exercices: lignes }, rt.hybride ? { hybride: rt.hybride } : {});
    });
  }

  // Ce que l'aperçu dit de chaque séance qui reste à créer : le nom qui sera ÉCRIT (rendu unique), la durée de la
  // structure qui sera écrite (les repos de la création, `routineDeduite`), la ligne « pourquoi ».
  function lectureDuProgramme(c) {
    var index = catalogueIndexe(), noms = nomsReserves();
    return c.routines.map(function (rt, i) {
      if (c.faites[i]) return null;
      var st = Routines.routineDeduite(deduiteDuProgramme(rt), { exercices: local.exercices, routines: routines, existants: noms });
      noms.push(st.nom);
      var S = Moteur.structureDeRoutine(brouillonDeStructure(st, st.nom, null).exercices, index);
      return { nom: st.nom, duree: Moteur.texteDureeCourte(Moteur.dureeEstimee(S)), pourquoi: Generateur.pourquoi(index, rt) };
    });
  }

  // 193-2 — « 1 × 4 · 2 reculs × 8 » : la grosse série, puis ses reculs (la même forme que la routine écrite, `resumeStructure`).
  function seriesFois(l) {
    return l.series + '\u00a0\u00d7\u00a0' + (l.reps === null && l.duree_s > 0 ? l.duree_s + '\u00a0s' : l.reps) + (l.reculs > 0 ? ' \u00b7 ' + l.reculs + (l.reculs > 1 ? ' reculs' : ' recul') + (l.reps_recul > 0 ? ' \u00d7 ' + l.reps_recul : '') : '');
  }

  function rendreApercuDuProgramme() {
    var c = construit;
    if (!c) return;
    var index = catalogueIndexe();
    var nommer = function (slug) { return Modele.nommer(index, slug); };
    var lecture = lectureDuProgramme(c);
    var restantes = [];
    c.routines.forEach(function (rt, i) { if (!c.faites[i]) restantes.push(i); });
    var phrases = Generateur.phrasesDeLApercu(restantes.map(function (i) { return c.routines[i]; }), c.entree, nommer,
      c.routines.length);
    // 66D (maquette v2) : avec un historique, la voix dit d'où viennent les séances (la fenêtre du programme déduit,
    // `Routines.DEDUIT`) ; sans, le titre dit que c'est un point de départ.
    var h = c.historique;
    var voix = (h ? ['Ce sont tes séances des ' + (Routines.DEDUIT.jours / 7) + ' dernières semaines.'] : [])
      .concat(['Je te propose tes charges à chaque séance. Touche un exercice pour le changer.']).concat(phrases.famille || [])
      .concat(phrases.zones);
    if (phrases.barreFixe) voix.push(phrases.barreFixe);
    // 195 — sans barre de traction, le coach le dit (calisthénie) : « Pour progresser en tirage, il te faut une barre ou des anneaux. »
    Generateur.avertissementsCalisthenie(c.entree).forEach(function (t) { voix.push(t); });
    (phrases.hybride || []).forEach(function (t) { voix.push(t); });
    if (c.annonce) voix.push(c.annonce);
    var changements = h ? (c.changements || []) : [];
    Rendu.rendreApercuProgramme($('feuille-contenu'), {
      titre: h ? phrases.titre : 'Ton programme de départ : ' + phrases.titre,
      voix: voix,
      changements: changements.length ? {
        titre: 'Ce que j\u2019ai changé \u00b7 ' + changements.filter(function (x) { return !x.retire; }).length,
        lignes: changements.map(function (x) { return { texte: x.texte, retire: x.retire, libelle: x.retire ? 'Remettre' : 'Retirer' }; })
      } : null,
      surChangement: function (n) { if (changements[n]) basculerChangement(changements[n].cle); },
      routines: restantes.map(function (i) {
        var rt = c.routines[i];
        return { nom: lecture[i].nom, duree: lecture[i].duree, pourquoi: lecture[i].pourquoi,
          reprise: !!(h && c.reprises[rt.nom]),
          exercices: rt.exercices.map(function (l, k) {
            return { nom: nommer(l.exercise_slug), series: seriesFois(l), mentions: Generateur.mentionsDeLigne(l, c.entree),
                     neuf: !!c.neuf[i + ':' + l.exercise_slug] || !!(h && c.ajouts[rt.nom + '\u0000' + l.exercise_slug]),
                     paire: l.groupe_superset === undefined ? null : l.groupe_superset };
          }) };
      }),
      erreur: c.erreur,
      enCours: c.enCours,
      libelleCreer: restantes.length === 1 ? 'Créer cette routine' : 'Créer ces ' + restantes.length + ' routines',
      surExercice: function (iAffichee, k) { if (!c.enCours) ouvrirExerciceDuProgramme(restantes[iAffichee], k); },
      surCreer: creerLeProgramme,
      surPasMaintenant: fermerVoile
    });
  }

  // Ouvre l'aperçu sur un programme construit : de l'état de la personne, jamais d'un second calcul. Rien en base.
  //
  // 66D (G1) : avec un historique (`aUnHistorique`), le programme déduit complété (`assemblerLeProgramme`) ; sans, le
  // gabarit. « Refaire mon programme » passe par ici : le même choix.
  async function ouvrirApercuProgramme() {
    if (etatRoutines.code !== 'ok') await chargerRoutines();
    var entree = entreeDuProgramme();
    // 195 — la calisthénie a son propre gabarit : l'historique de barre ne l'assemble pas.
    var historique = local.exercices.length && entree.objectif !== 'calisthenie' ? aUnHistorique() : null;
    var rts = [];
    construit = null;
    if (historique) {
      construit = { entree: entree, routines: [], faites: [], dossier: null, erreur: '', enCours: false, annonce: null,
                    neuf: {}, versCatalogue: false, changements: [], ajouts: {}, reprises: {},
                    historique: Object.assign(historique, { refus: { muscles: [], reprises: [], tirage: false },
                                                            refusPaires: [], retouches: [] }) };
      assemblerLeProgramme();
      rts = construit.routines;
    } else if (local.exercices.length) {
      rts = fondreLesVoisins(raccourcirLeProgramme(fondreLesVoisins(Generateur.generer(catalogueIndexe(), entree))))
        .filter(function (rt) { return rt.exercices.length; });
    }
    if (!rts.length) {
      construit = null;
      // Le catalogue n'est pas arrivé (la place ne trouve rien) : on ne montre pas un programme vide.
      Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
        titre: 'Le catalogue arrive',
        aide: 'Il est enregistré sur l\u2019appareil à la première synchronisation. Réessaie dans un instant.',
        libelle: 'Compris', surConfirmer: fermerVoile, surAnnuler: fermerVoile
      });
      ouvrirVoile($('feuille-seance'));
      return;
    }
    if (!construit) {
      construit = { entree: entree, routines: rts, faites: [], dossier: null, erreur: '', enCours: false,
                    annonce: null, neuf: {}, versCatalogue: false, historique: null, changements: [], ajouts: {}, reprises: {} };
    }
    rendreApercuDuProgramme();
    var ouvert = construit;
    ouvrirVoile($('feuille-seance'), function () {
      if (construit === ouvert && !ouvert.versCatalogue) construit = null;
    });
  }

  // Toucher un exercice : « Je n'en veux pas » (l'écarter et le remplacer, une phrase le dit), « Remplacer » (le
  // choix de l'éditeur), « Annuler ».
  function ouvrirExerciceDuProgramme(i, k) {
    var c = construit, rt = c && c.routines[i], l = rt && rt.exercices[k];
    if (!l) return;
    var index = catalogueIndexe();
    Rendu.rendreFeuilleChoix($('feuille-contenu'), {
      titre: Modele.nommer(index, l.exercise_slug),
      aide: lectureDuProgramme(c)[i].nom + ' \u00b7 ' + seriesFois(l),
      options: [
        { cle: 'refuser', libelle: 'Je n\u2019en veux pas',
          sous: 'Je le remplace par un exercice du même mouvement, et je ne te le proposerai plus.' },
        { cle: 'remplacer', libelle: 'Remplacer', sous: 'Tu choisis dans le catalogue. La ligne de la séance se met à jour.' }
      ],
      valeur: null,
      surChoix: function (cle) {
        if (cle === 'refuser') return ecarterDansLeProgramme(i, k);
        remplacerDansLeProgramme(i, k);
      },
      surEffacer: null,
      surAnnuler: rendreApercuDuProgramme
    });
  }

  // « Je n'en veux pas » : SEULE la place touchée change (`Generateur.neVeuxPas`), et l'exercice rejoint
  // `exercices_ecartes` AU GESTE, par le chemin du profil (local d'abord, envoyé dès que possible).
  function ecarterDansLeProgramme(i, k) {
    var c = construit, rt = c && c.routines[i], vieux = rt && rt.exercices[k];
    if (!vieux) return;
    var index = catalogueIndexe();
    // Les écartés VIVANTS du profil d'abord (un autre appareil a pu en ajouter depuis l'ouverture de l'aperçu) :
    // l'écriture ne les efface jamais, et le remplaçant ne les reprend pas.
    Profil.ecartesDe(profil).forEach(function (sl) { if (c.entree.ecartes.indexOf(sl) < 0) c.entree.ecartes.push(sl); });
    var res = Generateur.neVeuxPas(index, c.routines, c.entree, i, k);
    var retiree = res.routines[i].exercices.length < rt.exercices.length;
    c.entree.ecartes = res.ecartes;
    var champs = Profil.preparerChamps(profil, { exercices_ecartes: res.ecartes }, new Date());
    if (Object.keys(champs).length) poserProfil(champs).catch(function () {});
    var ancien = Modele.nommer(index, vieux.exercise_slug);
    // Le remplaçant RÉEL, lu avant la fusion des voisins (un remplaçant déjà dans la séance y absorbe ses séries).
    var neuve = !retiree && res.routines[i].exercices[k];
    // 193-2 — les places liées changent avec elle : chacune de leurs séances marque le remplaçant.
    var seancesLiees = Generateur.lieesDe(c.routines, i, k).map(function (p) { return p[0]; });
    var marque = function (j) {
      var o = {};
      if (neuve && j >= 0) o[j + ':' + neuve.exercise_slug] = true;
      if (neuve && !c.historique) seancesLiees.forEach(function (r) { o[r + ':' + neuve.exercise_slug] = true; });
      return o;
    };
    if (c.historique) {
      // 66D — avec un historique, le geste devient une RETOUCHE, réappliquée à chaque assemblage (un « Retirer »
      // recalcule tout : elle y survit), et l'exercice rejoint les écartés que le complément n'ajoute jamais.
      c.historique.retouches.push({ routine: rt.nom, de: vieux.exercise_slug, ligne: neuve ? ligneDeRetouche(neuve) : null });
      assemblerLeProgramme();
      c.neuf = marque(c.routines.map(function (x) { return x.nom; }).indexOf(rt.nom));
    } else {
      c.routines = fondreLesVoisins(res.routines);
      c.neuf = marque(i);
      // Une séance vidée par les refus n'a plus rien à écrire : elle sort du programme (et de `faites`, qui la suit).
      // 193-2 — les places liées s'en vont avec elle : toute séance vidée sort, de la dernière à la première.
      for (var v = c.routines.length - 1; v >= 0; v--) {
        if (!c.routines[v].exercices.length) { c.routines.splice(v, 1); c.faites.splice(v, 1); c.neuf = {}; }
      }
    }
    if (!c.routines.length) { fermerVoile(); return; }
    c.annonce = neuve
      ? ancien + ' est remplacé par ' + Modele.nommer(index, neuve.exercise_slug) + '. Je ne te le proposerai plus.'
      : ancien + ' sort de ton programme. Je ne te le proposerai plus.';
    c.erreur = '';
    rendreApercuDuProgramme();
  }

  // « Remplacer » : la feuille de l'éditeur (les frères, puis le catalogue) ; le choix prend la place, rien ne s'écarte.
  function remplacerDansLeProgramme(i, k) {
    var c = construit, rt = c && c.routines[i], l = rt && rt.exercices[k];
    if (!l) return;
    var index = catalogueIndexe();
    var presents = rt.exercices.map(function (x) { return x.exercise_slug; });
    var freres = freresDe(l.exercise_slug, presents);
    var choix = function (f) {
      return { nom: Modele.nommer(index, f.slug), fait: f.fait, ecarte: f.ecarte,
               surChoisir: function () { poserDansLeProgramme(i, k, f.slug); } };
    };
    Rendu.rendreFeuilleMachinePrise($('feuille-contenu'), {
      titre: 'Remplacer',
      nom: Modele.nommer(index, l.exercise_slug),
      tard: null,
      freres: freres.map(choix),
      cousins: cousinsDe(l.exercise_slug, presents).map(choix),
      chercher: 'Chercher dans le catalogue',
      surCatalogue: function () { versLeCatalogueDuProgramme(i, k); },
      surAnnuler: rendreApercuDuProgramme
    });
  }

  function poserDansLeProgramme(i, k, slug) {
    var c = construit;
    if (!c || !c.routines[i] || !c.routines[i].exercices[k] || !slug) return;
    // Un exercice déjà dans CETTE séance ne la prend pas deux fois (les voisins identiques n'en feraient qu'un bloc, et
    // les séries s'additionneraient en silence) : le coach le dit, rien ne change.
    // 193-2 — les places liées (la même barre, deux zones) se remplacent ensemble : l'exercice ne doit être dans aucune de leurs séances.
    var places = Generateur.lieesDe(c.routines, i, k);
    var dejaLa = places.some(function (cc) {
      return c.routines[cc[0]].exercices.some(function (x, jj) {
        var estUnePlace = places.some(function (d) { return d[0] === cc[0] && d[1] === jj; });
        return !estUnePlace && x.exercise_slug === slug;
      });
    });
    if (dejaLa) {
      c.neuf = {};
      c.annonce = Modele.nommer(catalogueIndexe(), slug) + ' est déjà dans cette séance.';
      return rendreApercuDuProgramme();
    }
    var remplacees = Generateur.remplacePar(catalogueIndexe(), c.routines, c.entree, i, k, slug);
    var o = {}, j = i;
    if (c.historique) {
      // 66D — une retouche, comme « Je n'en veux pas » : réappliquée à chaque assemblage.
      var nomRt = c.routines[i].nom;
      c.historique.retouches.push({ routine: nomRt, de: c.routines[i].exercices[k].exercise_slug,
                                    ligne: ligneDeRetouche(remplacees[i].exercices[k]) });
      assemblerLeProgramme();
      j = c.routines.map(function (x) { return x.nom; }).indexOf(nomRt);
    } else c.routines = fondreLesVoisins(remplacees);
    if (j >= 0) o[j + ':' + slug] = true;
    if (!c.historique) places.forEach(function (cc) { o[cc[0] + ':' + slug] = true; });       // 193-2 : les places liées aussi
    c.neuf = o;
    c.annonce = null;
    c.erreur = '';
    rendreApercuDuProgramme();
  }

  // Le catalogue est un autre voile : l'aperçu y reste en mémoire (`versCatalogue`) et se rouvre à sa fermeture,
  // qu'un exercice ait été choisi ou non.
  function versLeCatalogueDuProgramme(i, k) {
    var c = construit;
    if (!c) return;
    c.versCatalogue = true;
    ouvrirCatalogue(null, null, {
      i: i, k: k,
      retour: function () {
        if (construit !== c) return;
        c.versCatalogue = false;
        rendreApercuDuProgramme();
        ouvrirVoile($('feuille-seance'), function () {
          if (construit === c && !c.versCatalogue) construit = null;
        });
      }
    });
  }

  // « Créer ces N routines » : le chemin de la feuille de 8a. ⚠️ DEUX TAPS N'ÉCRIVENT PAS DEUX FOIS, une panne au
  // milieu garde le MÊME dossier et ne recrée pas ce qui l'est déjà (`faites`, posé routine par routine). Le nom RÉEL
  // du dossier et la date s'écrivent au profil dès la PREMIÈRE routine créée (la carte « Passer en cycles » les lit) :
  // un programme à moitié écrit, abandonné, garde sa trace. Puis la bibliothèque s'ouvre sur le dossier.
  async function creerLeProgramme() {
    var c = construit;
    if (!c || c.enCours || enregistrementEnCours) return;
    var choisies = [];
    c.routines.forEach(function (rt, i) {
      if (c.faites[i]) return;
      choisies.push({ deduite: deduiteDuProgramme(rt), faite: false, i: i, surFaite: function () {
        c.faites[i] = true;
        if (c.profilEcrit) return;
        c.profilEcrit = true;
        var champs = Profil.preparerChamps(profil, { programme_construit_dossier: c.dossier, programme_construit_le: new Date() },
          new Date());
        if (Object.keys(champs).length) poserProfil(champs).catch(function () {});
      } });
    });
    if (!choisies.length) return;
    var creees = await creerDansUnDossier(c, choisies, DOSSIER_DU_PROGRAMME, rendreApercuDuProgramme, true);
    var ouverte = construit === c;
    if (!ouverte) { if (!vues.saisie.hidden && !seance) rendreSaisie(); return; }
    if (c.erreur) {
      if (creees && !vues.saisie.hidden && !seance) rendreSaisie();
      return rendreApercuDuProgramme();
    }
    await creerLaPhaseDuProgramme(c);
    fermerVoile();
    await ouvrirBibliothequeSur(c.dossier);
  }

  // 193-2 — LA PHASE du programme construit : Force et Les deux, par les familles, hors débutant (qui n'a ni zone ni reculs), sans
  // historique (193-2b). Un bloc de 5 semaines, la dernière allégée, nommant les barres lourdes (les lignes à zone Lourd) ; ni ligne
  // de zone (`sansZones`) ni pari : le coach n'a rien changé aux zones, elles sont celles des routines. Après la DERNIÈRE routine écrite
  // (jamais pendant une panne : `c.erreur` vide) ; une reprise ne recrée pas un bloc qui existe. Une panne du bloc ne défait pas les
  // routines : la phase manque, rien d'autre.
  async function creerLaPhaseDuProgramme(c) {
    if (!c || c.historique || (c.entree && c.entree.famille === false)) return;
    if (Moteur.coachSeTait(profil && profil.intention)) return;
    if (!c.routines.every(function (rt, i) { return c.faites[i]; })) return;
    if (!Generateur.familleApplicable(catalogueIndexe(), c.entree) || Profil.estDebutant(c.entree)) return;
    if (Moteur.blocEnCours(local.blocs, c.dossier)) return;
    var vus = {}, barres = [];
    c.routines.forEach(function (rt) {
      rt.exercices.forEach(function (l) {
        if (l.zone === 'lourd' && !vus[l.exercise_slug]) { vus[l.exercise_slug] = true; barres.push(l.exercise_slug); }
      });
    });
    if (!barres.length) return;
    try {
      await creerBloc({ dossier: c.dossier, zone: 'lourd', semaines: Moteur.SEMAINES_PHASE, decharge: true, debut: jourDuJour(),
                        exercices: barres, sansZones: true });
    } catch (e) { /* la phase manque ; les routines sont écrites */ }
  }

  function choisirRoutineAMettreAJour(ligne) {
    Rendu.rendreFeuilleChoixRoutine($('feuille-contenu'), {
      sujet: ligne.titre || 'Séance',
      routines: Routines.visibles(routines).map(function (r) { return { id: r.id, nom: r.nom }; }),
      surChoix: function (id) { apercuMiseAJour(ligne, id); },
      surAnnuler: fermerVoile
    });
  }

  // ⚠️ LE CHEMIN DE §6.3, PAS UN SECOND (§7 quindecies.4). La séance est
  // rattachée à la routine choisie (`Routines.seanceSurRoutine`), puis
  // comparée par `Seance.ecartsRoutine` — la fonction de la question de fin de
  // séance —, et l'écriture part par `reporterSurRoutine`, la même file.
  // `series: true` : la personne a choisi cette séance comme modèle, et voit
  // les séries qui changent avant d'écrire.
  function apercuMiseAJour(ligne, id) {
    var routine = routines.filter(function (r) { return r.id === id; })[0];
    if (!routine) { fermerVoile(); return; }
    var index = catalogueIndexe();
    var st = structureDeLaSeance(ligne);
    var verdict = Seance.ecartsRoutine(Routines.seanceSurRoutine(st, routine), routine, { series: true });
    var touchees = {};
    var ecarts = verdict.ecarts.map(function (e) {
      if (e.type === 'series') touchees[e.i] = true;
      var x = Object.assign({}, e, { nom: e.exercise_slug ? Modele.nommer(index, e.exercise_slug) : '' });
      if (e.type === 'ajoute') {
        var v = verdict.voulues[e.i], source = st.exercices[e.i];
        x.series = v.series; x.repos = v.repos_cible_s; x.origine = source ? source.repos_origine : null;
      }
      return x;
    });
    var inchanges = verdict.voulues.filter(function (v, i) { return v.id && !touchees[i]; })
      .map(function (v) { return Modele.nommer(index, v.exercise_slug); });
    Rendu.rendreFeuilleMajRoutine($('feuille-contenu'), {
      nom: routine.nom,
      ecarts: ecarts,
      inchanges: inchanges,
      surMettreAJour: async function () {
        await reporterSurRoutine(verdict, routine);
        Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
          titre: 'Routine mise à jour',
          sujet: routine.nom,
          aide: 'Les changements partent avec la file d\u2019envoi, comme après une séance.',
          libelle: 'Compris', surConfirmer: fermerVoile, surAnnuler: fermerVoile
        });
      },
      surAnnuler: fermerVoile
    });
  }

  // ══ LES GESTES SUR UNE SÉANCE TERMINÉE (§7 octies) ═══════════════════════
  //
  // Aucun n'existait : deux séances ont dû être supprimées directement en base
  // le 13/09 parce que l'app ne savait pas le faire.
  //
  // ⚠️ MODIFIER ET REFAIRE OUVRENT LA SAISIE, qui ne tient qu'UNE séance à la
  // fois. Écraser un brouillon en cours perdrait une séance réellement
  // commencée : on refuse, et on le dit.
  function seanceEnCoursBloque() {
    if (!seance) return false;
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Une séance est en cours',
      aide: 'Termine-la ou abandonne-la d’abord : l’écran de saisie n’en tient qu’une.',
      libelle: 'Aller à la séance en cours',
      surConfirmer: function () { fermerVoile(); rendreSaisie(); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
    return true;
  }

  // §7 octies.1 — rien de silencieux. Les séries partent avec la séance : la
  // cascade `sets_session_id_fkey ON DELETE CASCADE` s'en charge en base, et on
  // fait le même ménage en local pour que l'écran suive tout de suite.
  function demanderSuppressionSeance(ligne) {
    // Des LIGNES, chauffes comprises : c'est ce qui part vraiment (C1).
    var toutes = seriesDe(ligne.id);
    var n = toutes.length;
    var nW = toutes.filter(function (x) { return x && x.type_serie === 'echauffement'; }).length;
    Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
      titre: 'Supprimer cette séance ?',
      sujet: ligne.titre || 'Séance',
      danger: true,
      libelle: 'Supprimer',
      aide: Rendu.phraseEffacement(n, nW) + ' avec elle. Rien ne la remet en place.',
      surConfirmer: async function () { fermerVoile(); await supprimerSeance(ligne.id); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'));
  }

  async function supprimerSeance(id) {
    // L'ordre compte, comme à l'abandon : on retire d'abord l'intention
    // d'écrire ses séries, sinon la vidange écrirait les séries d'une séance
    // supprimée — et les recréerait par la clé étrangère.
    // 117 (audit du 16/10, 06 #2) — et tout ce qui dépend d'elle (paris, observations, journal) : comme à l'abandon.
    attente = Attente.retirerSeance(attente, id, (local.series || [])
      .filter(function (s) { return s && s.session_id === id; }).map(function (s) { return s.id; }));
    // ⚠️ ON RETIRE, ON NE FAIT PAS TABLE RASE (chantier 36).
    // `Cache.remplacerTout` VIDE le magasin puis le réécrit — `cache.js` le
    // réserve explicitement aux magasins petits et rafraîchis en entier, et dit
    // que « les 28 103 séries ne passent pas par ici ». Supprimer UNE séance
    // réécrivait donc les 28 103 lignes, et une fermeture d'app au mauvais
    // moment laissait le magasin à moitié plein, définitivement.
    var partantes = (local.series || [])
      .filter(function (s) { return s && s.session_id === id; })
      .map(function (s) { return s.id; });
    local.seances = local.seances.filter(function (s) { return s.id !== id; });
    local.series = local.series.filter(function (s) { return s.session_id !== id; });
    rangerSeances();
    // ⚠️ ET L'INDEX AUSSI. `local.parSeance` est construit une fois et n'était
    // pas refait ici : il gardait les séries d'une séance supprimée, donc
    // `seriesDe(id)` continuait de les rendre. Même famille que le reste.
    indexerParSeance();
    recalculerEtats();
    await Cache.remplacerTout('seances', local.seances).catch(function () {});
    if (partantes.length) await Cache.supprimer('series', partantes).catch(function () {});
    // 58-2 — ses records partent avec elle (la cascade, en base) : la copie
    // locale, et l'entrée du journal qui attendait encore.
    var recordsPartants = (local.records || []).filter(function (l) { return l && l.session_id === id; });
    local.records = (local.records || []).filter(function (l) { return l && l.session_id !== id; });
    if (recordsPartants.length) {
      await Cache.supprimer('records', recordsPartants.map(function (l) { return [l.set_id, l.type]; }))
        .catch(function () {});
    }
    attente = Attente.retirer(attente, Attente.cleDe(Attente.RECORDS, id));
    await poser({ table: Attente.SESSIONS, op: Attente.SUPPRIMER, id: id });
    afficherSemaine(lundiAffiche);
  }

  // §7 octies.2 — rouvrir pour corriger. Voir `THSeance.reprendre` : la séance
  // RESTE `terminee` pendant l'édition.
  // ⚠️ LA FENÊTRE DU CACHE PÉRIMÉ (chantier 34).
  //
  // `VERSION_SYNC` force une passe complète après la mise à jour, mais l'app
  // s'ouvre AVANT que cette passe soit finie : entre les deux, le cache porte
  // encore des lignes écrites par la version d'avant — sans `source`. Or c'est
  // `source` qui dit à `Seance.partEnBase` qu'une série importée doit rester
  // en base. Sans lui, elle est réputée absente, et « Enregistrer » l'efface :
  // le défaut qu'on vient de corriger, rejoué depuis le disque.
  //
  // On refuse donc de rouvrir une séance dont les séries ne portent pas encore
  // leur provenance. Aucune requête réseau ici — le geste doit rester possible
  // hors ligne dès que le cache est complet, et une lecture qui échoue ne doit
  // pas décider à la place de l'utilisateur.
  //
  // ⚠️ ET PAS DAVANTAGE UNE SÉANCE DONT AUCUNE SÉRIE N'EST ARRIVÉE (chantier 47).
  // `provenanceIncomplete` parle de la provenance de séries qui EXISTENT : elle
  // rend faux sur une liste vide, et c'est juste pour ce qu'elle dit. La
  // question posée ici est plus large, et c'est `Seance.seriesIncompletes` qui
  // la porte désormais — la même que la carte et que le détail consultent.
  // Cette garde reste : c'est la dernière avant l'écriture, et une troisième
  // surface qui oublierait de demander ne doit pas pouvoir effacer.
  function seriesIncompletes(id) { return Seance.seriesIncompletes(seriesDe(id)); }

  // ══ 131 (ECRAN-SAISIE §3 ter.5, maquette mesures-cardio écrans 4 et 5) — « CE QUI MANQUE À TES SÉANCES » ══
  //
  // La carte lit le fait (`faits.ceQuiManque`, moins les refus du profil) ; elle ne s'affiche qu'à l'accueil de Saisie,
  // hors séance ouverte (en cours ou en Édition : `rendreSaisie` rend la séance avant), en carnet comme en coach.
  //   · ce qui est tapé reste EN MÉMOIRE (`manque.saisies`) jusqu'à « Enregistrer » ;
  //   · « Enregistrer » corrige chaque séance touchée par `enregistrerCorrection` — la séance reprise depuis le cache
  //     (`Seance.reprendre`), la valeur posée par `Seance.modifierSerie` (ses bornes), la même file. La séance ouverte
  //     (`seance`) n'est jamais touchée, rien ne navigue ;
  //   · « Je ne sais plus » ferme un groupe pour de bon : `completer_refus` au profil, par `poserProfil` ;
  //   · « Plus tard » replie la carte jusqu'à la prochaine ouverture de l'app (en mémoire seulement).
  var manque = { saisies: {}, ouverts: {}, plusTard: false, message: null, enCours: false };
  var LIGNES_MANQUE = 2;

  function refusDuProfil() {
    var r = profil && profil.completer_refus;
    return Array.isArray(r) ? r : [];
  }

  function vueCarteManque() {
    if (seance || manque.plusTard) return null;
    var groupes = faits.ceQuiManque(corpus(), refusDuProfil());
    if (!groupes.length) return null;
    return {
      phrase: 'L’app note maintenant le D+, les étages et la distance au vélo. Complète ce dont tu te souviens.',
      message: manque.message,
      groupes: groupes.map(function (g) {
        var c = Modele.champDeMesure(g.champ);
        var visibles = manque.ouverts[g.cle] ? g.lignes : g.lignes.slice(0, LIGNES_MANQUE);
        return {
          cle: g.cle, champ: g.champ,
          titre: [Modele.nomCourt(g.nom).toUpperCase(), c.libelle || c.entete,
            g.seances + ' SÉANCE' + (g.seances > 1 ? 'S' : '')].join(' · '),
          autres: g.lignes.length - visibles.length,
          lignes: visibles.map(function (l) {
            var tape = manque.saisies[l.serieId];
            return { serieId: l.serieId, seanceId: l.seanceId, unite: c.unite, max: Modele.maxDeSaisie(g.champ),
              texte: Modele.dateCourte(l.debut) + ' · ' + Modele.formatMesure(l.serie),
              valeur: tape ? Modele.lireNombre(tape.valeur) : null };
          })
        };
      }),
      surSaisie: function (serieId, seanceId, champ, v) {
        manque.saisies[serieId] = { seanceId: seanceId, champ: champ, valeur: v };
      },
      surVoir: function (cle) { manque.ouverts[cle] = true; rendreCarteManque(); },
      surRefus: refuserManque,
      surEnregistrer: enregistrerManque,
      surPlusTard: function () { manque.plusTard = true; rendreCarteManque(); }
    };
  }

  function rendreCarteManque() {
    Rendu.rendreCarteManque($('carte-manque'), vueCarteManque());
  }

  // « Je ne sais plus » : le groupe quitte la carte pour de bon (`completer_refus`, « slug:colonne »). Ses saisies
  // en attente partent avec lui.
  async function refuserManque(cle) {
    var liste = refusDuProfil().slice();
    if (liste.indexOf(cle) < 0) liste.push(cle);
    var slug = cle.split(':')[0];
    Object.keys(manque.saisies).forEach(function (id) {
      var x = (local.series || []).filter(function (s) { return s && s.id === id; })[0];
      if (x && x.exercise_slug === slug) delete manque.saisies[id];
    });
    await poserProfil({ completer_refus: liste });
    rendreCarteManque();
  }

  // « Enregistrer » : une correction par séance touchée, par le chemin de l'Édition (`enregistrerCorrection`).
  async function enregistrerManque() {
    if (seance || manque.enCours) return;
    var parSeance = {};
    Object.keys(manque.saisies).forEach(function (id) {
      var t = manque.saisies[id];
      if (!t || Modele.lireNombre(t.valeur) === null) return;
      (parSeance[t.seanceId] = parSeance[t.seanceId] || []).push({ id: id, champ: t.champ, valeur: t.valeur });
    });
    var ids = Object.keys(parSeance);
    if (!ids.length) { manque.message = null; return rendreCarteManque(); }
    manque.enCours = true;
    var nonFaites = 0;
    try {
      for (var k = 0; k < ids.length; k++) {
        var sid = ids[k];
        var ligne = local.seances.filter(function (s) { return s.id === sid; })[0] || null;
        var series = seriesDe(sid);
        // La garde de l'Édition (chantier 47) : une séance dont les séries n'ont pas fini d'arriver ne se corrige pas.
        if (!ligne || Seance.seriesIncompletes(series)) { nonFaites++; continue; }
        connaitre(sid, series.map(function (x) { return x.id; }));
        var s = Seance.reprendre(ligne, Modele.construireBlocs(series, local.exercices));
        parSeance[sid].forEach(function (t) {
          s.exercices.forEach(function (e, iExo) {
            (e.series || []).forEach(function (x, iSerie) {
              if (x && x.id === t.id) {
                var o = {};
                o[t.champ] = t.valeur;
                s = Seance.modifierSerie(s, iExo, iSerie, o);
              }
            });
          });
          delete manque.saisies[t.id];
        });
        await enregistrerCorrection(s);
        await oublierConnues(sid);
      }
    } finally {
      manque.enCours = false;
    }
    manque.message = nonFaites ? 'Une séance finit d’arriver : réessaie dans un instant.' : null;
    rendreCarteManque();
  }

  // Écran 4 — « Ajouter le D+ » sous une série passée qui n'a pas son champ en plus : la séance s'ouvre en correction
  // (`modifierSeance`, le « Modifier » qui existe), la case du champ en vue.
  function ajoutDuDetail(ligne, blocs) {
    if (!ligne) return null;
    var index = catalogueIndexe();
    return function (s) {
      if (!s || !s.estTravail) return null;
      var exo = index[s.exercise_slug];
      if (!exo) return null;
      var plus = Modele.champsDeSerie(exo).slice(Modele.gabaritDe(exo).champs.length);
      for (var i = 0; i < plus.length; i++) {
        var c = Modele.champDeMesure(plus[i]);
        if (s[c.cle] === null || s[c.cle] === undefined || s[c.cle] === '') {
          return { texte: 'Ajouter ' + c.manque, sur: (function (nom) {
            return function () { ouvrirPourAjouter(ligne, blocs, s.id, nom); };
          })(plus[i]) };
        }
      }
      return null;
    };
  }
  function ouvrirPourAjouter(ligne, blocs, serieId, nom) {
    modifierSeance(ligne, blocs);
    if (!seance || seance.id !== ligne.id) return;
    seance.exercices.forEach(function (e, iExo) {
      (e.series || []).forEach(function (x, iSerie) {
        if (!x || x.id !== serieId) return;
        var n = doc.querySelector('#blocs-seance [data-iexo="' + iExo + '"][data-iserie="' + iSerie + '"] [data-champ="' + nom + '"] input');
        if (n) { if (n.scrollIntoView) n.scrollIntoView({ block: 'center' }); n.focus(); }
      });
    });
  }

  function modifierSeance(ligne, blocs) {
    if (seanceEnCoursBloque()) return;
    if (seriesIncompletes(ligne.id)) {
      Rendu.rendreFeuilleConfirmer($('feuille-contenu'), {
        titre: 'Séance pas encore complète',
        aide: 'Ses séries finissent d\u2019arriver. Réessaie dans un instant — ' +
          'la corriger maintenant risquerait d\u2019en perdre.',
        libelle: 'Compris',
        surConfirmer: fermerVoile,
        surAnnuler: fermerVoile
      });
      ouvrirVoile($('feuille-seance'));
      return;
    }
    // 83 — les séries de la séance, lues dans le cache (la base, à la
    // dernière synchronisation) : connues de cet appareil, il peut les retirer.
    connaitre(ligne.id, seriesDe(ligne.id).map(function (x) { return x.id; }));
    seance = Seance.reprendre(ligne, blocs);
    chrono = null;
    sauverSeance();
    // ⚠️ REMPLACER, PAS EMPILER (chantier 47) — comme `refaireSeance` juste en
    // dessous, et comme les CINQ autres entrées dans l'onglet Saisie. Ces deux
    // lignes-ci étaient les seules à empiler, et c'est ce qui rendait le retour
    // faux : un aller-retour « Modifier → Enregistrer » laissait deux entrées
    // de plus, si bien que « ← Séances » remontait sur /saisie au lieu des
    // séances. Un écran qu'on rouvre pour corriger n'est pas un cran de plus
    // dans le parcours — c'est le même endroit, dans un autre mode.
    allerA(Routeur.SAISIE, {}, true);
    rendreSeance();
  }

  // Enregistrer une modification : les mêmes écritures qu'une fin de séance,
  // sans la fin. Pas de question de routine — une séance passée a pu diverger
  // depuis longtemps, et la routine d'aujourd'hui n'est plus celle du jour-là.
  //
  // ⚠️ 131 — LES ÉCRITURES D'UNE CORRECTION, UNE FOIS (`enregistrerCorrection`), PARAMÉTRÉES PAR LA SÉANCE. « Ce qui
  // manque à tes séances » corrige une séance passée SANS l'ouvrir : il appelle la même fonction, avec la séance
  // reprise (`Seance.reprendre`) — la même file (`poserSeries` → `remplacerSeries`), le même journal des records, la
  // même adoption locale. Aucun second chemin d'écriture d'une série ; aucune navigation ici.
  async function enregistrerCorrection(s) {
    // 58-2 — les séries telles qu'elles étaient, AVANT que le cache n'adopte la
    // correction : celles qui changent perdent leurs records.
    var seriesAvant = seriesDe(s.id).slice();
    await poserSeries(s === seance ? undefined : s);
    await poserSeance(false, s);
    await ecrireJournalDeSeance(s, seriesAvant);
    adopterLocalement(s);
  }

  async function enregistrerEdition() {
    var id = seance.id;
    await enregistrerCorrection(seance);
    seance = null; chrono = null;
    arreterMinuteur();
    rendreChrono();
    await Cache.ecrireBrouillon('seance', null);
    await oublierConnues(id);
    await oublierConsignes();
    // Enregistrer une correction est un RETOUR, pas une navigation : on revient
    // d'où l'on vient, on n'empile pas une seconde fois le détail.
    allerA(Routeur.SEANCE, { id: id }, true);
    rendreDetail(id);
  }

  // §7 octies.3 — « Refaire » ne copie pas dans l'historique : il DÉMARRE une
  // séance neuve avec la même structure et les mêmes notes. Aucune charge.
  async function refaireSeance(ligne, blocs) {
    if (seanceEnCoursBloque()) return;
    // 84 — commencer passe d'abord par la question de l'autre appareil.
    return avantDeCommencer(function () { return creerRefaite(ligne, blocs); });
  }
  async function creerRefaite(ligne, blocs) {
    seance = Seance.refaire({
      id: uuid(),
      userId: sessionActive && sessionActive.user && sessionActive.user.id,
      titre: ligne.titre || null,
      blocs: blocs,
      idSerie: uuid
    });
    chrono = null;
    await sauverSeance();
    await poserSeance(true);
    allerA(Routeur.SAISIE, {}, true);
    rendreSeance();
  }

  // ── Entrée ───────────────────────────────────────────────────────────────
  //
  // L'entrée est appelée DEUX fois au démarrage : une fois par `demarrer` qui
  // lit la session courante, une fois par le rappel d'authentification qui
  // rejoue l'état initial. Sans garde, la seconde recharge un cache encore
  // vide et ÉCRASE en mémoire ce que la première venait de synchroniser —
  // puis réécrit ce vide dans le cache. Défaut révélé par le compte de
  // contrôle de ce commit, qui annonçait « 2500 séries manquantes » sur un
  // cache pourtant complet.
  var entreeEnCours = null;

  // ⚠️ LA RÉ-ENTRÉE DU MÊME UTILISATEUR NE RELIT PLUS LE DISQUE (30/09/2026).
  //
  // Le SDK émet `SIGNED_IN` à CHAQUE retour au premier plan — chaque
  // déverrouillage du téléphone, en pleine séance. L'entrée complète relisait
  // alors la séance, la file et les paris depuis le disque, après un
  // `chargerCache` de tout l'historique : ce qui était posé en mémoire pendant
  // la lecture était écrasé par l'état d'avant. Séance du 29/09 : trois paris
  // du coach perdus — posés une seule fois (`dejaNote`), ils ne revenaient
  // jamais —, et une observation orpheline qui a bloqué la file (#336).
  //
  // Pour l'utilisateur DÉJÀ ENTRÉ, la mémoire est la vérité : on met à jour la
  // session (le jeton), on synchronise, on vide la file. La première entrée,
  // et celle d'un autre compte, restent complètes.
  var entreeFaitePour = null;

  function idDeSession(session) {
    return (session && session.user && session.user.id) || null;
  }

  // ⚠️ 60-2b — UNE ENTRÉE EN VOL N'ABSORBE QUE LA SESSION DE SON COMPTE. Avant, `entrer`
  // rendait l'entrée en cours sans regarder la session reçue : le lien de confirmation du
  // compte B, absorbé par le SDK PENDANT l'entrée de l'ancien compte A (la sonde synchrone
  // avait lu A dans le stockage avant), était jeté. L'app gardait A en mémoire sous le jeton
  // de B, et `chargerProfil` créait la ligne de B avec l'identifiant de A : `profiles_creation`
  // refusait (403). Désormais la session d'un AUTRE compte attend la fin de l'entrée en vol
  // puis entre à son tour ; celle du MÊME compte remplace l'objet de session (le jeton neuf).
  var entreeEnCoursPour = null;
  var departs = 0;   // « Quitter » : une entrée qui attendait son tour n'entre plus

  // 70 — ARRIVÉ PAR UN LIEN DE RÉCUPÉRATION (ECRAN-PROFIL §5.6). L'événement
  // `PASSWORD_RECOVERY` du SDK pose `'due'` ; la feuille du mot de passe s'ouvre
  // d'elle-même dès que l'entrée a posé son premier écran (`renduPour`), et
  // `'ouverte'` tient le questionnaire DERRIÈRE elle tant qu'elle n'est pas finie.
  var recuperation = null;
  var renduPour = null;   // le compte dont l'entrée a posé son premier écran

  function ouvrirRecuperationSiDue() {
    if (recuperation !== 'due' || !userId() || renduPour !== userId()) return;
    recuperation = 'ouverte';
    allerA(Routeur.PROFIL, {}, true);
    rendreProfilEcran();
    ouvrirMotDePasseProfil(true);
  }

  function entrer(session) {
    var uid = idDeSession(session);
    if (entreeEnCours) {
      if (!uid || uid === entreeEnCoursPour) {
        if (uid && idDeSession(sessionActive) === uid) sessionActive = session;
        return entreeEnCours;
      }
      // Elle attend son tour, mais le tour peut ne plus être le sien : un « Quitter » entre-temps
      // (le compteur de départs a bougé), ou un stockage qui ne la porte plus (un autre compte a
      // pris la place) — alors elle n'entre pas. La génération ne sert pas ici : l'entrée en vol
      // la change elle-même quand le cache change de propriétaire (`garantirProprietaire`).
      var parti = departs;
      return entreeEnCours.catch(function () {}).then(function () {
        if (parti !== departs) return;
        if (idDeSession(Auth.sessionPersistee()) !== uid) return;
        return entrer(session);
      });
    }
    entreeEnCoursPour = uid;
    entreeEnCours = uid && uid === entreeFaitePour ? reentrer(session) : entrerVraiment(session);
    entreeEnCours.catch(function () {}).then(function () { entreeEnCours = null; entreeEnCoursPour = null; });
    return entreeEnCours;
  }

  async function reentrer(session) {
    sessionActive = session;
    await synchroniser();
    vidanger();
    rendreEtatSync();
    // 155 — les routines aussi, avant de redessiner.
    await relireRoutinesAuRetour();
    // Comme à la fin de l'entrée complète : une synchronisation de fond ne
    // reprend jamais la main sur un écran en cours d'édition — le questionnaire
    // compris (60-2a) : il perdrait l'écran où l'on en est.
    // 71 — le récap de fin de séance aussi : « Terminer » pendant une synchronisation l'ouvrait, et la fin de la
    // synchronisation le remplaçait par la saisie.
    if (!vues.detail.hidden || !vues.routine.hidden || !vues.seance.hidden || !vues.questionnaire.hidden ||
        !vues.recap.hidden) return;
    rendreRoute(Routeur.analyser(racine.location.pathname));
  }

  async function entrerVraiment(session) {
    sessionActive = session || null;
    var userId = session && session.user && session.user.id;
    try {
      await garantirProprietaire(userId);
      await chargerCache();
    } catch (e) {
      console.warn('Cache local indisponible :', texteErreur(e));
    }

    // La séance en cours et la file, AVANT tout rendu et AVANT tout réseau.
    // C'est ce qui fait qu'une app tuée en pleine séance rouvre sur la séance,
    // hors ligne comme en ligne.
    lireModeRPE();
    lireSourdine();
    // ⚠️ AVANT LA MOINDRE ÉCRITURE (chantier 34). Si ce qui s'écrit et ce qui
    // se relit divergeaient, la première correction de séance perdrait des
    // colonnes en silence. On l'apprend ici, au démarrage, et bruyamment.
    Seance.verifierColonnes();
    await chargerSeanceLocale();
    await chargerBrouillonLocal();
    // AVANT tout rendu et AVANT tout réseau, comme la lecture qui précède : une
    // file bloquée par le défaut du chantier 32 se répare ici, sinon elle
    // resterait bloquée pour toujours (voir `reparerIdentifiantsManquants`).
    await reparerIdentifiantsManquants();
    await reparerFileHorsBornes();
    await reparerFileConflitsEnCours();
    await reparerFileSchema();
    // La mémoire est chargée : désormais, pour ce compte, c'est elle qui fait
    // foi (`entrer`).
    entreeFaitePour = userId || null;

    // Ouverture immédiate sur ce qu'on a déjà, avant toute requête réseau.
    // On honore l'URL d'entrée : un rechargement direct sur /semaine/… ou
    // /seance/… rouvre la bonne vue, pas systématiquement la semaine courante.
    await chargerProfilLocal();
    // 136 (E13) — le repos en cours, relu de la séance (jamais du disque) : avant le premier rendu.
    try { if (seance && !chrono) reprendreChrono(); }
    catch (e) { console.warn('Repos non repris :', texteErreur(e)); }

    var routeInitiale = Routeur.analyser(racine.location.pathname);
    // 64B — jeu éteint (le profil en cache le dit), `/jeu…` est une route inconnue dès le démarrage.
    if (Routeur.interditAvecSession(routeInitiale.vue) || routeInitiale.repli ||
        (Routeur.estVueDuJeu(routeInitiale.vue) && routeInitiale.vue !== Routeur.JEU && !jeuAllume())) {
      routeInitiale = { vue: Routeur.RACINE, params: {} };
      allerA(Routeur.RACINE, {}, true);
    }

    // ⚠️ LE QUESTIONNAIRE EST UNE RÈGLE DE ROUTAGE, PAS UN ÉCRAN DE PLUS (60-2a,
    // ECRAN-PROFIL §4 bis). Il remplace l'ancienne redirection vers le profil
    // (`onboarding_completed`). Ici, la décision ne lit que le CACHE : un profil
    // connu et jamais rempli l'ouvre tout de suite ; un profil inconnu (cache
    // vide, premier démarrage hors ligne) ne déclenche rien — on n'ouvre pas un
    // questionnaire sur une supposition — et `chargerProfil` reprendra la
    // décision quand la ligne arrive.

    etat = Sync.deciderEtat({ syncOk: false, aDesDonnees: local.seances.length > 0 });

    // ⚠️ UNE SÉANCE EN COURS S'AFFICHE TOUT DE SUITE, quoi qu'il y ait en cache.
    //
    // Le repli « Première synchronisation… » ne valait que pour un cache vide en
    // LECTURE. Il n'a rien à faire ici : quelqu'un qui rouvre l'app en salle,
    // hors réseau, après un appel entrant, doit retrouver sa séance
    // immédiatement — pas après que le SDK ait fini de renoncer, ce qui prend
    // plusieurs secondes. Pendant ces secondes, il croit l'avoir perdue.
    //
    // Défaut trouvé au banc d'écran, pas en test : la mesure unitaire relit le
    // disque et conclut « tout est là », alors que l'écran, lui, montrait autre
    // chose.
    // ⚠️ LA SÉANCE EN COURS EN BASE SE VÉRIFIE AVANT LA SYNCHRONISATION
    // COMPLÈTE (26/09/2026), et avant que « Démarrer » soit possible.
    //
    // Elle se vérifiait APRÈS `synchroniser()` : des secondes — une première
    // synchro, bien plus —, pendant lesquelles l'écran des routines offrait
    // « Démarrer ». Le 26/09, une séance B a été lancée dans cette fenêtre
    // alors que A était encore ouverte en base : 409, et B n'a existé que sur
    // le téléphone jusqu'à « Terminer ».
    //
    // Une lecture légère, lancée ICI sans être attendue : l'écran s'ouvre
    // toujours sur ce qu'on a en local, hors ligne compris. Ce qui l'attend,
    // c'est `chargerRoutines` — or sans routines, pas de « Démarrer ». Hors
    // ligne, la lecture échoue vite et ne bloque rien : si une séance naît
    // quand même face à une autre ouverte, la vidange résout le conflit.
    verificationSeance = resoudreSeanceEnCoursDistante().catch(function () {});

    if (ouvrirQuestionnaireSiDu()) { /* l'écran est posé : rien d'autre à rendre */ }
    else if (seance || local.seances.length) rendreRoute(routeInitiale);
    else { montrer('liste', Routeur.RACINE); Rendu.message($('liste-seances'), 'Première synchronisation…'); }

    // L'ancre s'installe dès l'ouverture, QUELLE QUE SOIT la vue d'entrée :
    // au fond de la pile, un retour ne déclenche aucun popstate, il ferme.
    // Y compris sur une ouverture directe sur /semaine/… — qui, jusqu'ici,
    // n'avait pas d'ancre et se fermait donc sans absorption.
    sortie.apresNavigation(false);
    // 70 — le premier écran est posé : la feuille du mot de passe peut passer
    // devant (un lien de récupération l'attend peut-être).
    renduPour = userId || null;
    ouvrirRecuperationSiDue();

    await verificationSeance;
    await synchroniser();
    // ⚠️ VOLONTAIREMENT PAS ATTENDU, comme `vidanger()` plus bas. Une ligne de
    // 300 octets n'a aucune raison de retarder le rendu final — et hors réseau,
    // où chaque tentative dure des secondes, l'attendre retarde le moment où
    // l'écran DIT qu'il n'y a pas de réseau. Trouvé au banc, pas en test : la
    // mesure unitaire ne voit pas une seconde de plus, l'écran si.
    // Le profil sait se rendre tout seul quand il arrive.
    var profilLu = chargerProfil();
    // 121 (05 #5) — mes nombres de guilde, s'ils sont périmés (une semaine, un mois, des séances que la dernière
    // publication ne connaissait pas) : par la file, une fois le profil lu (ses séances prévues).
    Promise.resolve(profilLu).then(function () {
      if (sessionActive && idDeSession(sessionActive) === userId) return poserScoresGuilde();
    }).catch(function (err) { console.warn('Les nombres de guilde ne se posent pas :', texteErreur(err)); });
    // La séance `en_cours` restée en base est déjà résolue (ch. 36, D7) : la
    // vérification ci-dessus a précédé la synchronisation. Et si elle a échoué,
    // le conflit se résout à la vidange elle-même.
    vidanger();   // le réseau vient de répondre : c'est le moment d'envoyer
    // 184 (D5) — les demandes d'abonnement s'allument dès l'accueil : les liens se lisent à l'ouverture, sans attendre.
    lireLiensALOuverture(userId);
    // L'outil de rejeu (développement seulement) : après la synchronisation,
    // l'historique est là.
    if (rejeuDemande) ouvrirRejeu();
    // 95 — « Ton année » : `?bilan=AAAA` hors production, sinon l'annonce de janvier (une fois).
    apresSynchroAnnee(userId, profilLu);
    // L'utilisateur est parti ailleurs pendant la synchro. Re-rendre écraserait
    // son écran — et, sur l'éditeur de routine, le brouillon qu'il est en train
    // de remplir. Une synchronisation de fond ne reprend jamais la main.
    // 71 — le récap de fin de séance aussi : « Terminer » pendant une synchronisation l'ouvrait, et la fin de la
    // synchronisation le remplaçait par la saisie.
    if (!vues.detail.hidden || !vues.routine.hidden || !vues.seance.hidden || !vues.questionnaire.hidden ||
        !vues.recap.hidden) return;
    rendreRoute(Routeur.analyser(racine.location.pathname));
  }

  // Déconnexion EXPLICITE : le cache de ce compte part avec elle. Une session
  // qui expire toute seule, en revanche, ne doit rien effacer — on revient à
  // l'écran de connexion et les données restent là pour la prochaine ouverture.
  async function deconnecter() {
    departs++;
    // 59-5 — AVANT DE VIDER QUOI QUE CE SOIT : une nouvelle génération. Tout
    // écrivain asynchrone encore en vol (synchro, journal, remplissage,
    // vidange, profil) abandonnera sans écrire ; les verrous des tâches en
    // vol sont libérés pour le compte suivant.
    nouvelleGeneration();
    // Avant toute chose : plus de session, donc plus aucune vue authentifiée
    // rendue — y compris par un retour qui atterrirait sur une ancienne entrée.
    sessionActive = null;
    // La prochaine entrée, même du même compte, repart du disque (vidé).
    entreeFaitePour = null;
    try { await Cache.viderTout(); } catch (e) { /* rien à garder de toute façon */ }
    local = { semaineChoix: [], seances: [], series: [], exercices: [], pesees: [], zones: [], modes: [],
              predictions: [], sousConsigne: {}, parisLegers: [], escalier: [], parSeance: null,
              records: [], connues: {}, objectifs: [], objectifsDispo: null, parisObjectif: [] };
    journalDecide = false;
    notesEnCours = {};
    // Les routines vivent en mémoire, pas dans le cache — mais elles
    // appartiennent quand même au compte qui part.
    routines = []; generationRoutines++; brouillon = null; etatRoutines = { code: 'jamais', message: '' }; derniereLectureRoutines = 0;
    seance = null; attente = []; chrono = null; arreterMinuteur();
    oublierSuppressionDifferee();
    // 106 — le groupe aussi, et ses messages gardés hors ligne (leur brouillon vient d'être vidé) : les envoyer au nom du
    // compte suivant serait parler à sa place.
    oublierGroupe();
    // 121 (05 #13) — et le social du compte qui part (liens, badge des demandes, guilde, ce qu'il a publié).
    oublierSocial();
    // Le profil appartient au compte qui part, et son envoi en attente avec lui :
    // rejouer une modification de profil sur le compte suivant serait pire que
    // de la perdre.
    profil = null; profilAEnvoyer = false; refusProfil = null; pseudoAInscrire = null;
    fermerQuestionnaire(); envoiProfil = null; versionProfil = 0; ligneACreer = false;
    recuperation = null; renduPour = null;
    faits.oublierDates();
    remplissage = null;
    // 59-2 — le jeton part même hors ligne (`Auth.deconnecter` l'efface
    // localement quand le serveur ne répond pas).
    try { await Auth.deconnecter(); } catch (e) { /* le jeton part quand même */ }
    // 59-2 — PUIS toutes les clés `th-v2…` de l'appareil : le jeton s'il en
    // restait, et les réglages retenus pour ce compte (le son du repos, la
    // bascule effort, les « non merci » des chauffes, les dossiers repliés, la
    // garde de développement). Après le jeton, jamais avant : effacé d'abord,
    // `signOut` ne trouverait plus de session à révoquer côté serveur. La
    // mémoire revient aux valeurs d'un appareil neuf.
    Quitter.effacerStockages([stockageSur('localStorage'), stockageSur('sessionStorage')]);
    sourdine = false; modeRPE = false; refusChauffes = null; dossiersReplies = {};
    allerA(Routeur.CONNEXION, {}, true);
    rendreEntree('connexion');
  }

  function stockageSur(nom) {
    try { return racine[nom] || null; } catch (e) { return null; }
  }

  function enregistrerSW() {
    if (!('serviceWorker' in racine.navigator)) return;
    // Chemins absolus : depuis /semaine/… un chemin relatif viserait
    // /semaine/service-worker.js, qui n'existe pas.
    racine.navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(function (reg) { majEnregistrement = reg; chercherMaj(true); })
      .catch(function (e) { console.warn('SW non enregistré :', e && e.message); });
  }

  // 88 — branché AU DÉBUT du démarrage, avant toute attente (`entrer` peut attendre
  // le réseau) : le contrôleur d'avant se lit tant qu'il est encore celui d'avant.
  function brancherMaj() {
    if (!('serviceWorker' in racine.navigator)) return;
    var sw = racine.navigator.serviceWorker;
    // 88 — « UNE NOUVELLE VERSION EST PRÊTE ». Le service worker fait `skipWaiting`
    // puis `clients.claim` : le nouveau prend la main, mais la page ouverte garde
    // l'ancien JS. On l'ANNONCE, on ne recharge JAMAIS à la place de l'utilisateur.
    // À la première installation il n'y avait pas de contrôleur : rien de neuf à
    // annoncer, c'est l'app elle-même qui arrive.
    majAvaitControleur = !!sw.controller;
    sw.addEventListener('controllerchange', function () {
      if (!majAvaitControleur) { majAvaitControleur = true; return; }
      majPrete = true;
      montrerBandeauMaj();
    });
    // Chrome ne cherche une mise à jour qu'à la navigation : une PWA qu'on ne fait
    // que ramener au premier plan ne la verrait jamais. Au plus une fois / 10 min.
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'visible') chercherMaj(false);
    });
    $('btn-maj-recharger').addEventListener('click', function () { racine.location.reload(); });
  }

  var majEnregistrement = null, majAvaitControleur = false, majPrete = false, majDerniere = 0;
  var MAJ_INTERVALLE = 10 * 60 * 1000;

  function chercherMaj(auDemarrage) {
    if (!majEnregistrement) return;
    var t = Date.now();
    if (!auDemarrage && t - majDerniere < MAJ_INTERVALLE) return;
    majDerniere = t;
    try {
      var p = majEnregistrement.update();
      if (p && p.catch) p.catch(function () { /* hors ligne : on retentera */ });
    } catch (e) { /* idem */ }
  }

  // LA SÉANCE EN COURS FAIT FOI : pendant une séance non terminée, le bandeau
  // attend — la fin de la séance, ou l'écran d'accueil (`montrer` le rappelle).
  function seanceEnCours() { return !!seance && !enEdition(); }

  function montrerBandeauMaj() {
    var el = $('bandeau-maj');
    if (!el) return;
    el.hidden = !(majPrete && (!seanceEnCours() || ecranCourant === 'liste'));
  }


  // ══ LE PROFIL (chantier 46 §2) ═══════════════════════════════════════════
  //
  // ⚠️ L'ONBOARDING, C'EST LE PROFIL (ECRAN-PROFIL-V1 §4). Pas de formulaire
  // séparé : un compte neuf arrive sur le profil aux champs vides, marqués
  // « à renseigner ». Même écran, même code — et c'est une RÈGLE DE ROUTAGE,
  // pas un écran de plus.
  //
  // Le v1 avait un ordonnanceur d'entrée de plusieurs centaines de lignes
  // (CLAUDE.md §9, chantier 7) pour tenir un tunnel de première visite. Ici il
  // n'y a pas de tunnel : il y a un écran, qu'on ouvre d'abord une fois, et
  // dont on peut sortir tout de suite.

  var profil = null;            // la ligne `profiles`, telle qu'on la connaît
  // 190 (MOTEUR §10.2) — LE MOTEUR LIT LE PLUS PETIT DISQUE DU PROFIL, à chaque calcul : le pas de la barre est 2 × ce disque
  // (`Moteur.pasDeLaBarre`). Un seul branchement ; le profil à jour est toujours celui qu'il lit.
  Moteur.brancherPlusPetitDisque(function () { return Profil.plusPetitDisqueDe(profil); });
  // Ce qui attend d'être envoyé (116, audit du 16/10/2026) : `false` (rien), les COLONNES des gestes pas encore partis
  // (`{ colonne: valeur }`, fusionnées par `Profil.fusionnerEnAttente`), ou `true` — la forme d'avant 116, relue sur
  // un appareil qui attendait déjà : la ligne entière part, une fois. Vrai ou faux s'y lit comme avant.
  var profilAEnvoyer = false;
  var pseudoAInscrire = null;   // le pseudo saisi à l'inscription, pas encore posé
  var CLE_PROFIL = 'profil';
  var CLE_PROFIL_ENVOI = 'profil-a-envoyer';

  // ⚠️ LE CACHE D'ABORD, LE RÉSEAU ENSUITE, ET JAMAIS D'ATTENTE. Le profil
  // s'affiche hors ligne comme le reste : il tient dans le magasin `meta`, qui
  // existe depuis la version 1 du cache — aucune montée de version ici.
  async function chargerProfilLocal() {
    try {
      var v = await Cache.lireMeta(CLE_PROFIL);
      if (v) profil = v;
      profilAEnvoyer = Profil.lireEnAttente(await Cache.lireMeta(CLE_PROFIL_ENVOI));
    } catch (e) { /* cache indisponible : on repartira du réseau */ }
  }

  async function sauverProfilLocal() {
    try {
      await Cache.ecrireMeta(CLE_PROFIL, profil);
      await Cache.ecrireMeta(CLE_PROFIL_ENVOI, profilAEnvoyer);
    } catch (e) { /* rien à faire : la copie réseau reste la référence */ }
  }

  function userId() {
    return (sessionActive && sessionActive.user && sessionActive.user.id) || null;
  }

  // Le profil distant. S'il n'existe pas, ON LE CRÉE — relevé sur `pg_trigger` :
  // AUCUN trigger ne pose la ligne à la création du compte, donc un compte tout
  // neuf n'a pas de profil et personne ne le posera à notre place.
  // 60-2b — L'IDENTIFIANT D'UNE ÉCRITURE DE PROFIL : celui de la session du CLIENT à
  // l'instant d'écrire — la session que le SDK relira pour le jeton —, jamais celui que
  // l'app a en mémoire. Les deux peuvent diverger (le compte change sous l'app : lien de
  // confirmation, autre onglet) ; `profiles_creation` et `profiles_modif` exigent
  // `id = auth.uid()`, et l'objet de session de la mémoire est le seul des deux qu'on
  // peut laisser périmé. UN SEUL ENDROIT, pour la lecture, la création et l'envoi de la ligne.
  //   · pas de session lisible (hors ligne avec un jeton à renouveler, stockage fermé) : `null`,
  //     on n'écrit pas un identifiant deviné — la ligne attend (`profilAEnvoyer`) ;
  //   · le client est sur un AUTRE compte que l'app : `null` aussi — on n'écrit JAMAIS la ligne
  //     de l'un sous l'identifiant de l'autre — et la session du client entre (`entrer`).
  //   · l'app a changé de compte PENDANT la lecture de la session (Quitter, autre compte) : le
  //     verdict est périmé — `null`, et surtout pas de ré-entrée dans un compte qu'on vient de quitter.
  async function identifiantDuProfil() {
    var g = generation;
    var s = null;
    try { s = await Auth.sessionCourante(); } catch (e) { s = null; }
    if (!generationValide(g) || !userId()) return null;
    var id = idDeSession(s);
    if (!id) return null;
    if (id !== userId()) { entrer(s); return null; }
    return id;
  }

  // 60-3b — LES DONNÉES QUE LE COMPTE PORTE (`user_metadata`, où l'inscription a déposé le pseudo),
  // lues sur la session du CLIENT — la même que celle de `identifiantDuProfil` —, jamais sur
  // `sessionActive` : la sonde synchrone du démarrage n'en rend qu'une forme réduite (`{ id, email }`).
  // Celles d'un AUTRE compte que `id` ne se lisent pas. `null` : rien.
  async function metadonneesDuCompte(id) {
    var s = null;
    try { s = await Auth.sessionCourante(); } catch (e) { s = null; }
    if (!s || !id || idDeSession(s) !== id) return null;
    var meta = s.user && s.user.user_metadata;
    return meta && typeof meta === 'object' ? meta : null;
  }

  // 60-3b — « PRIS ENTRE-TEMPS » : un ÉTAT DE L'ÉCRAN, pas une colonne (ECRAN-PROFIL §3.1). Retenu en
  // local, PAR COMPTE (`th-v2-…` + id : « Quitter » l'efface avec les autres clés de l'appareil, et
  // un autre compte ne le voit pas).
  //
  // 60-5 : il se retient AVEC LE PSEUDO QUE LA LIGNE PORTAIT quand le refus est tombé — `'1'` quand elle n'en portait
  // aucun (la forme de 60-3b), `'p:' + pseudo` quand l'ancien pseudo est revenu (« alice » → « bob » refusé : la ligne
  // redit « alice », et la phrase le dit aussi). Le Profil ne le montre que tant que la ligne est CELLE-LÀ : un pseudo
  // posé ailleurs (un autre appareil) ou accepté depuis, et la phrase s'en va ; une saisie de pseudo l'efface aussi
  // (`poserProfil`) — le prochain refus le reposera.
  var CLE_PSEUDO_PRIS = 'th-v2-pseudo-pris-';

  function retenirPseudoPris(id, tenu) {
    if (!id) return;
    try { racine.localStorage.setItem(CLE_PSEUDO_PRIS + id, tenu ? 'p:' + tenu : '1'); }
    catch (e) { /* stockage refusé : la ligne dit « à renseigner », sans la phrase */ }
  }

  function effacerPseudoPris(id) {
    if (!id) return;
    try { racine.localStorage.removeItem(CLE_PSEUDO_PRIS + id); }
    catch (e) { /* stockage refusé : la phrase se taira d'elle-même dès que la ligne change */ }
  }

  function pseudoPrisSignale() {
    var id = userId();
    if (!id) return false;
    var tenu = profil && profil.username ? 'p:' + profil.username : '1';
    try { return racine.localStorage.getItem(CLE_PSEUDO_PRIS + id) === tenu; }
    catch (e) { return false; }
  }

  async function chargerProfil() {
    if (!userId()) return;
    var g = generation;
    var version = versionProfil;
    var id = await identifiantDuProfil();
    if (!id || !generationValide(g)) return;
    var distant = null;
    try { distant = await Donnees.monProfil(id); }
    catch (e) { return; }   // hors réseau : ce qu'on a en cache fait l'affaire
    if (!generationValide(g)) return;
    // Un geste posé pendant la lecture est plus récent qu'elle : elle ne le remplace pas
    // (comme la réponse d'un envoi, `envoyerProfilMaintenant`).
    if (version !== versionProfil) return;
    // 93 — la base vient de dire s'il y a une ligne : sans elle, le premier envoi du Profil la CRÉERA.
    ligneACreer = !distant;

    if (!distant) {
      var creer = function (pseudo) {
        return Donnees.enregistrerProfil(id, Profil.champsEcrits({ username: pseudo || null }));
      };
      // 60-3b — LE PSEUDO DE LA LIGNE : UN SEUL ENDROIT CHOISIT (`Profil.pseudoDeLInscription`). Celui de la
      // page d'abord ; sinon celui que l'inscription a déposé dans les données du compte — le lien de
      // confirmation d'e-mail s'ouvre souvent dans une autre page, où `pseudoAInscrire` n'existe plus.
      var pseudo = Profil.pseudoDeLInscription(pseudoAInscrire, await metadonneesDuCompte(id));
      if (!generationValide(g)) return;
      try {
        try { distant = await creer(pseudo); }
        catch (e1) {
          // 60-2c — le pseudo arrive enfin jusqu'ici, et peut heurter l'unicité (23505) : la sonde de
          // disponibilité n'est qu'indicative. Sans cette sortie, la création échouerait à l'identique à
          // chaque chargement — pas de ligne, pas de questionnaire. Elle se crée SANS le pseudo ; le Profil
          // dit « à renseigner » et le choisir se fait là, avec sa propre vérification.
          // 60-3b — « pris entre-temps » est retenu (en local, par compte) : la ligne « Pseudo » du Profil
          // le dit tant qu'aucun pseudo n'est posé.
          if (!(pseudo && e1 && e1.code === '23505')) throw e1;
          if (generationValide(g)) {
            console.warn('Pseudo déjà pris, la ligne est créée sans lui :', texteErreur(e1));
            retenirPseudoPris(id);
          }
          pseudoAInscrire = null;
          distant = await creer(null);
        }
      } catch (e) {
        // 60-2b — une création qui échoue ne se perd plus en silence : elle se dit (console,
        // donc le journal des erreurs), et elle se REJOUE au prochain chargement du profil —
        // `pseudoAInscrire` reste posé, `monProfil` rendra encore « pas de ligne ».
        if (generationValide(g)) console.warn('Profil non créé, il sera retenté :', texteErreur(e));
        return;
      }
      if (!generationValide(g)) return;
      ligneACreer = false;
    }
    pseudoAInscrire = null;
    // Une modification locale non envoyée PRIME sur ce que le serveur rend :
    // sinon un aller-retour hors réseau la perdrait en silence, et c'est la
    // famille de défauts que le chantier 32 a coûté.
    if (profilAEnvoyer) { await envoyerProfil(); return; }
    profil = distant;
    await sauverProfilLocal();
    if (ecranCourant === 'profil') rendreProfilEcran();
    // Le bandeau de Saisie suit la ligne qui vient d'arriver (il ne s'ouvre pas toujours :
    // séance, feuille ou « Ranger » en cours).
    rendreBandeauQuestionnaire();
    rendreBandeauPhase();
    rendreCarteCycles();                       // 60-4 : la carte « Passer en cycles » lit le même profil
    jeuSuitLeProfil();                         // 64B : l'interrupteur a pu changer sur un autre appareil
    parcoursSuitLeProfil();                    // 75 : « Ton parcours » lit le sexe et les priorités
    // 60-2a — LA LIGNE DE PROFIL EST CONNUE : c'est ICI que la décision d'ouvrir le
    // questionnaire se reprend, au premier démarrage d'un compte neuf comme aux
    // suivants. Prise sur le seul cache, elle ne routait un compte neuf qu'au
    // SECOND démarrage (relevé 60-0).
    ouvrirQuestionnaireSiDu();
  }

  // ⚠️ UN SEUL ENVOI À LA FOIS, ET UNE RÉPONSE NE REMPLACE JAMAIS UN GESTE PLUS
  // RÉCENT (60-2a). Le questionnaire écrit à chaque écran validé, et chaque envoi
  // porte la LIGNE ENTIÈRE telle qu'elle était à son départ. Deux défauts, qu'un
  // seul tap rapide suffisait à déclencher :
  //   · deux envois en parallèle, traités dans l'autre sens par le serveur, font
  //     revenir une colonne à sa valeur d'avant (`priorites` repasserait à null) ;
  //   · la réponse du premier (`profil = rendu`) EFFAÇAIT le geste posé entre-temps
  //     — le second envoi partait alors sans lui, et il était perdu pour de bon.
  // D'où : chaque envoi lit `profil` QUAND IL PART, derrière le précédent ; et une
  // réponse n'est adoptée que si aucune pose n'est venue depuis son départ
  // (`versionProfil`) — sinon le geste plus récent a son propre envoi, derrière.
  // 116 (audit du 16/10/2026) — l'envoi ne porte plus la ligne entière : seulement les colonnes des gestes en
  // attente (`profilAEnvoyer`), lues QUAND IL PART ; ce qui est parti sort de l'attente, le reste attend le suivant.
  var envoiProfil = null;
  var versionProfil = 0;
  // 93 — vrai quand la dernière lecture a dit « pas de ligne » et que la création n'a pas abouti : le prochain
  // envoi la crée. Seulement sur ce SAVOIR — jamais sur l'absence d'une clé dans le cache (un appareil neuf, hors
  // ligne, n'a pas lu la ligne qui existe : y écrire le pseudo de l'inscription effacerait celui de la base).
  var ligneACreer = false;
  function envoyerProfil() {
    envoiProfil = (envoiProfil || Promise.resolve()).then(envoyerProfilMaintenant, envoyerProfilMaintenant);
    return envoiProfil;
  }

  async function envoyerProfilMaintenant() {
    // 116 — rien n'attend : rien ne part (un envoi n'est jamais une ligne entière « au cas où »).
    if (!userId() || !profil || !profilAEnvoyer) return;
    var g = generation;
    var version = versionProfil;
    var id = await identifiantDuProfil();
    if (!id || !generationValide(g)) return;
    try {
      // ⚠️ 116 (audit du 16/10/2026) — SEULEMENT LES COLONNES DES GESTES EN ATTENTE, jamais la ligne en cache : le
      // profil ne se relit qu'au démarrage, et la ligne entière réécrivait à son ancienne valeur tout réglage fait
      // ailleurs (un autre appareil, une prévisualisation de PR). L'`upsert` ne touche que les colonnes reçues.
      var champs = Profil.champsEnAttente(profilAEnvoyer, profil);
      // 93 — LA LIGNE PEUT NAÎTRE ICI : `chargerProfil` ne l'a pas posée (lecture ou création ratée), et c'est le
      // premier geste du Profil qui la crée (`ligneACreer`). La création reprend alors ce que `chargerProfil` aurait
      // écrit — le pseudo choisi au MÊME endroit (`Profil.pseudoDeLInscription`) — sauf ce que le geste pose lui-même. Un pseudo pris entre-temps retombe dans la sortie 60-5 ci-dessous.
      if (ligneACreer && !Object.prototype.hasOwnProperty.call(champs, 'username')) {
        champs.username = Profil.pseudoDeLInscription(pseudoAInscrire, await metadonneesDuCompte(id));
        if (!generationValide(g)) return;
      }
      var rendu, refusees = [];
      // 116 (audit du 16/10/2026, 03 #6) — UNE COLONNE REFUSÉE POUR DE BON NE BLOQUE PLUS LE PROFIL. Un refus
      // définitif (`Profil.estRefusDefinitif` : un CHECK, un NOT NULL, une valeur illisible pour la base) repartait à
      // l'identique à chaque départ, et tous les gestes suivants avec lui, sans un mot. L'envoi se refait alors colonne
      // par colonne : la fautive en sort (`refusees`, une phrase sur le Profil le dit), le reste part. Une autre erreur
      // (le réseau) remonte pendant ce tour : toute l'attente repartira, rien n'est déclaré refusé. Rien n'est passé :
      // la ligne telle que la base la tient (un envoi sans colonne). Le même canal, le même écrivain (la carte des
      // écritures, `v2-architecture`).
      var ecrire = async function (c) {
        try { return await Donnees.enregistrerProfil(id, c); }
        catch (e) {
          if (!Profil.estRefusDefinitif(e)) throw e;
          var r = null, refus = [], cles = Object.keys(c || {});
          for (var i = 0; i < cles.length; i++) {
            var une = {};
            une[cles[i]] = c[cles[i]];
            try { r = await Donnees.enregistrerProfil(id, une); }
            catch (e2) {
              if (!Profil.estRefusDefinitif(e2)) throw e2;
              refus.push(cles[i]);
            }
          }
          if (!r) r = await Donnees.enregistrerProfil(id, {});
          refusees = refusees.concat(refus);
          return r;
        }
      };
      try { rendu = await ecrire(champs); }
      catch (e1) {
        // 60-5 — UN PSEUDO REFUSÉ NE BLOQUE JAMAIS LE RESTE DU PROFIL (ECRAN-PROFIL §3.1). Le pseudo est
        // pris entre la vérification de la feuille (ou son silence, hors ligne) et cet envoi : le refus est
        // DÉFINITIF pour lui seul — rejoué à l'identique, il bloquerait toutes les colonnes. DEUX ENVOIS :
        // le premier, refusé en bloc par la base (un `upsert` est une seule instruction : un `23505` n'écrit
        // RIEN de la ligne) ; le second, la MÊME ligne moins `username`, rejouée UNE fois. Il ne peut pas
        // heurter l'unicité (le pseudo n'y est pas), perd aucun autre champ (même ligne) et ne boucle pas (pas
        // de nouvel essai ici : un échec du second retombe dans le chemin ordinaire, et repart au prochain
        // départ — démarrage, retour du réseau, geste — comme tout envoi). La réponse porte la ligne telle
        // que la base la tient : le pseudo refusé en sort, l'ancien (ou aucun) y revient.
        if (!Profil.estRefusDePseudo(e1, champs)) throw e1;
        if (!generationValide(g)) return;
        console.warn('Pseudo déjà pris, il quitte l’envoi du profil :', texteErreur(e1));
        rendu = await ecrire(Profil.sansPseudo(champs));
        // L'état « pris entre-temps » se retient avec le pseudo que la base tient maintenant (aucun, ou l'ancien).
        retenirPseudoPris(id, rendu.username);
        // Le pseudo refusé sort de la ligne LOCALE dès que la base a répondu — même si le reste de la réponse n'est
        // pas adopté ci-dessous (un geste plus récent attend son envoi) : il ne repart plus avec lui, et l'écran ne
        // le montre plus comme posé. Seul le champ refusé est corrigé, et seulement s'il n'a pas été retapé depuis.
        if (generationValide(g) && profil && profil.username === champs.username) {
          profil = Object.assign({}, profil, { username: rendu.username === undefined ? null : rendu.username });
          await sauverProfilLocal();
        }
      }
      if (!generationValide(g)) return;
      // 116 (03 #6) — les colonnes refusées : la ligne locale reprend la valeur de la base (comme le pseudo refusé,
      // seulement si elle n'a pas été retouchée depuis), elles sortent de l'attente avec ce qui est parti (ci-dessous),
      // et le Profil le dit une fois.
      if (refusees.length) {
        console.warn('Le profil : la base refuse, elles quittent l’envoi :', refusees.join(', '));
        var corrige = {};
        refusees.forEach(function (c) {
          if (profil && JSON.stringify(profil[c]) === JSON.stringify(champs[c])) corrige[c] = rendu[c] === undefined ? null : rendu[c];
        });
        profil = Object.assign({}, profil, corrige);
        refusProfil = { texte: Profil.phraseRefusProfil(refusees), vu: false };
      }
      // 116 — ce qui est parti sort de l'attente ; un geste posé PENDANT l'envoi (une autre colonne, ou la même avec une
      // autre valeur) y reste, pour l'envoi qui le suit. La forme d'avant 116 (`true`) n'attend plus rien si aucun
      // geste n'est venu depuis.
      profilAEnvoyer = profilAEnvoyer === true ? version !== versionProfil
        : Profil.retirerEnvoyes(profilAEnvoyer, champs);
      if (version !== versionProfil) {        // un geste plus récent attend son envoi : on ne le remplace pas
        await sauverProfilLocal();
        return;
      }
      profil = rendu;
      // Une adoption est un CHANGEMENT D'ÉTAT : une lecture (`chargerProfil`) partie AVANT elle, mais traitée par la
      // base avant l'écriture, rendrait une valeur plus ancienne que `rendu` et la remettrait en local — puis le
      // geste suivant, qui envoie la ligne entière, l'écrirait en base (relevé à la relecture de 60-5). La version
      // bouge, `chargerProfil` jette cette lecture (`version !== versionProfil`).
      versionProfil++;
      ligneACreer = false;
      pseudoAInscrire = null;   // 93 — la ligne existe : le pseudo de l'inscription a fait son office
      await sauverProfilLocal();
      if (ecranCourant === 'profil') rendreProfilEcran();
      // 107 — « Compte privé » : « en attente du réseau » s'efface quand la ligne est partie.
      if (ecranCourant === 'amis') dessinerAmis();
      // 93 — la ligne a pu naître de CE geste (création ratée au chargement) : la décision d'ouvrir le
      // questionnaire se reprend ici comme dans `chargerProfil`. Ses gardes (séance, feuille, « Ranger »,
      // récupération, déjà vu ici) l'empêchent de s'ouvrir par-dessus autre chose.
      rendreBandeauQuestionnaire();
      ouvrirQuestionnaireSiDu();
    } catch (e) {
      // Elle repartira : à la prochaine synchronisation, au prochain démarrage,
      // ou au retour du réseau. Rien n'est perdu — la valeur est en local et
      // l'intention est sur disque.
      if (!generationValide(g)) return;
      // 116 — l'attente reste telle quelle (ses colonnes, et celles posées depuis) : elle repartira entière.
      await sauverProfilLocal();
    }
  }

  // Le seul chemin d'écriture. Local d'abord — l'écran dit la vérité tout de
  // suite et hors ligne — puis le réseau.
  //
  // ⚠️ POSER ET RENDRE SONT SÉPARÉS, et ce n'est pas du zèle. Une écriture faite
  // depuis `montrer` (au moment où l'on quitte un écran) qui passerait par
  // `rendreProfilEcran` rappellerait `montrer('profil')` et ramènerait l'écran
  // qu'on vient de quitter (le défaut de l'ancien `marquerProfilVu`, retiré au 136).
  // Un écran qui se rouvre tout seul quand on en sort est exactement le genre de
  // défaut qu'aucun test unitaire ne voit.
  // 189 — la fin d'une « série de moins » (la phase quitte la sèche) se dit à l'écran de la phase, jusqu'à ce qu'on le quitte.
  var seriesRevenues = false;
  async function poserProfil(champs) {
    var ecrits = Profil.champsEcrits(champs);
    // 189 — la phase quitte la sèche : la « série de moins » s'arrête, par un geste visible (la phrase de l'écran de la phase),
    // jamais en silence. La réponse part dans la MÊME écriture que la phase.
    if (Object.prototype.hasOwnProperty.call(ecrits, 'phase') && Profil.phaseDe({ phase: ecrits.phase }) !== 'seche' &&
        reponseSerieDeMoins()) {
      var restantes = Object.assign({}, ecrits.cartes_semaine || reponsesDesCartes());
      delete restantes[Moteur.CLE_SERIE_DE_MOINS];
      ecrits.cartes_semaine = restantes;
      seriesRevenues = true;
    } else if (Object.prototype.hasOwnProperty.call(ecrits, 'phase') && Profil.phaseDe({ phase: ecrits.phase }) === 'seche') {
      seriesRevenues = false;
    }
    var avant = profil;
    profil = Object.assign({}, profil || {}, ecrits);
    objectifsSuiventLeProfil(avant);
    versionProfil++;
    // Un pseudo choisi remet l'état « pris entre-temps » à zéro : le prochain refus, s'il y en a un, le reposera.
    if (champs && Object.prototype.hasOwnProperty.call(champs, 'username')) effacerPseudoPris(userId());
    // 116 — les colonnes du geste rejoignent celles qui attendent déjà (deux gestes hors réseau partent ensemble,
    // chacun avec les siennes) : jamais la ligne entière.
    profilAEnvoyer = Profil.fusionnerEnAttente(profilAEnvoyer, ecrits);
    await sauverProfilLocal();
    await envoyerProfil();
  }

  function ecrireProfil(champs) {
    var promesse = poserProfil(champs);   // `profil` est à jour avant le 1er await
    rendreProfilEcran();
    return promesse;
  }

  // ══ LE QUESTIONNAIRE DU COACH (60-2a, QUESTIONNAIRE-COACH-V2) ═════════════
  //
  // Une VUE de l'app, pas un module à part : les écrans, leurs règles et leurs
  // textes vivent dans `questionnaire.js` (pur), le dessin dans `rendu.js`, et
  // ici ne restent que les GESTES et l'état de l'écran ouvert.
  //
  // ⚠️ IL ÉCRIT PAR LE CHEMIN DU PROFIL — `poserProfil`, pas `ecrireProfil`. C'est
  // le même chemin (local d'abord, la ligne partie sur le réseau, rejouée au
  // retour de la connexion), SANS le re-rendu : `ecrireProfil` appelle
  // `rendreProfilEcran`, qui ramènerait l'écran Profil par-dessus le
  // questionnaire à chaque « Continuer ». Le profil n'a pas de file d'envoi à
  // lui : son « hors ligne » est `profilAEnvoyer`.
  //
  // UNE ÉCRITURE PAR ÉCRAN VALIDÉ ; « ‹ Retour » n'écrit rien. Rouvert avant la
  // fin, il repart du début, chaque écran pré-rempli depuis la base.
  //
  // ⚠️ JAMAIS PAR-DESSUS UNE SÉANCE OUVERTE : on ne coupe pas quelqu'un en pleine
  // saisie pour lui poser des questions. Il reste alors le bandeau de Saisie.
  var CLE_QUESTIONNAIRE_VU = 'th-v2-questionnaire-vu-';   // + l'identifiant du compte
  var questionnaire = null;      // l'écran ouvert : { ecran, rep, faits, aDesSeances, textes, erreurs, retourRecap }
  var gardeQuestionnaire = null;

  // « Ouvert sur cet appareil » : une clé locale PAR COMPTE, dans le préfixe que
  // « Quitter » efface — un retour de connexion le remontre une fois, c'est voulu.
  // Un stockage refusé se lit « déjà vu » : on n'ouvre pas à chaque démarrage une
  // chose qu'on ne saurait pas dire qu'on a déjà montrée.
  function questionnaireDejaVuIci() {
    var id = userId();
    if (!id) return true;
    try { return racine.localStorage.getItem(CLE_QUESTIONNAIRE_VU + id) === '1'; }
    catch (e) { return true; }
  }

  function marquerQuestionnaireVuIci() {
    var id = userId();
    if (!id) return;
    try { racine.localStorage.setItem(CLE_QUESTIONNAIRE_VU + id, '1'); }
    catch (e) { /* stockage refusé : il ne se rouvrira pas de lui-même, le bandeau reste */ }
  }

  // L'ouverture de lui-même : la ligne de profil est connue, le questionnaire n'a
  // jamais été rempli, il ne s'est pas encore ouvert ici — et rien n'est en cours.
  function ouvrirQuestionnaireSiDu() {
    if (questionnaire || !userId()) return false;
    if (seance || voileOuvert) return false;
    // 70 — la feuille du mot de passe d'un lien de récupération passe d'abord.
    if (recuperation) return false;
    // Un ordre « Ranger » non enregistré ne se jette pas : changer d'écran ferait `fermerReorganisation`.
    if (modeModifier) return false;
    if (!vues.detail.hidden || !vues.routine.hidden || !vues.seance.hidden) return false;
    if (!Profil.doitOuvrirQuestionnaire(profil, questionnaireDejaVuIci())) return false;
    ouvrirQuestionnaire();
    return true;
  }

  // Ce que les séances savent, relu à chaque arrivée sur un écran qui le montre :
  // une synchronisation a pu apporter des séances depuis l'ouverture.
  function actualiserFaitsDuQuestionnaire() {
    questionnaire.aDesSeances = local.seances.length > 0;
    questionnaire.faits = faits.ceQueJeSais(corpus(), new Date(), Questionnaire.BARRES);
  }

  // La durée HABITUELLE (un fait : la médiane des séances, `null` sans heure de fin), pour les puces de
  // « Moins en ce moment » dans la feuille « Ton temps » du Profil (60-2c) — lue quand elle sert,
  // jamais au rendu de l'écran.
  function dureeHabituelleDesSeances() {
    var f = faits.ceQueJeSais(corpus(), new Date(), Questionnaire.BARRES);
    return f && f.dureeMin ? f.dureeMin : null;
  }

  // 60-3 — l'écran 8 (« Ton programme ») seulement quand on SAIT qu'il n'y a
  // aucune routine : tant que la bibliothèque n'est pas lue (hors ligne), `null`,
  // et l'écran n'existe pas. 60-4 : avec ou sans séance (« Construis-le-moi » lui donne
  // toujours deux choix), et l'écran 8b le suit quand ce choix est fait — la règle est
  // dans `Questionnaire.ecransVisibles`.
  function aDesRoutinesConnu() {
    return etatRoutines.code === 'ok' ? routines.length > 0 : null;
  }

  function ecransDuQuestionnaire() {
    if (questionnaire.refaire) return [Questionnaire.CONSTRUIT];
    return Questionnaire.ecransVisibles({ aDesSeances: questionnaire.aDesSeances,
                                          historique: questionnaire.rep.historique,
                                          programme: questionnaire.rep.programme,
                                          depuis: questionnaire.rep.depuis,
                                          objectif: questionnaire.rep.objectif,
                                          aDesRoutines: aDesRoutinesConnu() });
  }

  function ouvrirQuestionnaire(options) {
    if (questionnaire) return;
    var reprise = options && options.ecran ? options : null;
    // 60-4 — « Refaire mon programme » (Profil) rejoue l'écran 8b SEUL : le même écran, les mêmes écritures, puis
    // l'aperçu. Ce n'est pas le questionnaire : il ne se marque pas « vu ici ».
    var refaire = !!(options && options.refaire);
    var pesee = Poids.resume(local.pesees);
    if (!(options && options.ecran)) chargesDeDepartDuQuestionnaire = [];
    questionnaire = {
      ecran: refaire ? Questionnaire.CONSTRUIT : Questionnaire.BIENVENUE,
      rep: Questionnaire.reponsesInitiales(profil, { poids: pesee ? pesee.poids : null }),
      faits: null, aDesSeances: false, textes: {}, erreurs: {}, retourRecap: false, refaire: refaire
    };
    actualiserFaitsDuQuestionnaire();
    if (refaire) {
      // Les jours déjà dits (bornés), sinon le rythme que les séances montrent, comme à l'écran 8b. 116 — une valeur
      // déclarée hors 2-6 est pré-cochée bornée, sans être réécrite (`Questionnaire.precocherJours`).
      questionnaire.rep = Questionnaire.precocherJours(questionnaire.rep, questionnaire.faits);
      // 188-2 — la carte « Ta semaine prévue et ta semaine réelle » ouvre l'écran avec le nombre de jours qu'elle propose.
      if (options && Questionnaire.joursValides(options.jours)) questionnaire.rep = Object.assign({}, questionnaire.rep, { seances: options.jours });
    } else marquerQuestionnaireVuIci();
    // 60-3 — les routines vivent en ligne et ne sont pas dans le cache : on les
    // lit dès l'ouverture, pour savoir avant l'écran 8 s'il a lieu d'être.
    if (etatRoutines.code === 'jamais' || etatRoutines.code === 'echec') chargerRoutines().catch(function () {});
    // Le retour d'Android recule d'un écran (au premier : « Plus tard »). Une
    // feuille ouverte par-dessus (la durée visée) garde SON retour.
    gardeQuestionnaire = function () {
      if (!questionnaire || voileOuvert) return null;
      return { raison: 'questionnaire', afficher: reculerQuestionnaire };
    };
    ajouterGarde(gardeQuestionnaire);
    // 187 (A2) — le retour de l'import : les réponses sont celles d'avant (déjà écrites), l'écran celui qui suit.
    if (reprise) {
      questionnaire.rep = reprise.rep;
      questionnaire.ecran = reprise.ecran;
      actualiserFaitsDuQuestionnaire();
    }
    rendreQuestionnaire();
  }

  function fermerQuestionnaire() {
    questionnaire = null;
    if (gardeQuestionnaire) { retirerGarde(gardeQuestionnaire); gardeQuestionnaire = null; }
  }

  function rendreQuestionnaire() {
    var q = questionnaire;
    if (!q) return;
    montrer('questionnaire');
    var vue = Questionnaire.vueDe(q.ecran, { rep: q.rep, faits: q.faits, aDesSeances: q.aDesSeances, profil: profil,
      textes: q.textes, erreurs: q.erreurs, visibles: ecransDuQuestionnaire(), refaire: !!q.refaire,
      catalogue: q.ecran === Questionnaire.DEPART ? catalogueIndexe() : null });
    Rendu.rendreQuestionnaire($('questionnaire-corps'), vue, {
      surChoix: choisirDansQuestionnaire,
      surSaisie: saisirDansQuestionnaire,
      surLigne: ouvrirDureeDuQuestionnaire,
      surChanger: changerDepuisLeRecap,
      surContinuer: continuerQuestionnaire,
      surRetour: reculerQuestionnaire,
      surPlusTard: plusTardQuestionnaire
    });
  }

  function choisirDansQuestionnaire(cle, valeur) {
    if (!questionnaire) return;
    questionnaire.rep = Questionnaire.appliquerChoix(questionnaire.rep, cle, valeur);
    // 137 — une puce de durée touchée : les minutes tapées pour « Plus » ne sont plus la réponse.
    if (cle === 'duree') { delete questionnaire.textes.duree; delete questionnaire.erreurs.duree; }
    rendreQuestionnaire();
  }

  // Un champ tapé : la réponse et son erreur se mettent à jour, l'écran NE se
  // redessine PAS (le champ perdrait le clavier). On rend la phrase d'erreur.
  function saisirDansQuestionnaire(cle, texte) {
    var q = questionnaire;
    if (!q) return null;
    var r = Questionnaire.lireChamp(cle, texte, Modele.lireNombre, new Date());
    q.textes[cle] = texte;
    q.rep[cle] = r.valeur;
    q.erreurs[cle] = r.erreur;
    return r.erreur;
  }

  // La durée visée : la feuille de choix du Profil, mais la réponse reste un
  // brouillon de l'écran « Temps et matériel » (écrite à « Continuer », et
  // seulement si elle a changé), pas une écriture immédiate.
  function ouvrirDureeDuQuestionnaire() {
    var q = questionnaire;
    if (!q) return;
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoix(cible, {
        titre: 'Durée d’une séance',
        aide: null,
        options: optionsNombre(Profil.DUREES, ' min'),
        valeur: Questionnaire.dureeMontree(q.rep, q.faits),
        surChoix: function (v) {
          fermerVoile();
          q.rep = Questionnaire.appliquerChoix(q.rep, 'duree', v);
          rendreQuestionnaire();
        },
        surEffacer: null,
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // « changer », au récapitulatif : l'écran concerné, puis on REVIENT au récapitulatif.
  function changerDepuisLeRecap(ecran) {
    if (!questionnaire) return;
    questionnaire.ecran = ecran;
    questionnaire.retourRecap = true;
    rendreQuestionnaire();
  }

  function continuerQuestionnaire() {
    var q = questionnaire;
    if (!q || !Questionnaire.ecranPret(q.ecran, q.rep)) return;
    if (q.refaire) return validerRefaire();
    var ecrit = Questionnaire.champsDeLEcran(q.ecran, q.rep, profil, {
      pesees: local.pesees, jour: jourDuJour(), maintenant: new Date() });
    // Une écriture par écran. `poserProfil` met `profil` à jour AVANT son premier
    // `await` : l'écran suivant lit déjà la réponse. Aucun n'attend le réseau.
    if (Object.keys(ecrit.champs).length) poserProfil(ecrit.champs).catch(function () {});
    q.rep = Questionnaire.apresEcriture(q.rep, ecrit.champs);   // la durée écrite est la durée visée
    if (ecrit.pesee) poserPesee(ecrit.pesee).catch(function () {});
    if (q.ecran === Questionnaire.RECAP) return terminerQuestionnaire();
    // 187 (A5) — les séries récentes donnent la charge de départ des barres du programme construit (jamais en base
    // avant la création de la routine : `charge_cible_kg`, MOTEUR §9.21). Un brouillon de la session.
    if (q.ecran === Questionnaire.RECENTE) chargesDeDepartDuQuestionnaire = Questionnaire.seriesRecentes(q.rep);
    // 187 (A2) — « Oui, dans Hevy ou Strong » : l'import se fait ICI (l'écran et le code de l'import du Profil), puis
    // le questionnaire reprend à l'écran suivant. Les réponses de cet écran sont déjà écrites (ci-dessus).
    if (q.ecran === Questionnaire.ANCIENNETE && q.rep.notees === 'import' && q.rep.depuis !== Questionnaire.COMMENCE) {
      return ouvrirImportDepuisLeQuestionnaire();
    }
    var visibles = ecransDuQuestionnaire();
    // 60-4 — « Programme », changé depuis le récapitulatif vers « Construis-le-moi » : l'écran 8b d'abord
    // (les jours, la zone), PUIS le récapitulatif — sans lui, la ligne dirait « Construis-le-moi » sans
    // ses jours et l'aperçu n'aurait rien à construire.
    var vers8b = q.retourRecap && q.ecran === Questionnaire.PROGRAMME &&
      visibles.indexOf(Questionnaire.CONSTRUIT) >= 0;
    var suivant = vers8b ? Questionnaire.CONSTRUIT : q.retourRecap ? Questionnaire.RECAP
      : (Questionnaire.ecranSuivant(visibles, q.ecran) || Questionnaire.RECAP);
    q.retourRecap = vers8b;
    q.ecran = suivant;
    // Les jours de l'écran 8b sont pré-cochés : ceux déjà dits (bornés), sinon le rythme de l'écran 3a.
    // 116 — une valeur déclarée hors 2-6 est pré-cochée bornée, sans être réécrite (`Questionnaire.precocherJours`).
    if (suivant === Questionnaire.CONSTRUIT) q.rep = Questionnaire.precocherJours(q.rep, q.faits);
    if (suivant === Questionnaire.SAIT || suivant === Questionnaire.TEMPS || suivant === Questionnaire.RECAP) {
      actualiserFaitsDuQuestionnaire();
    }
    // Le poids pré-rempli est la DERNIÈRE pesée — relue à l'arrivée sur « Toi » tant que la
    // personne n'a rien tapé : ouvert depuis le cache, le questionnaire peut précéder une
    // synchronisation qui apporte une pesée plus récente, et confirmer l'ancienne valeur
    // l'écrirait comme pesée du jour.
    if (suivant === Questionnaire.TOI && q.textes.poids === undefined) {
      var derniere = Poids.resume(local.pesees);
      q.rep.poids = derniere ? derniere.poids : null;
    }
    rendreQuestionnaire();
  }

  // « ‹ Retour » : l'écran d'avant, sans rien écrire ; au premier écran, le
  // retour d'Android vaut « Plus tard ».
  function reculerQuestionnaire() {
    var q = questionnaire;
    if (!q) return;
    // 60-4 — « Refaire mon programme » : le retour ramène au Profil, sans rien écrire.
    if (q.refaire) { fermerQuestionnaire(); return rendreProfilEcran(); }
    if (q.retourRecap) {
      q.retourRecap = false;
      q.ecran = Questionnaire.RECAP;
      return rendreQuestionnaire();
    }
    var avant = Questionnaire.ecranPrecedent(ecransDuQuestionnaire(), q.ecran);
    if (!avant) return plusTardQuestionnaire();
    q.ecran = avant;
    rendreQuestionnaire();
  }

  // « Plus tard » ferme sans rien perdre — ce qui est validé est déjà écrit — et
  // mène à Saisie, où le bandeau le propose jusqu'à ce qu'il soit rempli.
  function plusTardQuestionnaire() {
    fermerQuestionnaire();
    afficherSaisie();
  }

  // « Commencer », sur le récapitulatif : `questionnaire_fait_le` vient d'être
  // posé par `continuerQuestionnaire`. Saisie, où l'on commence. 60-3 —
  // « Garder ce que je fais » (l'écran 8) : le questionnaire se termine D'ABORD,
  // puis la feuille « Tes séances qui reviennent » arrive par-dessus Saisie.
  async function terminerQuestionnaire() {
    var q = questionnaire;
    // « Garder ce que je fais » n'a de sens qu'avec des séances : sans elles (60-4, l'écran 8 existe quand
    // même), un « deduit » hérité d'avant n'ouvre rien.
    var garder = !!q && q.rep.programme === 'deduit' && q.aDesSeances &&
      ecransDuQuestionnaire().indexOf(Questionnaire.PROGRAMME) >= 0;
    // 60-4 — « Construis-le-moi » : l'aperçu du programme arrive de la même façon, par-dessus Saisie.
    var construire = !!q && q.rep.programme === 'construis' &&
      ecransDuQuestionnaire().indexOf(Questionnaire.PROGRAMME) >= 0;
    fermerQuestionnaire();
    await afficherSaisie();
    if (garder && !seance && !vues.saisie.hidden && !voileOuvert) await ouvrirSeancesQuiReviennent();
    else if (construire && !seance && !vues.saisie.hidden && !voileOuvert) await ouvrirApercuProgramme();
  }

  // 60-4 (ECRAN-PROFIL §4 bis) — « REFAIRE MON PROGRAMME » : les deux questions de l'écran 8b (les jours, une zone à
  // ménager), puis l'aperçu. Un NOUVEAU dossier (« Mon programme (2) » s'il existe) — l'ancien reste tel quel, une
  // décision ne s'efface jamais en silence — et `programme_construit_*` pointent le nouveau à la création.
  function refaireMonProgramme() {
    if (questionnaire || seance || voileOuvert) return;
    ouvrirQuestionnaire({ refaire: true });
  }

  async function validerRefaire() {
    var q = questionnaire;
    if (!q || !q.refaire) return;
    var ecrit = Questionnaire.champsDeLEcran(q.ecran, q.rep, profil, {
      pesees: local.pesees, jour: jourDuJour(), maintenant: new Date() });
    if (Object.keys(ecrit.champs).length) poserProfil(ecrit.champs).catch(function () {});
    fermerQuestionnaire();
    await afficherSaisie();
    if (!seance && !vues.saisie.hidden && !voileOuvert) await ouvrirApercuProgramme();
  }

  // Le bandeau de Saisie : « Ton questionnaire n'est pas terminé. », tant qu'il
  // ne l'est pas. Le composant du « brouillon oublié », sans « Abandonner » : il
  // ne se ferme qu'en le remplissant.
  function rendreBandeauQuestionnaire() {
    var noeud = $('bandeau-questionnaire');
    if (!noeud) return;
    if (!Profil.questionnaireAFaire(profil)) { Rendu.rendreBandeauReprise(noeud, null); return; }
    Rendu.rendreBandeauReprise(noeud, {
      quoi: 'Ton questionnaire n’est pas terminé.',
      libelleReprendre: 'Le terminer',
      surReprendre: ouvrirQuestionnaire
    });
  }

  // 60-4 — LA CARTE « PASSER EN CYCLES » (MOTEUR §9.22, décidée le 08/10/2026). Le programme construit est fait de
  // routines simples ; pour Force et Les deux, UNE FOIS, 21 jours après sa création et après au moins 6 séances faites
  // depuis ses routines, ni en « Juste un carnet », ni si le dossier est déjà un programme. La règle est celle du
  // générateur (`Generateur.carteCycles`) ; ici on LIT l'état, on ne le compte pas à la main. Rien n'est écrit au rendu :
  // seuls les deux boutons écrivent, et seul « Pas maintenant » écrit (`carte_cycles_le`) — « Passer en cycles » ouvre
  // « Faire de ce dossier un programme » sur ce dossier, et annuler cette feuille laisse la carte où elle est.
  //
  // Le dossier est le NOM RÉEL écrit à la création (`programme_construit_dossier`) ; « déjà un programme » compte aussi
  // un bloc arrêté ou terminé : la personne a déjà fait ce choix pour ce dossier, la carte ne revient pas.
  //
  // Elle rend `{ dossier, seances }` : les séances FAITES depuis les routines du dossier — le fait même qui porte son
  // seuil de 6, et le seul chiffre qu'elle DIT (« Tu as fait N séances de ton programme. », R5, 60-5). Le calendrier
  // des 21 jours n'est jamais dit (MOTEUR §9.22) : il ne sert qu'à décider.
  function carteCyclesDuProfil() {
    var p = profil || {};
    var dossier = Profil.dossierDuProgrammeValide(p.programme_construit_dossier);
    if (!dossier || !p.programme_construit_le) return null;
    var ids = Routines.visibles(routines).filter(function (r) { return Routines.dossierPropre(r.dossier) === dossier; })
      .map(function (r) { return r.id; });
    if (!ids.length) return null;                                      // le dossier a disparu : rien à passer en cycles
    var seances = faits.seancesDesRoutines(corpus(), ids, p.programme_construit_le);
    var affichee = Generateur.carteCycles({
      objectif: Profil.objectifDe(p),
      joursDepuisCreation: Profil.joursDepuis(p.programme_construit_le, new Date()),
      seancesDuDossier: seances,
      estProgramme: (local.blocs || []).some(function (b) { return b && b.dossier === dossier; }),
      carnet: Moteur.coachSeTait(p.intention),
      dejaVue: Profil.carteCyclesDejaVue(p)   // 137 : le refus vaut pour CE programme (MOTEUR §9.22)
    });
    return affichee ? { dossier: dossier, seances: seances } : null;
  }

  function rendreCarteCycles() {
    var noeud = $('carte-cycles');
    if (!noeud) return;
    var carte = seance ? null : carteCyclesDuProfil();
    if (!carte) { Rendu.rendreBandeauReprise(noeud, null); return; }
    var dossier = carte.dossier;
    Rendu.rendreBandeauReprise(noeud, {
      quoi: 'Tu as fait ' + carte.seances + ' séances de ton programme.',
      sujet: 'Un bloc de ' + Moteur.SEMAINES_BLOC_DEFAUT + ' semaines en Lourd sur tes barres, la dernière plus légère : ' +
        'c\u2019est là que la force se gagne. On passe en cycles ?',
      libelleQuitter: 'Pas maintenant',
      surQuitter: reporterLaCarteCycles,
      libelleReprendre: 'Passer en cycles',
      surReprendre: function () { ouvrirProgramme(dossier, null); }
    });
  }

  // ── 99 (MOTEUR §9.24) — LA SEMAINE QUI DÉRAILLE ─────────────────────────
  //
  // À l'ouverture de Saisie (jamais par une notification), avec un programme à jours prévus : la carte de
  // `Deraille.semaineQuiDeraille`, lue telle quelle. Ce que la personne décide vaut pour CETTE SEMAINE SEULEMENT et
  // suit la personne d'un appareil à l'autre : une ligne `semaine_choix` (v2_085) par séance manquée, écrite par la
  // FILE (jamais en direct), relue au démarrage, gardée aussi sur l'appareil pour le hors-ligne (`CLE_SEMAINE`).
  // Rien ne touche une routine ; un exercice réparti se lit dans la séance (« ajouté : séance manquée de mardi »).
  // En « Juste un carnet », le coach se tait.
  var CLE_SEMAINE = 'semaine-choix';
  var semaineDecalee = null;   // { jour, routine } : après « la suite se décale », la bande et « Démarrer »

  function lireLaSemaine() { return Deraille.etatDepuisLignes(local.semaineChoix || [], Moteur.jourCivil(new Date())); }
  function cleDuChoix(l) { return String(l.semaine).slice(0, 10) + '|' + l.routine_id; }
  // Fondre les lignes : par clé (semaine, routine), la plus récente gagne — un choix fait ici, pas encore monté,
  // n'est jamais écrasé par la relecture du serveur.
  function fondreChoix(a, b) {
    var par = {};
    (a || []).concat(b || []).forEach(function (l) {
      if (!l || !l.routine_id || !l.semaine) return;
      var k = cleDuChoix(l);
      if (!par[k] || String(l.cree_le || '') >= String(par[k].cree_le || '')) par[k] = l;
    });
    return Object.keys(par).map(function (k) { return par[k]; });
  }
  // ══ 109 (MOTEUR §9.25) — L'OBJECTIF, À L'ESSAI ════════════════════════════════════════════════════════════════
  //
  // La personne pose elle-même un objectif sur un exercice (charge × reps), depuis sa page ; le coach ne l'impose
  // jamais. À la POSE, `THObjectif.projection` dit ce que le coach annonce (une date, « pas encore », « plus d'un
  // an ») ; une date fait un PARI (`predictions`, module « objectif », grandeur « jours »). La ligne `objectifs`
  // garde ce qui a été annoncé : la page la RELIT, la date ne bouge plus. Changer ou retirer l'objectif n'efface
  // jamais un ancien pari ; chacun s'observe (les jours réellement mis) quand la série qui atteint SON objectif
  // arrive — à « Terminer », et à la synchronisation (une séance importée). Sans la table (v2_089 pas lancée), pas
  // de carte, et rien ne part vers elle.
  var CLE_OBJECTIFS = 'objectifs';
  var CLE_PARIS_OBJECTIF = 'paris-objectif';
  // 139 — la version des gestes sur les objectifs (`ecrireObjectif`, `retirerObjectif`) ; lue par `synchroniser`.
  var versionObjectifs = 0;

  // `{ dispo, lignes }` — `dispo: false` : la base ne connaît pas la table ; `null` : rien reçu (réseau).
  async function lireObjectifs() {
    try { return { dispo: true, lignes: await Donnees.mesObjectifs() }; }
    catch (e) {
      if (Donnees.tableAbsente(e)) return { dispo: false, lignes: null };
      console.warn('Lecture indisponible :', texteErreur(e));
      return null;
    }
  }
  // FUSION, JAMAIS REMPLACEMENT : un objectif posé ou retiré hors ligne n'est pas encore chez le serveur — sa
  // dernière intention dans la file fait foi.
  function fondreObjectifs(serveur) {
    var enFile = {};
    (attente || []).forEach(function (e) { if (e && e.table === Attente.OBJECTIFS) enFile[e.id] = e; });
    var par = {};
    (serveur || []).forEach(function (l) { if (l && l.exercise_slug && !enFile[l.exercise_slug]) par[l.exercise_slug] = l; });
    Object.keys(enFile).forEach(function (slug) {
      var e = enFile[slug];
      if (e.op !== Attente.SUPPRIMER && e.donnees) par[slug] = e.donnees;
    });
    return Object.keys(par).map(function (k) { return par[k]; });
  }
  // 139 — les objectifs (leur `exercise_slug`) qui attendent dans la file à cet instant.
  function objectifsEnFile() {
    var ids = {};
    (attente || []).forEach(function (e) { if (e && e.table === Attente.OBJECTIFS) ids[e.id] = true; });
    return ids;
  }
  // 139 — `fondus` : la lecture du serveur fondue avec la file d'aujourd'hui ; `enFileALaLecture` : ce qui attendait
  // quand la lecture est partie. Un objectif qui attendait alors et n'attend plus est parti PENDANT la lecture : le
  // serveur qui a répondu ne l'avait pas encore, l'appareil le sait — sa ligne (ou son absence, s'il a été retiré)
  // remplace celle de la lecture. Un objectif encore dans la file est déjà gardé par `fondreObjectifs`.
  function gardeLesGestesEnVol(fondus, enFileALaLecture) {
    var maintenant = objectifsEnFile();
    var partis = Object.keys(enFileALaLecture || {}).filter(function (slug) { return !maintenant[slug]; });
    if (!partis.length) return fondus;
    var reste = (fondus || []).filter(function (l) { return l && partis.indexOf(l.exercise_slug) < 0; });
    var locales = (local.objectifs || []).filter(function (l) { return l && partis.indexOf(l.exercise_slug) >= 0; });
    return reste.concat(locales);
  }
  // Les paris d'objectif : ceux du serveur ; ceux de l'appareil quand leur pari ou leur observation attend encore
  // dans la file, ou que le serveur ne les a pas encore.
  function fondreParisObjectif(serveur) {
    var enFile = {};
    (attente || []).forEach(function (e) {
      if (e && (e.table === Attente.PREDICTIONS || e.table === Attente.OBSERVATIONS)) enFile[e.id] = true;
    });
    var par = {};
    (serveur || []).forEach(function (l) { if (l && l.id && l.module === Moteur.MODULE_OBJECTIF) par[l.id] = l; });
    (local.parisObjectif || []).forEach(function (l) { if (l && l.id && (enFile[l.id] || !par[l.id])) par[l.id] = l; });
    return Object.keys(par).map(function (k) { return par[k]; });
  }
  function objectifDe(slug) {
    return (local.objectifs || []).filter(function (l) { return l && l.exercise_slug === slug; })[0] || null;
  }
  // Les séances d'un exercice, sous la forme que lit `THObjectif` (`faits.seancesDeLExercice`, le module des faits).
  function seancesPourObjectif(groupes) {
    return (groupes || []).map(function (g) { return { id: g.seance.id, debut: g.seance.debut, series: g.series }; });
  }
  function coachSeTaitIci() { return Moteur.coachSeTait(profil && profil.intention); }

  // La carte de la page d'exercice, LUE : `null` sans la table, ou pour un exercice qui ne se mesure pas en charge.
  function carteObjectifDe(slug, exo, groupes, maintenant, onglet) {
    if (local.objectifsDispo !== true || !Objectif.possible(exo)) return null;
    var o = objectifDe(slug);
    return {
      vue: o ? Objectif.vue({ objectif: o, seances: seancesPourObjectif(groupes), options: Modele.optionsDeRecord(exo),
                              maintenant: maintenant, carnet: coachSeTaitIci(), anciennete: profil ? profil.anciennete : null,
                              salle: Profil.salleDeLExercice(profil, slug, Modele.indexerExercices(local.exercices)) }) : null,
      surPoser: function () { ouvrirFeuilleObjectif(slug, function () { rendreExercice(slug, onglet); }); }
    };
  }

  function ouvrirFeuilleObjectif(slug, apres) {
    var index = Modele.indexerExercices(local.exercices), exo = index[slug];
    var o = objectifDe(slug);
    var seances = seancesPourObjectif(faits.seancesDeLExercice(corpus(), slug));
    var options = Modele.optionsDeRecord(exo), carnet = coachSeTaitIci();
    Rendu.rendreFeuilleObjectif($('feuille-contenu'), {
      nom: Modele.nommer(index, slug), existe: !!o,
      charge: o ? Modele.nombreTexte(o.charge_kg) : '', reps: o ? o.reps : 1,
      phrasePour: function (reps) { return Objectif.phraseDeSaisie(seances, reps, new Date(), options, carnet); },
      surValider: async function (c, r) {
        var refus = await poserObjectif(slug, c, r);
        if (!refus) fermerVoile();
        return refus;
      },
      surRetirer: async function () { await retirerObjectif(slug); fermerVoile(); },
      surAnnuler: fermerVoile
    });
    ouvrirVoile($('feuille-seance'), function () {
      feuille = null;
      if (typeof apres === 'function') apres();
    });
  }

  // POSER (ou changer) : rend la phrase de refus, ou `null`. Le pari part avant la ligne ; aucun ne dépend de
  // l'autre. Le même objectif reposé tel quel ne change rien : la date annoncée ne bouge pas.
  async function poserObjectif(slug, chargeTexte, repsTexte) {
    var lu = Objectif.lireSaisie(chargeTexte, repsTexte);
    if (lu.refus) return lu.refus;
    var avant = objectifDe(slug);
    if (avant && Math.abs(Number(avant.charge_kg) - lu.charge) < 1e-9 && Number(avant.reps) === lu.reps) return null;
    var uid = userId();
    if (!uid) return 'Connecte-toi pour poser un objectif.';
    var exo = Modele.indexerExercices(local.exercices)[slug];
    var maintenant = new Date(), pose = maintenant.toISOString();
    var pr = Objectif.projection({
      seances: seancesPourObjectif(faits.seancesDeLExercice(corpus(), slug)), charge: lu.charge, reps: lu.reps,
      maintenant: maintenant, anciennete: profil ? profil.anciennete : null, options: Modele.optionsDeRecord(exo),
      carnet: coachSeTaitIci(), salle: Profil.salleDeLExercice(profil, slug, Modele.indexerExercices(local.exercices))
    });
    if (pr.etat === 'deja') return Objectif.phraseDejaFait(pr, maintenant);
    if (pr.etat === 'hors_salle') return Objectif.phraseHorsSalle(pr);
    if (pr.etat === 'elastique') return Objectif.PHRASE_ELASTIQUE;
    var pariId = pr.etat === 'date' ? await Moteur.idDObjectif(slug, pose) : null;
    var ligne = Objectif.ligneDe(slug, lu.charge, lu.reps, pose, pr, uid, pariId);
    await ecrireObjectif(slug, ligne, Objectif.pariDe(ligne, pr, uid, pariId));
    return null;
  }

  // Le pari part avant la ligne. 157 — l'objectif DÉPEND de son pari (`depend`) et se pose EN FIN DE FILE (`alaFin`) :
  // reposé hors ligne alors que son entrée attend encore, il passe derrière le nouveau pari, et un pari refusé le
  // retient. « Juste un carnet » (sans pari) : inchangé. Local d'abord (le cache), puis la file.
  async function ecrireObjectif(slug, ligne, pari) {
    versionObjectifs++;
    local.objectifs = (local.objectifs || []).filter(function (l) { return l && l.exercise_slug !== slug; }).concat([ligne]);
    await Cache.ecrireBrouillon(CLE_OBJECTIFS, { dispo: true, lignes: local.objectifs }).catch(function () {});
    if (pari) {
      local.parisObjectif = (local.parisObjectif || []).concat([pari]);
      await Cache.ecrireBrouillon(CLE_PARIS_OBJECTIF, local.parisObjectif).catch(function () {});
      await poser({ table: Attente.PREDICTIONS, op: Attente.UPSERT, id: pari.id, depend: pari.id, donnees: pari });
    }
    versionObjectifs++;   // 139 — l'entrée entre dans la file ICI, derrière le pari : une lecture partie entre-temps est périmée aussi
    await poser({ table: Attente.OBJECTIFS, op: Attente.UPSERT, id: slug, depend: pari ? pari.id : null, alaFin: !!pari, donnees: ligne });
  }

  // Audit du 16/10/2026, 01 #11 — LE RETOUR EN PROGRESSER : un objectif posé en « Juste un carnet » reçoit sa date
  // UNE fois, au retour (`poserProfil`, quand l'intention passe du carnet à Progresser), et son pari est posé à ce
  // moment-là (`THObjectif.ligneAuRetour`). Atteint entre-temps : rien (la carte dit « Atteint le … »). Une seule
  // passe à la fois : deux bascules rapides ne posent pas deux paris.
  // Le geste qui ramène en Progresser (le Profil, le questionnaire) : `avant`, la ligne d'avant le geste. Seulement
  // un geste de CET appareil — un changement venu d'un autre appareil y a déjà posé le pari.
  function objectifsSuiventLeProfil(avant) {
    if (!avant || !Moteur.coachSeTait(avant.intention) || !profil || Moteur.coachSeTait(profil.intention)) return;
    projeterObjectifsDuCarnet().catch(function (e) { console.warn('Objectifs du carnet :', texteErreur(e)); });
  }
  var retourEnCours = null;
  function projeterObjectifsDuCarnet() {
    if (!retourEnCours) {
      retourEnCours = projeterObjectifsDuCarnetUneFois().finally(function () { retourEnCours = null; });
    }
    return retourEnCours;
  }
  async function projeterObjectifsDuCarnetUneFois() {
    if (local.objectifsDispo !== true || !profil || coachSeTaitIci()) return;
    var uid = userId();
    if (!uid) return;
    var index = Modele.indexerExercices(local.exercices);
    var carnet = (local.objectifs || []).filter(function (l) { return l && l.projection === 'carnet'; });
    for (var i = 0; i < carnet.length; i++) {
      var l = carnet[i], slug = l.exercise_slug, exo = index[slug];
      if (!Objectif.possible(exo)) continue;
      var seances = seancesPourObjectif(faits.seancesDeLExercice(corpus(), slug));
      if (Objectif.atteinte(seances, l)) continue;
      var maintenant = new Date(), pose = maintenant.toISOString();
      var pr = Objectif.projection({
        seances: seances, charge: Number(l.charge_kg), reps: Number(l.reps), maintenant: maintenant,
        anciennete: profil.anciennete, options: Modele.optionsDeRecord(exo), carnet: false,
        salle: Profil.salleDeLExercice(profil, slug, index)
      });
      var pariId = pr.etat === 'date' ? await Moteur.idDObjectif(slug, pose) : null;
      var ligne = Objectif.ligneAuRetour(l, pr, pariId);
      if (!ligne || coachSeTaitIci()) continue;
      var pari = Objectif.pariDe({ exercise_slug: slug, charge_kg: l.charge_kg, reps: l.reps, pose_le: pose }, pr, uid, pariId);
      await ecrireObjectif(slug, ligne, pari);
    }
  }

  // RETIRER : la ligne s'efface ; son pari reste, et s'observe comme les autres.
  async function retirerObjectif(slug) {
    versionObjectifs++;
    local.objectifs = (local.objectifs || []).filter(function (l) { return l && l.exercise_slug !== slug; });
    await Cache.ecrireBrouillon(CLE_OBJECTIFS, { dispo: true, lignes: local.objectifs }).catch(function () {});
    versionObjectifs++;
    await poser({ table: Attente.OBJECTIFS, op: Attente.SUPPRIMER, id: slug });
  }

  // L'OBSERVATION des paris d'objectif : la première série qui atteint l'objectif DU PARI, après sa pose — les
  // jours réellement mis, rattachés à cette série (`set_observe`), même après l'échéance. Elle part derrière la
  // séance de la série (`depend`). Jamais retirée ici : une série effacée vide l'observation en base
  // (`sets_efface_observation`) ; une autre série qui atteint l'objectif la reprend.
  async function observerObjectifs() {
    var paris = local.parisObjectif || [];
    if (!paris.length) return;
    var parSlug = {}, maj = {};
    paris.forEach(function (p) {
      var slug = p && p.module === Moteur.MODULE_OBJECTIF && p.fondement ? p.fondement.exercice : null;
      if (!slug) return;
      var seances = parSlug[slug] || (parSlug[slug] = seancesPourObjectif(faits.seancesDeLExercice(corpus(), slug)));
      var obs = Objectif.observationDe(p, seances);
      if (!obs.set_observe) return;
      if (p.set_observe === obs.set_observe && Number(p.valeur_observee) === obs.valeur_observee) return;
      maj[p.id] = { ligne: Object.assign({}, p, { valeur_observee: obs.valeur_observee, observee_a: new Date().toISOString(),
                                                  set_observe: obs.set_observe }), seance: obs.session_id };
    });
    var ids = Object.keys(maj);
    if (!ids.length) return;
    local.parisObjectif = paris.map(function (l) { return l && maj[l.id] ? maj[l.id].ligne : l; });
    await Cache.ecrireBrouillon(CLE_PARIS_OBJECTIF, local.parisObjectif).catch(function () {});
    for (var i = 0; i < ids.length; i++) {
      var l = maj[ids[i]].ligne;
      await poser({ table: Attente.OBSERVATIONS, op: Attente.OBSERVER, id: l.id, depend: maj[ids[i]].seance, alaFin: true,
                    donnees: { valeur_observee: l.valeur_observee, observee_a: l.observee_a, set_observe: l.set_observe } });
    }
  }

  async function poserChoixDeSemaine(lignes) {
    local.semaineChoix = fondreChoix(local.semaineChoix, lignes);
    // 178 (diagnostic « Répartir ») — L'ENVOI D'ABORD. La file est la promesse d'envoi ; le brouillon de l'appareil n'est
    // qu'une copie de lecture. Posé dans l'autre sens, une page tuée entre les deux transactions gardait le choix
    // sur l'appareil mais ne l'envoyait jamais. Le rattrapage au démarrage (`choixAReposer`) couvre le reste.
    for (var i = 0; i < lignes.length; i++) {
      await poser({ table: Attente.SEMAINE_CHOIX, op: Attente.UPSERT, id: cleDuChoix(lignes[i]), donnees: lignes[i] });
    }
    await Cache.ecrireBrouillon(CLE_SEMAINE, local.semaineChoix).catch(function () {});
  }

  function entreeDeLaSemaine(jour) {
    var p = profil || {};
    var fait = faits.semaineDuProgramme(corpus(), jour, null);
    return {
      jour: jour,
      // Le niveau du questionnaire : « Moins d'un an » = débutant (la règle du générateur, 60-6).
      debutant: Profil.estDebutant(p),
      dureeMax_s: Number(p.duree_seance_min) > 0 ? Number(p.duree_seance_min) * 60 : null,
      routines: Routines.visibles(routines), catalogue: catalogueIndexe(),
      seances: fait.seances, volume: fait.volume, etat: lireLaSemaine()
    };
  }

  function rendreCarteSemaine() {
    var noeud = $('carte-semaine');
    if (!noeud) return;
    if (seance || etatRoutines.code !== 'ok' || Moteur.coachSeTait(profil && profil.intention)) {
      Rendu.rendreCarteSemaine(noeud, null);
      return;
    }
    var maintenant = new Date();
    var jour = Moteur.jourCivil(maintenant);
    var e = entreeDeLaSemaine(jour);
    var vue = { bande: Deraille.bandeDeLaSemaine(e.routines, e.etat, jour), aujourdhui: (maintenant.getDay() + 6) % 7 };
    if (semaineDecalee && semaineDecalee.jour === jour) {
      var r = routines.filter(function (x) { return x.id === semaineDecalee.routine; })[0];
      if (r) {
        var index = catalogueIndexe();
        vue.apres = { titre: Deraille.nomCourt(r.nom) + ' · aujourd\u2019hui',
          exercices: r.exercices.map(function (x) {
            var n = Semaine.compteSeriesTravail(x.series || [], local.exercices);
            return ((index[x.exercise_slug] || {}).nom || x.exercise_slug) + ' · ' + n + ' série' + (n > 1 ? 's' : '');
          }),
          surDemarrer: function () { semaineDecalee = null; demarrerSeance(r); } };
        Rendu.rendreCarteSemaine(noeud, vue);
        return;
      }
    }
    var carte = Deraille.semaineQuiDeraille(e);
    if (!carte) { Rendu.rendreCarteSemaine(noeud, null); return; }
    vue.titre = carte.titre;
    vue.phrase = carte.phrase || null;
    vue.pourquoi = carte.pourquoi || null;
    vue.choix = carte.choix;
    vue.surChoix = function (cle) {
      poserChoixDeSemaine(Deraille.lignesDuChoix(carte, cle, jour, idUtilisateur(), new Date().toISOString()))
        .catch(function (e) { console.warn('Choix de la semaine non posé :', texteErreur(e)); });
      semaineDecalee = cle === 'decaler' ? { jour: jour, routine: carte.manquee.routine } : null;
      rendreSaisie();
    };
    Rendu.rendreCarteSemaine(noeud, vue);
  }

  // La routine qui démarre aujourd'hui, avec les exercices que la semaine qui déraille lui a ajoutés (pour cette
  // séance seulement). Rend `{ routine, mentions }`, `mentions` étant la mention de chaque exercice ajouté, à la fin.
  function avecLesAjoutsDeLaSemaine(routine) {
    if (!routine || !routine.id) return { routine: routine, mentions: [] };
    var aj = Deraille.ajoutsDuJour(lireLaSemaine(), routine.id, Moteur.jourCivil(new Date()));
    if (!aj.length) return { routine: routine, mentions: [] };
    return { routine: Object.assign({}, routine, { exercices: (routine.exercices || []).concat(aj.map(function (a) { return a.exercice; })) }),
             mentions: aj.map(function (a) { return a.mention; }) };
  }

  // « Pas maintenant » : la carte ne revient pas pour CE programme (`carte_cycles_le`, 137 : un programme reconstruit la
  // remontrait). Le bouton du dossier, lui, reste.
  function reporterLaCarteCycles() {
    var champs = Profil.preparerChamps(profil, { carte_cycles_le: new Date() }, new Date());
    if (Object.keys(champs).length) poserProfil(champs).catch(function () {});
    rendreCarteCycles();
  }

  // 60-2b — LE RAPPEL DE PHASE (MOTEUR §9.16) : « Sèche depuis le 28 sept. », 6
  // semaines après la dernière réponse sur la phase. Le composant des bandeaux de
  // Saisie ; « C'est toujours ça » à droite (le geste principal), « Changer » à
  // gauche. Pas de question (§20.2). Il se TAIT pendant une séance (l'onglet est la
  // séance) et en « Juste un carnet » — par LE fait du silence du coach, pas par un
  // second test de l'intention. Il ne dépend pas de l'état du questionnaire : s'ils
  // coexistent, le questionnaire est au-dessus (l'ordre du DOM). Rien n'est écrit au
  // rendu : seuls les deux boutons écrivent.
  function rendreBandeauPhase() {
    var noeud = $('bandeau-phase');
    if (!noeud) return;
    if (seance || Moteur.coachSeTait(profil && profil.intention) || !Profil.rappelDePhase(profil, new Date())) {
      Rendu.rendreBandeauReprise(noeud, null);
      return;
    }
    Rendu.rendreBandeauReprise(noeud, {
      quoi: Profil.phraseRappelDePhase(profil),
      depuis: 'Ta phase règle la série de plus et entre dans chaque pari du coach.',
      libelleQuitter: 'Changer',
      surQuitter: ouvrirPhaseDuRappel,
      libelleReprendre: 'C’est toujours ça',
      surReprendre: function () { repondrePhaseDuRappel(Profil.phaseDe(profil)); }
    });
  }

  // ══ 138 (ECRAN-PROFIL §3.5) — IPHONE : INSTALLER, ET LES RETOURS DE LIEN ══════════════════════════════
  //
  // Sur Android, Chrome propose l'installation : l'app n'en dit rien. Sur iPhone, Safari ne propose rien et efface les
  // données d'un site non installé qu'on n'ouvre pas pendant 7 jours (audit I-03, I-12) ; un lien d'e-mail ouvre
  // Safari, jamais l'app installée (I-05). UNE SEULE fonction décide « iPhone, hors de l'app » (`Auth.iphoneHorsApp`),
  // et les phrases viennent d'un seul endroit (`Auth.PHRASES_IPHONE`). Tout ce qui suit la LIT : rien n'est écrit en base.
  function surIphone() {
    return Auth.iphoneHorsApp(racine.navigator, typeof racine.matchMedia === 'function' ? racine.matchMedia.bind(racine) : null);
  }

  // La feuille « Comment faire » : le voile et la feuille de l'app (son « Fermer » est celui du voile).
  function ouvrirFeuilleInstaller() {
    var f = Auth.PHRASES_IPHONE.feuille;
    Rendu.rendreFeuilleInstaller($('feuille-contenu'), { titre: f.titre, etapes: f.etapes, sept: f.sept });
    ouvrirVoile($('feuille-seance'));
  }

  // L'encart de la connexion : sous le formulaire, les deux modes (connexion, inscription), pas de « Plus tard ».
  function rendreEncartInstaller() {
    var noeud = $('encart-installer');
    if (!noeud) return;
    if (!surIphone()) { Rendu.rendreBandeauReprise(noeud, null); return; }
    var p = Auth.PHRASES_IPHONE.connexion;
    Rendu.rendreBandeauReprise(noeud, { quoi: p.quoi, sujet: p.sujet,
      libelleReprendre: 'Comment faire', surReprendre: ouvrirFeuilleInstaller });
  }

  // « Plus tard » : un fait de CET APPAREIL (le Safari qu'on a ouvert), pas du compte — `localStorage`, une clé,
  // l'instant en millisecondes, lecture et écriture sous `try` (comme `th-v2-sourdine`). Aucune colonne en base.
  var CLE_INSTALLER_PLUS_TARD = 'th-v2-installer-plus-tard';
  var SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000;

  function installerRepousse(maintenant) {
    try {
      var t = Number(racine.localStorage.getItem(CLE_INSTALLER_PLUS_TARD));
      return t > 0 && maintenant - t >= 0 && maintenant - t < SEPT_JOURS_MS;
    } catch (e) { return false; }
  }

  // Le bandeau de Saisie : connectée, hors séance, SOUS le questionnaire et la phase (ils passent d'abord : l'ordre du DOM).
  function rendreBandeauInstaller() {
    var noeud = $('bandeau-installer');
    if (!noeud) return;
    if (seance || !sessionActive || !surIphone() || installerRepousse(Date.now())) {
      Rendu.rendreBandeauReprise(noeud, null);
      return;
    }
    var p = Auth.PHRASES_IPHONE.saisie;
    Rendu.rendreBandeauReprise(noeud, {
      quoi: p.quoi, sujet: p.sujet,
      libelleQuitter: 'Plus tard',
      surQuitter: function () {
        try { racine.localStorage.setItem(CLE_INSTALLER_PLUS_TARD, String(Date.now())); } catch (e) { /* stockage fermé : il reviendra */ }
        rendreBandeauInstaller();
      },
      libelleReprendre: 'Comment faire',
      surReprendre: ouvrirFeuilleInstaller
    });
  }

  // La réponse au rappel, par la MÊME préparation des champs que le questionnaire et
  // le Profil (`Profil.preparerChamps`) : la phase inchangée n'écrit que sa date de
  // confirmation, une autre phase écrit aussi la phase et son « depuis ». `poserProfil`
  // et non `ecrireProfil` : celui-ci ouvrirait l'écran du Profil, et on est sur Saisie.
  function repondrePhaseDuRappel(phase) {
    var champs = Profil.preparerChamps(profil, { phase: phase }, new Date());
    if (Object.keys(champs).length) poserProfil(champs).catch(function () {});
    rendreBandeauPhase();
  }

  // « Changer » : la feuille de la phase — les trois phases, sans « Je ne sais pas »
  // (on vient de confirmer qu'on en a une). Choisir la phase en cours la confirme.
  function ouvrirPhaseDuRappel() {
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoix(cible, {
        titre: 'Ta phase',
        aide: null,
        options: Profil.PHASES.filter(function (o) { return o.cle !== 'inconnue'; }),
        valeur: Profil.phaseDe(profil),
        surChoix: function (v) { fermerVoile(); repondrePhaseDuRappel(v); },
        surEffacer: null,
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // ── La déclaration des champs ─────────────────────────────────────
  //
  // ⚠️ UNE TABLE, PAS QUINZE FONCTIONS. Chaque entrée dit sa colonne, sa
  // feuille et comment se lit sa valeur ; `rendreProfil` ne connaît aucune de
  // ces colonnes et les feuilles n'en connaissent qu'une à la fois. Ajouter un
  // champ, c'est une ligne ici — pas une ligne dans le rendu, une dans le
  // routeur et une dans le HTML.
  function listeDe(cle) {
    if (cle === 'materiel') return Profil.MATERIELS;
    if (cle === 'anciennete') return Profil.ANCIENNETES;
    if (cle === 'sexe') return Profil.SEXES;
    return [];
  }

  function valeurProfil(cle) { return profil ? profil[cle] : null; }

  // Les listes fermées. `effacable` dit si la colonne accepte NULL : `sexe` est
  // NOT NULL en base — lui proposer « Effacer » serait promettre une écriture que
  // Postgres refuserait en 23502.
  //
  // ⚠️ 60-1 (QUESTIONNAIRE-COACH-V2 §6) — CHAQUE PHRASE DIT CE QUI EST BRANCHÉ.
  // « Matériel » range, il ne décide de rien : il passe après ce que tu n'as
  // pas, jamais caché. Discipline, niveau déclaré et unités ont quitté l'écran
  // (rien ne les lit), et la phrase qui faisait de « Sexe », de la taille et de
  // l'âge les entrées d'un calcul de force a quitté leurs feuilles : aucun
  // calcul de ce genre n'est lu dans l'app.
  var CHOIX = {
    materiel: { titre: 'Matériel', effacable: true,
      aide: 'Je range les exercices selon ton matériel : ce que tu n’as pas passe après, jamais caché.' },
    anciennete: { titre: 'Entraînement régulier', effacable: true,
      aide: 'Depuis quand tu t’entraînes RÉGULIÈREMENT — pas depuis ta première séance. On peut s’entraîner depuis cinq ans et rester débutant.' },
    sexe: { titre: 'Sexe', effacable: false,
      aide: '« Non précisé » est une réponse, pas un trou.' }
  };

  function ouvrirChoixProfil(cle) {
    var def = CHOIX[cle];
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoix(cible, {
        titre: def.titre,
        aide: def.aide,
        options: listeDe(cle),
        valeur: valeurProfil(cle),
        surChoix: function (v) { fermerVoile(); ecrireProfil(defObjet(cle, v)); },
        surEffacer: def.effacable
          ? function () { fermerVoile(); ecrireProfil(defObjet(cle, null)); } : null,
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // Les nombres à liste fermée : séances par semaine (1 à 14, `profiles_rythme_borne`)
  // et durée visée. Une molette serait plus jolie ; une liste est plus honnête —
  // on voit les huit valeurs d'un coup et on sait ce qu'on choisit.
  function optionsNombre(valeurs, suffixe) {
    return valeurs.map(function (v) { return { cle: v, libelle: v + suffixe }; });
  }

  // ⚠️ CE « RYTHME »-LÀ EST « TA SEMAINE » — séances par semaine et durée,
  // borné par `profiles_rythme_borne`. À NE PAS CONFONDRE avec
  // `rythme_progression` (MOTEUR §9.8), qui règle la vitesse de montée du
  // moteur et vit dans la section « TON RYTHME ». Les noms internes gardent
  // l'ancien mot ; seuls les libellés d'écran ont été dé-confondus.
  function ouvrirRythmeProfil(cle) {
    var seances = cle === 'seances_par_semaine';
    var valeurs = [];
    if (seances) {
      for (var i = Profil.SEANCES_MIN; i <= Profil.SEANCES_MAX; i++) valeurs.push(i);
    } else valeurs = Profil.DUREES;
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoix(cible, {
        titre: seances ? 'Séances par semaine' : 'Durée d’une séance',
        aide: seances
          ? 'Ce que tu VISES, pas ce que tu fais — le compte réel, lui, se lit dans tes séances.'
          : 'Quand ta routine dépasse ce temps, je te propose de la raccourcir.',
        options: optionsNombre(valeurs, seances ? '' : ' min'),
        valeur: valeurProfil(cle),
        surChoix: function (v) { fermerVoile(); ecrireProfil(defObjet(cle, v)); },
        surEffacer: function () { fermerVoile(); ecrireProfil(defObjet(cle, null)); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // ── « TON BUT » ET « TON TEMPS » (60-2a) ─────────────────────────────────
  //
  // Une réponse du Profil s'écrit par `Profil.preparerChamps` — la MÊME fonction
  // que le questionnaire : `objectif_depuis` suit un objectif qui change, et une
  // réponse inchangée n'écrit rien (elle ferme la feuille, c'est tout).
  function ecrireReponse(entrees) {
    var champs = Profil.preparerChamps(profil, entrees, new Date());
    if (Object.keys(champs).length) ecrireProfil(champs);
  }

  function ouvrirReponseProfil(cle) {
    if (cle === 'priorites') return ouvrirPrioritesProfil();
    var objectif = cle === 'objectif';
    // 60-2c — « Moins en ce moment » DEMANDE COMBIEN. Le toucher ne ferme pas la feuille : il ouvre
    // juste dessous les quatre durées (`Profil.pucesDeMoins`, la fonction de l'écran 7 du
    // questionnaire), et la feuille gagne un « Valider ». Rien ne s'écrit avant lui — « Annuler »
    // laisse tout comme c'était. Sans puce touchée, « Valider » n'écrit que la réponse de temps.
    var moinsOuvert = false, dureeChoisie = null, habituelle = null;
    var redessiner = function () { feuilleProfil($('feuille-contenu')); };
    feuilleProfil = function (cible) {
      var options = objectif ? Profil.OBJECTIFS : Profil.optionsTemps();
      if (moinsOuvert) {
        options = options.map(function (o) {
          if (o.cle !== 'moins') return o;
          return { cle: o.cle, libelle: o.libelle, sous: o.sous,
                   apres: Profil.pucesDeMoins(profil && profil.duree_seance_min, habituelle, dureeChoisie) };
        });
      }
      Rendu.rendreFeuilleChoix(cible, {
        titre: objectif ? 'But d’entraînement' : 'Ton temps',
        // 60-2b : ce que le coach fait de la réponse — une phrase pour l'objectif, une
        // sous-ligne par réponse de temps qu'il lit (`Profil.optionsTemps`).
        aide: objectif ? Profil.AIDE_OBJECTIF : null,
        options: options,
        valeur: moinsOuvert ? 'moins' : valeurProfil(cle),
        surChoix: function (v) {
          if (!objectif && v === 'moins') {
            habituelle = dureeHabituelleDesSeances();
            moinsOuvert = true;
            redessiner();
            return;
          }
          fermerVoile();
          ecrireReponse(defObjet(cle, v));
        },
        surPuce: function (n) { dureeChoisie = n; redessiner(); },
        surValider: moinsOuvert ? function () {
          fermerVoile();
          ecrireReponse(dureeChoisie ? { temps_reponse: 'moins', duree_seance_min: dureeChoisie }
                                     : { temps_reponse: 'moins' });
        } : null,
        surEffacer: null,
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // Les priorités : une feuille à cocher, trois au plus. Le brouillon est celui
  // de la feuille — rien n'est écrit avant « Valider ». `null` : pas répondu ;
  // `[]` : « Pas de priorité », une réponse.
  function ouvrirPrioritesProfil() {
    var liste = Array.isArray(profil && profil.priorites) ? profil.priorites.slice() : null;
    var redessiner = function () { feuilleProfil($('feuille-contenu')); };
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoixMultiple(cible, {
        titre: 'Priorités',
        aide: Profil.AIDE_PRIORITES,
        groupes: [{ titre: 'Des exercices', options: Profil.EXERCICES_PRIORITAIRES },
                  { titre: 'Ou des muscles', options: Profil.musclesPrioritaires() }],
        valeurs: liste || [],
        max: Profil.PRIORITES_MAX,
        aucune: { libelle: 'Pas de priorité', actif: Array.isArray(liste) && liste.length === 0 },
        surBasculer: function (c) { liste = Profil.basculerPriorite(liste, c); redessiner(); },
        surAucune: function () { liste = []; redessiner(); },
        surValider: function () { fermerVoile(); ecrireReponse({ priorites: liste }); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // ── LE PROGRAMME CONSTRUIT, AU PROFIL (60-4, ECRAN-PROFIL §4 bis) ───────────
  function ouvrirProgrammeProfil(quoi) {
    if (quoi === 'zones') return ouvrirZonesProfil();
    if (quoi === 'raides') return ouvrirRaidesProfil();
    if (quoi === 'ecartes') return ouvrirEcartesProfil();
    if (quoi === 'refaire') return refaireMonProgramme();
  }

  // « Zone à ménager » : une feuille à puces (une ou plusieurs, ou « Aucune »), la MÊME que l'écran 8b
  // (`Profil.basculerZone`). Rien ne s'écrit avant « Valider » ; « Aucune » écrit le vide (`NULL`).
  function ouvrirZonesProfil() {
    var liste = Profil.zonesAMenagerValides(profil && profil.zones_a_menager) || [];
    var redessiner = function () { feuilleProfil($('feuille-contenu')); };
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoixMultiple(cible, {
        titre: 'Zone à ménager',
        aide: Profil.PHRASE_ZONES,
        groupes: [{ options: Profil.ZONES_A_MENAGER }],
        valeurs: liste,
        aucune: { libelle: 'Aucune', actif: liste.length === 0 },
        surBasculer: function (c) { liste = Profil.basculerZone(liste, c); redessiner(); },
        surAucune: function () { liste = []; redessiner(); },
        surValider: function () { fermerVoile(); ecrireReponse({ zones_a_menager: liste }); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // 194-1 — « Zones raides » : la même feuille à puces ; « Aucune » écrit la liste vide (une réponse). Valider remet à zéro les « Non merci »
  // du bloc de mobilité (le retrouver ici, MOTEUR §9.31).
  function ouvrirRaidesProfil() {
    var liste = Profil.zonesRaidesValides(profil && profil.zones_raides);
    var repondu = liste !== null;
    liste = liste || [];
    var redessiner = function () { feuilleProfil($('feuille-contenu')); };
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleChoixMultiple(cible, {
        titre: 'Zones raides',
        aide: Profil.PHRASE_RAIDES,
        groupes: [{ options: Profil.ZONES_RAIDES }],
        valeurs: liste,
        aucune: { libelle: 'Aucune', actif: repondu && liste.length === 0 },
        surBasculer: function (c) { liste = Profil.basculerZoneRaide(liste, c); repondu = true; redessiner(); },
        surAucune: function () { liste = []; repondu = true; redessiner(); },
        surValider: function () {
          fermerVoile();
          if (!repondu) return;
          ecrireRefusChauffes(Plan.accepterChauffes(lireRefusChauffes(), Moteur.MOBILITE_REFUS_CLE));
          ecrireReponse({ zones_raides: liste });
        },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // 108 (MOTEUR §10 bis, ECRAN-PROFIL §2.4 quinquies) — « MA SALLE » : une feuille, un brouillon ; rien ne s'écrit
  // avant « Valider ». Les gestes sont ceux de `profil.js` (purs) ; « Effacer » écrit le vide (`NULL` : non
  // renseignée, rien ne change). Une saisie hors bornes ne ferme pas la feuille : une phrase le dit.
  function ouvrirSalleProfil() {
    var brouillon = Profil.brouillonSalle(profil);
    var erreur = null;
    var redessiner = function () { feuilleProfil($('feuille-contenu')); };
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleSalle(cible, {
        brouillon: brouillon, erreur: erreur, declaree: !!Profil.salleDe(profil),
        // 190 — le plus petit disque et la barre de traction (les lignes du questionnaire) ; les élastiques seulement s'il y en a.
        avecElastiques: unExerciceALElastique(),
        surReglage: function (cle, valeur) { brouillon = Profil.poserReglageMateriel(brouillon, cle, valeur); erreur = null; redessiner(); },
        surBasculer: function (type, kg) { brouillon = Profil.basculerBarre(brouillon, type, kg); erreur = null; redessiner(); },
        surAjouter: function (type, texte) {
          var v = Modele.lireNombre(texte);
          if (!(v >= Profil.SALLE_BARRE_MIN && v <= Profil.SALLE_BARRE_MAX) || Math.round(v * 2) !== v * 2) {
            erreur = 'Un poids de barre entre ' + Profil.SALLE_BARRE_MIN + ' et ' + Profil.SALLE_BARRE_MAX + ' kg, au demi-kilo.';
            return redessiner();
          }
          if ((brouillon[type] || []).indexOf(v) < 0) brouillon = Profil.basculerBarre(brouillon, type, v);
          erreur = null;
          redessiner();
        },
        // Le « jusqu'à » de la ligne `i`, tapé : le brouillon suit, sans redessin (la feuille ne se refait pas sous le doigt).
        surMaxHalteres: function (texte, i) {
          brouillon = Profil.poserMaxHalteres(brouillon, Modele.lireNombre(texte), i);
        },
        surPasHalteres: function (kg, i) {
          brouillon = Profil.poserPasHalteres(brouillon, kg, i);
          erreur = null;
          redessiner();
        },
        // 123 — les tranches : « + Une tranche » (au plus 3), « Retirer », et le geste explicite « Pas d'haltères ».
        aucunHaltere: function () { return !brouillon.halteres; },
        surAjouterTranche: function () { brouillon = Profil.ajouterTrancheHalteres(brouillon); erreur = null; redessiner(); },
        surRetirerTranche: function (i) { brouillon = Profil.retirerTrancheHalteres(brouillon, i); erreur = null; redessiner(); },
        surSansHalteres: function () { brouillon = Profil.sansHalteres(brouillon); erreur = null; redessiner(); },
        // 132 (ECRAN-PROFIL §2.4 sexies) — les deux listes d'élastiques et « en kg / par son nom » : les gestes de
        // `profil.js`, purs ; une saisie refusée laisse la feuille ouverte, sa phrase dit pourquoi.
        surAjouterElastique: function (liste, nom, kg) {
          var texteKg = kg === null || kg === undefined ? '' : String(kg).trim();
          var lu = texteKg === '' ? null : Modele.lireNombre(texteKg);
          var r = Profil.ajouterElastique(brouillon, liste, nom, texteKg !== '' && lu === null ? NaN : lu);
          brouillon = r.brouillon;
          erreur = r.erreur;
          redessiner();
        },
        surRetirerElastique: function (liste, i) { brouillon = Profil.retirerElastique(brouillon, liste, i); erreur = null; redessiner(); },
        surDeplacerElastique: function (liste, de, vers) {
          brouillon = Profil.deplacerElastique(brouillon, liste, de, vers);
          erreur = null;
          redessiner();
        },
        surBarreChargee: function (type, oui) { brouillon = Profil.poserBarreChargee(brouillon, type, oui); erreur = null; redessiner(); },
        surParNom: function (parNom) { brouillon = Profil.poserParNom(brouillon, parNom); erreur = null; redessiner(); },
        surValider: function () {
          // 116 (03 #8) — un « jusqu'à » vidé ou illisible n'efface pas les haltères déclarés : la feuille reste
          // ouverte, le plus lourd déclaré revient dans le champ, une phrase dit pourquoi (123 : ligne par ligne).
          var garde = Profil.halteresGardees(profil, brouillon);
          if (garde) {
            brouillon = garde.brouillon;
            erreur = garde.phrase;
            return redessiner();
          }
          var champs = Profil.champsSalle(brouillon);
          if (!champs) {
            erreur = Profil.phraseHalteresHorsBornes(brouillon);
            return redessiner();
          }
          fermerVoile();
          ecrireProfil(champs);
        },
        surEffacer: function () { fermerVoile(); ecrireProfil({ ma_salle: null }); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // « Exercices écartés » : la liste, « Reprendre » sur chacun. La feuille reste ouverte entre deux reprises ; le
  // dernier repris la ferme (la ligne du Profil s'efface, puisqu'elle ne s'affiche pas à vide).
  function ouvrirEcartesProfil() {
    var index = Modele.indexerExercices(local.exercices);
    feuilleProfil = function (cible) {
      var ecartes = Profil.ecartesDe(profil);
      Rendu.rendreFeuilleEcartes(cible, {
        titre: 'Exercices écartés',
        aide: Profil.PHRASE_ECARTES,
        exercices: ecartes.map(function (slug) {
          return { nom: Modele.nommer(index, slug), surReprendre: function () { reprendreEcarte(slug); } };
        }),
        surFermer: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  function reprendreEcarte(slug) {
    var restants = Profil.ecartesDe(profil).filter(function (s) { return s !== slug; });
    var champs = Profil.preparerChamps(profil, { exercices_ecartes: restants }, new Date());
    if (Object.keys(champs).length) ecrireProfil(champs);
    if (!restants.length) return fermerVoile();
    if (feuilleProfil) feuilleProfil($('feuille-contenu'));
  }

  // Les saisies libres. Chacune rend une PHRASE quand elle refuse — jamais un
  // silence, jamais une fermeture. La borne doublée ici est un CHECK de la base.
  // La vérification du pseudo, depuis le Profil, ne retient pas la personne plus longtemps : sans réponse au bout de ce
  // délai (un réseau connecté mais sans données), c'est « on ne sait pas » (ECRAN-PROFIL §5.2) — la feuille se ferme et
  // l'envoi part ; la base reste l'autorité (`envoyerProfilMaintenant`).
  var DELAI_PSEUDO_MS = 4000;

  var SAISIES = {
    taille_cm: {
      titre: 'Taille', type: 'text', inputMode: 'numeric', etiquette: 'En centimètres',
      aide: null,
      lire: function (p) { return p.taille_cm; },
      valider: function (v) {
        if (!String(v).trim()) return { champs: { taille_cm: null } };
        var n = Profil.tailleValide(Modele.lireNombre(v));
        if (n === null) {
          return { erreur: 'Une taille entre ' + Profil.TAILLE_MIN + ' et ' +
                           Profil.TAILLE_MAX + ' cm.' };
        }
        return { champs: { taille_cm: n } };
      }
    },
    date_naissance: {
      titre: 'Date de naissance', type: 'date', etiquette: 'Jour de naissance',
      aide: 'Il n’est jamais affiché à personne d’autre. Il règle la prudence de tes montées de charge, jamais ta charge de départ.',
      lire: function (p) { return p.date_naissance; },
      valider: function (v) {
        if (!String(v).trim()) return { champs: { date_naissance: null } };
        var d = Profil.naissanceValide(String(v).trim(), new Date());
        if (!d) return { erreur: 'Une date de naissance plausible.' };
        return { champs: { date_naissance: d } };
      }
    },
    bio: {
      titre: 'Bio', lignes: 3, max: 280, etiquette: 'Deux lignes sur toi',
      placeholder: 'Powerbuilding, 3 ans',
      aide: 'Tes abonnés et les membres de ta guilde la voient sur ton profil.',
      lire: function (p) { return p.bio; },
      valider: function (v) { return { champs: { bio: String(v).trim() } }; }
    },
    username: {
      titre: 'Pseudo', type: 'text', etiquette: 'Ton pseudo',
      aide: 'Il sert d’identifiant lisible partout. Ton e-mail, lui, reste privé.',
      lire: function (p) { return p.username; },
      valider: function (v) {
        var verdict = Profil.verdictPseudo(v, null, {});
        if (verdict.code === 'vide') return { erreur: 'Un pseudo, même court.' };
        if (verdict.message) return { erreur: verdict.message };
        return { champs: { username: verdict.pseudo } };
      },
      // 60-5 — LA FEUILLE VÉRIFIE AVANT DE SE FERMER (ECRAN-PROFIL §3.1), par la vérification de
      // l'inscription (`Donnees.pseudoPris`, les trois états de §5.2). Pris : un refus, avec ses deux
      // alternatives (celles de l'e-mail du compte), la feuille reste ouverte et RIEN n'est écrit. Libre,
      // ou « on ne sait pas » (hors ligne, la fonction absente) : `null`, la feuille se ferme et l'envoi
      // part — la base reste l'autorité (`envoyerProfilMaintenant`). Son propre pseudo n'est « pris » que
      // par lui-même : il ne se redemande pas.
      verifier: async function (champs) {
        var nom = champs.username;
        if (profil && Profil.normaliserPseudo(profil.username) === nom) return null;
        var pris = null, minuteur = null;
        var silence = new Promise(function (resolve) { minuteur = racine.setTimeout(function () { resolve(null); }, DELAI_PSEUDO_MS); });
        try { pris = await Promise.race([Donnees.pseudoPris(nom), silence]); } catch (e) { pris = null; }
        racine.clearTimeout(minuteur);
        var email = (sessionActive && sessionActive.user && sessionActive.user.email) || '';
        var verdict = Profil.verdictPseudo(nom, pris, { email: email });
        return verdict.code === 'pris' ? verdict.message : null;
      }
    }
  };

  function ouvrirSaisieProfil(cle) {
    var def = SAISIES[cle];
    var cetteFeuille = function (cible) {
      Rendu.rendreFeuilleSaisie(cible, {
        titre: def.titre, aide: def.aide, etiquette: def.etiquette,
        type: def.type, inputMode: def.inputMode, lignes: def.lignes,
        max: def.max, placeholder: def.placeholder,
        valeur: def.lire(profil || {}),
        surValider: function (v) {
          var r = def.valider(v);
          if (r.erreur) return r.erreur;
          var poser = function () { fermerVoile(); ecrireProfil(r.champs); return null; };
          if (!def.verifier) return poser();
          // 60-5 — la saisie qui se vérifie attend la réponse, feuille ouverte. Fermée entre-temps
          // (« Annuler », le retour d'Android), elle n'écrit RIEN : la personne est partie.
          return def.verifier(r.champs).then(function (refus) {
            if (feuilleProfil !== cetteFeuille) return null;
            return refus || poser();
          });
        },
        surAnnuler: fermerVoile
      });
    };
    feuilleProfil = cetteFeuille;
    ouvrirFeuilleProfil();
  }

  // 92 — LA PESÉE DEPUIS LE PROFIL (ECRAN-PROFIL §2.4, 14/10/2026) : le poids et le jour (aujourd'hui par
  // défaut). Elle s'écrit par `poserPesee` — le chemin du questionnaire, le seul — et ses bornes sont celles
  // du questionnaire (`Poids.peseeDuProfil` → `poidsValide`).
  function ouvrirPeseeProfil() {
    var derniere = Poids.resume(local.pesees);
    feuilleProfil = function (cible) {
      Rendu.rendreFeuillePesee(cible, {
        poids: derniere ? Modele.nombreSigne(derniere.poids) : '',
        jour: jourDuJour(), max: jourDuJour(),
        surValider: function (texte, jour) {
          var r = Poids.peseeDuProfil(Modele.lireNombre(texte), jour, jourDuJour());
          if (r.erreur) return r.erreur;
          fermerVoile();
          poserPesee(r.pesee).catch(function () {}).then(function () {
            if (ecranCourant === 'profil') rendreProfilEcran();
            else if (ecranCourant === 'progression') rendreProgression();
          });
          return null;
        },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // Promis à l'inscription : « Tu le changeras depuis ton profil. » C'est aussi
  // là qu'atterrit un lien « mot de passe oublié » — la session de récupération
  // est ouverte, il ne reste qu'à poser le nouveau mot de passe.
  //
  // 70 — `pourRecuperation` : ouverte d'elle-même par un lien de récupération,
  // titrée « Choisis ton nouveau mot de passe ». Un questionnaire non rempli
  // attend DERRIÈRE elle (`recuperation`) : fermée sans valider, il prend la
  // suite ; validée, la confirmation reste sous les yeux et il attendra la
  // prochaine ouverture.
  function ouvrirMotDePasseProfil(recup) {
    var pourRecuperation = recup === true;
    var valide = false;
    var finRecuperation = function () { if (pourRecuperation) recuperation = null; };
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleSaisie(cible, {
        titre: pourRecuperation ? 'Choisis ton nouveau mot de passe' : 'Mot de passe',
        etiquette: 'Nouveau mot de passe',
        type: 'password', autocomplete: 'new-password',
        aide: Profil.MDP_MIN + ' caractères minimum.',
        valeur: '',
        surValider: function (v) {
          if (!Profil.mdpValide(v)) return Profil.MDP_MIN + ' caractères minimum.';
          valide = true;
          fermerVoile();
          // 70 — LA PHRASE EST UN ÉTAT DU PROFIL (`noteProfil`), PAS UN NŒUD POSÉ UNE FOIS : le
          // changement émet `USER_UPDATED`, l'app ré-entre et re-rend le Profil, ce qui l'effaçait.
          Auth.changerMotDePasse(v).then(function () {
            finRecuperation();
            // 138 (§3.5) — après une RÉCUPÉRATION, sur iPhone hors de l'app : la phrase qui dit où se connecter, à la place
            // de la seule note. Ailleurs (Android, ordinateur, app installée, ligne « Mot de passe »), la note d'avant.
            if (pourRecuperation && surIphone()) { noteProfil = null; bandeauMotDePasse = true; }
            else noteProfil = { classe: 'vide', texte: 'Mot de passe changé.' };
            rendreProfilEcran();
          }).catch(function (e) {
            finRecuperation();
            noteProfil = { classe: 'feuille-err', texte: texteErreur(e) };
            rendreProfilEcran();
          });
          return null;
        },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil(function () {
      if (!pourRecuperation || valide) return;
      finRecuperation();
      ouvrirQuestionnaireSiDu();
    });
  }

  // La phrase que le Profil porte en tête après un changement de mot de passe : elle survit aux
  // re-rendus (synchronisation, ré-entrée) et s'en va quand on quitte l'écran (`montrer`).
  var noteProfil = null;
  // 138 — « Ton mot de passe est changé. » (iPhone, hors de l'app) : un état du Profil, comme la note ; « Compris » le ferme.
  var bandeauMotDePasse = false;
  // 116 (03 #6) — une colonne que la base a refusée pour de bon (`envoyerProfilMaintenant`) : `{ texte, vu }`, ou `null`.
  var refusProfil = null;

  // ⚠️ LA MÊME FEUILLE, LE MÊME VOILE que la séance. Le retour d'Android la
  // ferme sans qu'on l'écrive, et le mode Réorganiser ne la traverse pas.
  var feuilleProfil = null;

  function ouvrirFeuilleProfil(apres) {
    if (!feuilleProfil) return;
    feuilleProfil($('feuille-contenu'));
    ouvrirVoile($('feuille-seance'), function () { feuilleProfil = null; if (apres) apres(); });
  }

  // ── L'écran ──────────────────────────────────────────────────────────────

  // Le formateur unique (`modele.js`, PR 7).
  function nombreGroupe(n) { return Modele.nombreGroupe(n); }

  function ligneChoix(cle, libelle, sous) {
    return { libelle: libelle, sous: sous,
      valeur: Profil.libelleDe(listeDe(cle), valeurProfil(cle)),
      surChoix: function () { ouvrirChoixProfil(cle); } };
  }

  function rendreProfilEcran() {
    montrer('profil', Routeur.PROFIL);
    var p = profil || {};
    var resumePoids = Poids.resume(local.pesees);
    var stats = Profil.statsDe(local.seances, local.series, new Date(), local.exercices);

    // 64B (JEU-V1 §9.3) — jeu allumé : l'hexagone du niveau et son cadre à la place de l'initiale, le titre et le
    // niveau sous le nom, la vitrine ; éteint, l'initiale revient et rien du jeu ne se montre.
    var jeu = null;
    if (jeuAllume()) {
      try { jeu = etatDuJeuCourant(); } catch (e) { jeu = null; }
    }
    Rendu.rendreBandeauJeu($('profil-rond'), $('profil-jeu'), jeu, Profil.initiale(p.username));
    $('profil-nom').textContent = p.username || 'Ton profil';
    $('profil-sous').textContent =
      Profil.sousTitre(p, resumePoids ? resumePoids.poids : null, new Date());

    var exos = faits.compterExercices(corpus());

    // 173 — une section « du groupe » : la même section, avec le nom de son groupe (les sections absentes — `null` — restent absentes).
    function dansLeGroupe(nom, sections) {
      return sections.map(function (sec) { return sec ? Object.assign({}, sec, { groupe: nom }) : sec; });
    }

    Rendu.rendreProfil($('profil-corps'), {
      // 60-2a — « Terminer mon questionnaire › » en tête, tant qu'il n'est pas rempli.
      questionnaire: Profil.ligneQuestionnaire(p, ouvrirQuestionnaire),
      kpis: [
        { valeur: nombreGroupe(stats.seances), libelle: 'séances' },
        { valeur: nombreGroupe(stats.series), libelle: 'séries' },
        { valeur: Profil.libelleAnciennete(stats.annees), libelle: 'd’historique' }
      ],
      // 173 (refonte « Vivant », 25/10/2026) — LE PROFIL RANGÉ PAR FRÉQUENCE : « Mon coach », « Mon programme », « Moi », « Mon compte »,
      // puis, en bas comme avant, mes exercices, mes données, le jeu, quitter, supprimer. Les mêmes sections, les mêmes lignes, les mêmes
      // feuilles : seule la `groupe` de chaque section change (le titre de groupe se dessine une fois, devant la première de ses sections).
      sections: [].concat(
        dansLeGroupe('Mon coach', [
          // 60-1 — « Progresser » ou « Juste un carnet » : la section se construit dans `profil.js` (la phrase dépend du choix).
          Profil.sectionIntention(p, ecrireProfil),
          // ── MOTEUR §9.8 / ECRAN-PROFIL §2.3 — « TON RYTHME » (Prudent / Normal / Franc) ──────────────────────────
          // Le MÊME sélecteur que l'intention (§2.3, tranché le 19/09). ⚠️ LA SECTION SE CONSTRUIT DANS `profil.js`, ET C'EST VOULU :
          // elle porte une RÈGLE — absente en Entretenir — et une COLONNE écrite. `null` en Entretenir : `rendreProfil` saute les absentes.
          Profil.sectionRythme(p, ecrireProfil),
          // Le poids n'est pas un champ du profil : c'est la DERNIÈRE PESÉE, datée (« 96,8 kg · mardi »). 92 (14/10/2026) — la ligne
          // SAISIT une pesée, par `poserPesee`, le chemin du questionnaire ; la courbe reste sous Progression.
          { titre: 'TON POIDS', lignes: [
            { libelle: 'Poids',
              valeur: resumePoids ? Modele.nombreSigne(resumePoids.poids) + ' kg · ' +
                Modele.quand(resumePoids.date, jourDuJour()) : null,
              surChoix: ouvrirPeseeProfil }
          ] },
          // MOTEUR §9.16 (49-U11) — « TA PHASE » : le même sélecteur, la même écriture (`ecrireProfil`, par la file du profil).
          Profil.sectionPhase(p, ecrireProfil, undefined, seriesRevenues ? Moteur.PHRASE_SERIES_REVENUES : null),
          // 60-2a — « TON BUT » (le but d'entraînement, les priorités) : les réponses du questionnaire, une ligne à la fois.
          Profil.sectionBut(p, ouvrirReponseProfil),
          // ⚠️ « TA SEMAINE », ET PLUS « RYTHME VISÉ » (ECRAN-PROFIL §2.4, renommé le 19/09) : « rythme » désigne le réglage de progression.
          { titre: 'TA SEMAINE', lignes: [
            { libelle: 'Séances par semaine', valeur: p.seances_par_semaine || null,
              surChoix: function () { ouvrirRythmeProfil('seances_par_semaine'); } },
            { libelle: 'Durée d’une séance',
              valeur: p.duree_seance_min ? p.duree_seance_min + ' min' : null,
              surChoix: function () { ouvrirRythmeProfil('duree_seance_min'); } },
            // 60-2a — les quatre réponses de l'écran « Temps » (leurs phrases sont dans la feuille).
            Profil.ligneTemps(p, ouvrirReponseProfil)
          ] },
          // 201 — « Les mots du coach » : la liste fixe du moteur, une phrase chacun, la source repliée sous son mot.
          { titre: 'LES MOTS DU COACH', lignes: [
            { libelle: 'Les mots du coach', sansValeur: true, sous: Moteur.lexique().length + ' mots, une phrase chacun',
              surChoix: ouvrirMotsDuCoach }
          ] }
        ]),
        dansLeGroupe('Mon programme', [
          // 60-4 (ECRAN-PROFIL §4 bis) — le programme construit : la zone à ménager, les exercices écartés (la ligne
          // s'efface quand il n'y en a plus), « Refaire mon programme ».
          { titre: 'CE QUE JE FAIS', lignes: [
            ligneChoix('materiel', 'Matériel'),
            // 108 (MOTEUR §10 bis, ECRAN-PROFIL §2.4 quinquies) — Ma salle ; 163 : les élastiques seulement, et seulement si un
            // exercice à l'élastique est dans une routine, l'historique ou la séance en cours.
            Profil.ligneSalle(p, ouvrirSalleProfil),
            // 193-4 (MOTEUR §9.32) — « Semaine de test » : son état, la proposition hors programme, l'annulation.
            ligneSemaineDeTest()
          ].filter(Boolean).concat(Profil.lignesProgramme(p, ouvrirProgrammeProfil)) }
        ]),
        dansLeGroupe('Moi', [
          { titre: 'MON CORPS', lignes: [
            { libelle: 'Taille', valeur: p.taille_cm ? p.taille_cm + ' cm' : null,
              surChoix: function () { ouvrirSaisieProfil('taille_cm'); } },
            { libelle: 'Date de naissance',
              valeur: p.date_naissance ? Rendu.dateCourte(p.date_naissance) : null,
              surChoix: function () { ouvrirSaisieProfil('date_naissance'); } },
            ligneChoix('sexe', 'Sexe')
          ] },
          { titre: 'DEPUIS QUAND', lignes: [
            ligneChoix('anciennete', 'Entraînement régulier')
          ] }
        ]),
        dansLeGroupe('Mon compte', [
          { titre: 'L’APP', lignes: (surIphone() ? [
            // 138 (§3.5) — en tête, seulement sur iPhone hors de l'app : la feuille « Comment faire ».
            { libelle: Auth.PHRASES_IPHONE.ligne, valeur: 'Comment faire', surChoix: ouvrirFeuilleInstaller }
          ] : []).concat([
            // 60-3b — et, « pris entre-temps », la phrase qui le dit tant qu'aucun pseudo n'est posé.
            Profil.lignePseudo(p, pseudoPrisSignale(), function () { ouvrirSaisieProfil('username'); }),
            { libelle: 'Bio', valeur: p.bio || null,
              surChoix: function () { ouvrirSaisieProfil('bio'); } },
            // L'e-mail se LIT, il ne se change pas d'ici : le changer demande une confirmation sur les deux adresses.
            { libelle: 'E-mail de connexion',
              valeur: (sessionActive && sessionActive.user && sessionActive.user.email) || null },
            // 70 — appelée SANS argument : le rendu passe l'événement du clic, qui n'est pas une récupération.
            { libelle: 'Mot de passe', valeur: '••••••••', surChoix: function () { ouvrirMotDePasseProfil(false); } }
          ]) }
        ]),
        // En bas, comme avant : mes exercices, mes données (le jeu, quitter et supprimer suivent, dans le rendu).
        [{ titre: 'MES EXERCICES', lignes: [
          { libelle: 'Tous mes exercices', sansValeur: true,
            sous: exos.total + ' au catalogue · ' + exos.faits + ' déjà faits',
            surChoix: function () { allerA(Routeur.EXERCICES, {}); rendreMesExercices(); } }
        ] },
        // 69 (ECRAN-PROFIL §2.4 quater) — « MES DONNÉES », juste après « MES EXERCICES ».
        { titre: 'MES DONNÉES', lignes: [
          { libelle: 'Importer depuis Hevy', sansValeur: true,
            surChoix: function () { allerA(Routeur.IMPORT, {}); ouvrirImport(); } }
        ] }]
      ),
      // 64B — la vitrine (les trois succès les plus rares, décidés par le jeu), et en bas l'interrupteur, qui
      // écrit par le chemin du profil : local d'abord, l'écran suit tout de suite, hors ligne compris.
      vitrine: jeu ? Jeu.vitrine(jeu).map(succesDecrit) : null,
      jeu: { actif: jeuAllume(), surBascule: function () { ecrireProfil({ jeu_actif: !jeuAllume() }); } },
      surQuitter: demanderDeconnexion,
      surSupprimer: demanderSuppressionCompte
    });
    if (noteProfil) $('profil-corps').insertBefore(Rendu.el('p', noteProfil.classe, noteProfil.texte), $('profil-corps').firstChild);
    if (bandeauMotDePasse) {
      var pm = Auth.PHRASES_IPHONE.motDePasse;
      $('profil-corps').insertBefore(Rendu.rendreBandeauReprise(Rendu.el('div', 'bandeau-profil'), {
        quoi: pm.quoi, sujet: pm.sujet, libelleReprendre: 'Compris',
        surReprendre: function () { bandeauMotDePasse = false; rendreProfilEcran(); }
      }), $('profil-corps').firstChild);
    }
    if (refusProfil && refusProfil.texte) {
      $('profil-corps').insertBefore(Rendu.el('p', 'vide', refusProfil.texte), $('profil-corps').firstChild);
      refusProfil.vu = true;
    }
  }

  // 201 — Profil › Les mots du coach.
  function ouvrirMotsDuCoach() {
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleMots(cible, { mots: Moteur.lexique(), surFermer: fermerVoile });
    };
    ouvrirFeuilleProfil();
  }

  // ── Quitter, et supprimer ────────────────────────────────────────────────

  function demanderDeconnexion() {
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleConfirmer(cible, {
        titre: 'Quitter',
        aide: 'Tes données restent en ligne. Elles reviendront à la prochaine ' +
              'connexion — mais cet appareil les oublie, donc il te faudra du réseau.',
        libelle: 'Quitter',
        surConfirmer: function () { fermerVoile(); quitterSansRienPerdre(); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  // ⚠️ 59-2 — « QUITTER » NE PERD PLUS RIEN EN SILENCE. Il vidait la file
  // d'envoi sans prévenir : une séance saisie hors ligne et pas encore montée
  // était perdue. L'enchaînement vit dans `THQuitter.quitter` (testé) : envoyer
  // d'abord si le réseau est là, puis quitter si la file s'est vidée, sinon la
  // fenêtre. Seul « Quitter quand même » vide la file (`deconnecter`).
  async function quitterSansRienPerdre() {
    // 117 (audit du 16/10, 06 #6) — les files GARDÉES pour un autre compte de cet appareil partent aussi avec
    // « Quitter » : la fenêtre les compte, rien ne se perd sans qu'elle le dise.
    var gardees = [], autresGardes = 0;
    try { gardees = Attente.entreesGardees(await Cache.lireFilesGardees()); } catch (e) { gardees = []; }
    // 118 — et ce qui attend hors de la file pour un autre compte (sa réponse de profil, ses messages du groupe).
    try { autresGardes = Attente.compterGardesAutres(await Cache.lireGardesAutres()); } catch (e) { autresGardes = 0; }
    return Quitter.quitter({
      file: function () { return attente.concat(gardees); },
      // 60-2c : une réponse de profil pas encore envoyée (hors file) compte aussi.
      profil: function () { return profilAEnvoyer; },
      // 118 (audit 06 #3, suite de 117) — les messages du groupe écrits hors ligne (`grp.file`, leur propre file)
      // comptent aussi : « Quitter » les effaçait sans les dire.
      autres: function () { return grp.file.length + autresGardes; },
      enLigne: function () { return !(racine.navigator && racine.navigator.onLine === false); },
      envoyer: envoyerAvantDeQuitter,
      fenetre: montrerFenetreDeSortie,
      deconnecter: deconnecter
    });
  }

  // La vidange HABITUELLE, attendue jusqu'au bout : une vidange déjà en cours
  // est attendue, puis on en lance une. Bornée à 15 s : un réseau qui ne répond
  // pas ne fige pas « Quitter » — ce qui n'est pas parti, la fenêtre le dira.
  // 60-2c : le PROFIL part avec elle (`envoyerProfil`, derrière un envoi déjà en
  // vol), dans la MÊME course de 15 s — jamais un `await` nu qui figerait « Quitter ».
  async function envoyerAvantDeQuitter() {
    var fin = Date.now() + 15000;
    var attendre = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    // Le profil ne dépend pas de la vidange (sa propre chaîne d'envoi) : il PART TOUT DE SUITE, pendant
    // qu'on attend la vidange en cours — sinon une vidange lente lui mangeait tout son budget de 15 s.
    var profilEnvoye = profilAEnvoyer ? envoyerProfil().catch(function () {}) : null;
    // 118 — les messages du groupe écrits hors ligne partent aussi, dans la même course de 15 s.
    var messagesEnvoyes = grp.file.length ? envoyerFileGroupe().catch(function () {}) : null;
    while (vidangeEnCours && Date.now() < fin) await attendre(100);
    var envois = [vidanger()];
    if (profilEnvoye) envois.push(profilEnvoye);
    if (messagesEnvoyes) envois.push(messagesEnvoyes);
    await Promise.race([Promise.all(envois), attendre(Math.max(0, fin - Date.now()))]);
  }

  // La fenêtre des séances pas encore envoyées (la maquette du 07/10/2026).
  // Rend 'rester' ou 'quitter'. Fermée sans choisir (retour, tap à côté), elle
  // vaut « Rester » : on ne perd jamais rien sans l'avoir demandé.
  function montrerFenetreDeSortie(vue) {
    return new Promise(function (resoudre) {
      var tranche = false;
      var choisir = function (c) { if (tranche) return; tranche = true; resoudre(c); };
      feuilleProfil = function (cible) {
        Rendu.rendreFeuilleSortie(cible, Object.assign({}, vue, {
          surRester: function () { choisir('rester'); fermerVoile(); },
          surQuitter: function () { choisir('quitter'); fermerVoile(); }
        }));
      };
      feuilleProfil($('feuille-contenu'));
      ouvrirVoile($('feuille-seance'), function () { feuilleProfil = null; choisir('rester'); });
    });
  }

  // ⚠️ LA CONFIRMATION DIT CE QUI PART, en chiffres réels. « Es-tu sûr ? » ne
  // dit rien ; « 1 221 séances et 28 103 séries » se comprend sans réfléchir.
  function demanderSuppressionCompte() {
    var stats = Profil.statsDe(local.seances, local.series, new Date(), local.exercices);
    feuilleProfil = function (cible) {
      Rendu.rendreFeuilleConfirmer(cible, {
        titre: 'Supprimer mon compte',
        aide: 'Partent définitivement : ton profil, tes ' +
              nombreGroupe(stats.seances) + ' séances et leurs ' +
              nombreGroupe(stats.lignes) + ' séries, tes ' +
              (local.pesees || []).length + ' pesées, tes routines. ' +
              'Rien n’est conservé et rien ne se récupère.',
        libelle: 'Supprimer définitivement',
        danger: true,
        surConfirmer: function () { fermerVoile(); supprimerCompte(); },
        surAnnuler: fermerVoile
      });
    };
    ouvrirFeuilleProfil();
  }

  async function supprimerCompte() {
    var id = userId();
    if (!id) return;
    Rendu.message($('profil-corps'), 'Suppression en cours…', 'rien');
    try {
      // La fonction de base sait ce qui part — on ne réécrit pas une suppression
      // en plusieurs DELETE côté client : c'est ainsi qu'on en oublie un.
      await Donnees.supprimerCompte(id);
    } catch (e) {
      rendreProfilEcran();
      $('profil-corps').insertBefore(
        Rendu.el('p', 'feuille-err', 'Suppression impossible : ' + texteErreur(e)),
        $('profil-corps').firstChild);
      return;
    }
    // Le local part avec le distant. `deconnecter` vide déjà tout le cache,
    // magasin `meta` compris — donc le profil, la file et le brouillon.
    profil = null; profilAEnvoyer = false; refusProfil = null;
    await deconnecter();
  }

  // ══ IMPORTER DEPUIS HEVY (69, ECRAN-PROFIL §2.4 quater) ═════════════════
  //
  // Coller le texte que Hevy partage, ou donner l'export CSV : les deux mènent
  // au MÊME aperçu (`THImportHevy`, pur), et rien n'est écrit avant
  // « Importer ». Deux règles tiennent tout :
  //   · une séance déjà là n'est JAMAIS remplacée (verdict `deja_la`) ;
  //   · un nom inconnu n'est JAMAIS deviné : la personne le rattache par le
  //     catalogue (le choix s'écrit dans `alias_exercice`, par la file), ou le
  //     laisse de côté.
  // L'écriture passe par la file d'envoi, comme une séance terminée — la
  // séance et ses séries par les branches existantes (`SESSIONS`, `SETS`), ses
  // records par `poserJournal` — avec des identifiants tirés du nom
  // (`Moteur.idDImport`). Aucun pari du coach n'est écrit.
  var importHevy = null;
  // Un paquet : 25 séances posées d'un coup (une écriture de la file), puis on
  // attend qu'elles soient montées avant le suivant — la file ne porte jamais
  // tout un historique, et « 312 séances sur 601 » dit ce qui est en base.
  var SEANCES_PAR_PAQUET = 25, ATTENTE_ENVOI_MS = 250;

  function importNeuf() { return { etape: 'choix', texte: '', erreur: null, occupe: false }; }

  function ouvrirImport() {
    importDuQuestionnaire = null;
    if (!importHevy || importHevy.etape !== 'en_cours') importHevy = importNeuf();
    rendreImportEcran();
  }

  // 187 (A2) — L'IMPORT DEPUIS LE QUESTIONNAIRE. Le même écran, le même code ; seuls le retour et le bouton de fin
  // changent. `importDuQuestionnaire` garde les réponses (déjà écrites) : « Reprendre » rouvre le questionnaire à
  // l'écran 3a si des séances sont arrivées, sinon à celui qui suit. Rien n'est dupliqué.
  var importDuQuestionnaire = null;
  function ouvrirImportDepuisLeQuestionnaire() {
    var q = questionnaire;
    if (!q) return;
    importDuQuestionnaire = { rep: q.rep };
    if (!importHevy || importHevy.etape !== 'en_cours') importHevy = importNeuf();
    rendreImportEcran();
  }

  function reprendreLeQuestionnaire() {
    var p = importDuQuestionnaire;
    importDuQuestionnaire = null;
    if (importHevy && importHevy.etape !== 'en_cours') importHevy = null;
    if (!p) return;
    var avec = local.seances.length > 0 && p.rep.historique !== 'debutant';
    var visibles = Questionnaire.ecransVisibles({ aDesSeances: local.seances.length > 0, historique: p.rep.historique,
      programme: p.rep.programme, depuis: p.rep.depuis, objectif: p.rep.objectif, aDesRoutines: aDesRoutinesConnu() });
    var ecran = avec ? Questionnaire.SAIT : Questionnaire.ecranSuivant(visibles, Questionnaire.ANCIENNETE);
    ouvrirQuestionnaire({ ecran: ecran || Questionnaire.RECAP, rep: p.rep });
  }

  function importEnLigne() {
    return !(racine.navigator && racine.navigator.onLine === false) && !!userId();
  }

  // Toutes les séances de la personne, telles que l'anti-doublon les lit.
  function baseDeLaPersonne() {
    return (local.seances || []).filter(Boolean).map(function (s) {
      var slugs = {};
      seriesDe(s.id).forEach(function (x) { if (x && x.exercise_slug) slugs[x.exercise_slug] = true; });
      return { source_ref: s.source_ref || null, debut: s.debut, fin: s.fin || null, slugs: Object.keys(slugs) };
    });
  }

  function indexDeLImport() { return Import.indexDesNoms(importHevy.sources); }

  async function lireImport(genre, texte) {
    var imp = importHevy;
    if (!imp || imp.occupe) return;
    var M = Import.MESSAGES;
    imp.erreur = null;
    var lues = null, enAnglais = false;
    try { lues = genre === 'csv' ? Import.lireCsv(texte) : Import.lireTexte(texte); }
    catch (e) { lues = null; enAnglais = !!(e && e.enAnglais); }
    // ⚠️ UNE SÉANCE COLLÉE SANS SON LIEN n'a pas de référence (`hevy:<id>`) :
    // ni l'anti-doublon ni l'identifiant tiré du nom ne la tiendraient. Le
    // texte est refusé en entier — jamais à moitié lu.
    if (!lues || !lues.length || lues.some(function (l) { return !l.ref; })) {
      // 118 (audit du 16/10, 03 #12) — un Hevy réglé en anglais ne se dit pas « pas un export ».
      imp.erreur = enAnglais ? (genre === 'csv' ? M.fichierAnglais : M.texteAnglais) : genre === 'csv' ? M.fichier : M.texte;
      return rendreImportEcran();
    }
    // L'aperçu lit les noms d'exercices EN BASE : il demande une connexion (et
    // le catalogue, sans lequel tout nom serait « à rattacher »).
    if (!importEnLigne() || !local.exercices.length) { imp.erreur = M.connexion; return rendreImportEcran(); }
    imp.occupe = true;
    rendreImportEcran();
    var g = generation;
    var communs, miens;
    try {
      communs = await Donnees.aliasCommuns();
      miens = await Donnees.mesAlias();
    } catch (e) {
      if (!generationValide(g) || importHevy !== imp) return;
      imp.occupe = false;
      imp.erreur = M.connexion;
      return rendreImportEcran();
    }
    if (!generationValide(g) || importHevy !== imp) return;
    imp.occupe = false;
    imp.sources = { catalogue: local.exercices, communs: communs || [], miens: miens || [] };
    imp.fuseau = Import.fuseauDuTelephone();
    imp.lignes = Import.apercu(lues, { sources: imp.sources, base: baseDeLaPersonne(), fuseau: imp.fuseau });
    imp.ignores = {};
    imp.etape = 'apercu';
    rendreImportEcran();
  }

  async function lireFichierHevy() {
    var champ = $('fichier-hevy');
    var f = champ && champ.files && champ.files[0];
    if (!f || !importHevy) return;
    var texte = null;
    try { texte = await f.text(); } catch (e) { texte = null; }
    if (texte === null) {
      importHevy.erreur = Import.MESSAGES.fichier;
      return rendreImportEcran();
    }
    return lireImport('csv', texte);
  }

  // Le rattachement d'un nom : le choix vaut pour cet import (l'index de
  // l'aperçu) ET pour les suivants (`alias_exercice`, par la file).
  async function rattacherNom(nom, slug) {
    var imp = importHevy;
    if (!imp || imp.etape !== 'apercu' || !slug) return;
    imp.sources.miens = (imp.sources.miens || []).concat([{ alias: nom, exercise_slug: slug }]);
    delete imp.ignores[nom];
    // 118 (audit du 16/10, 03 #2) — le nom rattaché donne un exercice à sa séance : son verdict se refait (une
    // séance faite aussi dans l'app devient « sans doute la même », décochée — jamais importée en double).
    imp.lignes = Import.recalculer(imp.lignes, { sources: imp.sources, base: baseDeLaPersonne() });
    rendreImportEcran();
    // `alias_exercice_alias_check` : non vide, 120 caractères au plus. Un nom
    // plus long vaut pour cet import, sans être retenu — l'écrire bloquerait la
    // file sur un 23514 (définitif).
    var alias = String(nom).trim();
    if (alias && alias.length <= 120) await poserAlias(alias, slug);
  }

  // ⚠️ LE SEUL CHEMIN D'UNE ENTRÉE `alias_exercice` dans la file (la garde
  // d'architecture le dit). L'identifiant d'entrée est le nom NORMALISÉ, comme
  // la colonne générée `alias_norme` : deux choix pour le même nom se
  // compressent, le dernier gagne.
  function poserAlias(alias, slug) {
    return poser({ table: Attente.ALIAS, op: Attente.UPSERT, id: Import.norme(alias),
                   donnees: { user_id: userId(), alias: alias, exercise_slug: slug } });
  }

  function ignorerNom(nom) {
    if (!importHevy || importHevy.etape !== 'apercu') return;
    importHevy.ignores[nom] = true;
    rendreImportEcran();
  }

  // 147 — « Sans heure de fin » (défaut) ou « Garder <durée> », pour une séance de plus de 5 h.
  function choisirFinImport(i, sansFin) {
    var l = importHevy && importHevy.lignes && importHevy.lignes[i];
    if (!l || !l.duree_longue || l.verdict === 'deja_la') return;
    l.sans_fin = !!sansFin;
    rendreImportEcran();
  }

  function cocherImport(i) {
    var l = importHevy && importHevy.lignes && importHevy.lignes[i];
    if (!l || l.verdict === 'deja_la') return;
    l.coche = !l.coche;
    rendreImportEcran();
  }

  // Poser plusieurs intentions, puis UNE écriture de la file : un paquet de 25
  // séances, c'est 50 entrées, et `Cache.ecrireAttente` réécrit toute la file.
  async function poserPaquet(ops) {
    ops.forEach(function (op) { attente = Attente.poser(attente, op); });
    try { await Cache.ecrireAttente(attente); }
    catch (e) { console.warn('File non persistée :', texteErreur(e)); direSauvegardeImpossible(); }
    rendreEtatSync();
    vidanger();
  }

  // Le pendant d'`adopterLocalement`, pour un paquet : les séances importées
  // rejoignent le cache de lecture tout de suite (et l'anti-doublon d'un import
  // repris les reconnaît).
  function adopterImportees(modeles) {
    var lignes = [], series = [];
    modeles.forEach(function (m) {
      lignes.push(Seance.ligneSession(m));
      Seance.lignes(m).forEach(function (l) { series.push(l); });
    });
    local.seances = Sync.fusionner(local.seances, lignes);
    local.series = Sync.fusionner(local.series || [], series);
    rangerSeances();
    indexerParSeance();
    recalculerEtats();
    Cache.remplacerTout('seances', local.seances).catch(function () {});
    Cache.ecrireLot('series', series).catch(function () {});
  }

  // Attend que les séances d'un paquet soient montées. `connexion` : le réseau
  // est parti, ou un envoi a échoué (ce qui est posé reste dans la file et
  // partira) ; `bloque` : un refus définitif.
  async function attendreEnvoi(ids, g) {
    var vise = {};
    ids.forEach(function (id) { vise[id] = true; });
    for (;;) {
      if (!generationValide(g)) return 'arret';
      var reste = (attente || []).filter(function (e) {
        return e && (e.table === Attente.SESSIONS || e.table === Attente.SETS) && vise[e.id];
      });
      if (!reste.length) return 'ok';
      if (reste.some(function (e) { return !!e.bloquee; })) return 'bloque';
      if (!importEnLigne() || reste.some(function (e) { return (e.essais || 0) > 0; })) return 'connexion';
      await new Promise(function (r) { setTimeout(r, ATTENTE_ENVOI_MS); });
      vidanger();
    }
  }

  function serieParRang(liste) { return function (rang) { return liste[rang - 1]; }; }

  async function importerHevy() {
    var imp = importHevy;
    if (!imp || imp.etape !== 'apercu') return;
    var index = indexDeLImport();
    if (!Import.pretAImporter(imp.lignes, index, imp.ignores)) return;
    if (!importEnLigne()) { imp.erreur = Import.MESSAGES.connexion; return rendreImportEcran(); }
    var uid = userId();
    var g = generation;
    // ⚠️ LES RECORDS : seulement pour une séance plus récente que la dernière
    // séance déjà là (`Import.avecRecords`). La borne est relevée AVANT
    // d'écrire quoi que ce soit : les séances déjà là, telles qu'elles sont.
    var dejaLa = (local.seances || []).slice();
    var choisies = imp.lignes.filter(function (l) { return l.coche && l.verdict !== 'deja_la'; })
      .map(function (l) { return Object.assign({}, l.seance, { sans_fin: !!l.sans_fin }); })   // 147
      .sort(function (a, b) { return Date.parse(a.debut) - Date.parse(b.debut); });
    var resultat = {
      importees: 0,
      dejaLa: imp.lignes.filter(function (l) { return l.verdict === 'deja_la'; }).length,
      deCote: imp.lignes.filter(function (l) { return !l.coche && l.verdict !== 'deja_la'; }).length,
      arret: null
    };
    imp.etape = 'en_cours';
    imp.progression = { fait: 0, total: choisies.length };
    rendreImportEcran();
    for (var p = 0; p < choisies.length; p += SEANCES_PAR_PAQUET) {
      if (!generationValide(g)) return;
      if (!importEnLigne()) { resultat.arret = 'connexion'; break; }
      var paquet = choisies.slice(p, p + SEANCES_PAR_PAQUET);
      var ops = [], modeles = [], prets = [];
      for (var k = 0; k < paquet.length; k++) {
        var s = paquet[k];
        var n = Import.seriesAEcrire(s, index);
        var idsSeries = [];
        for (var r = 1; r <= n; r++) idsSeries.push(await Moteur.idDImport(uid, s.ref, r));
        prets.push({ s: s, ids: { seance: await Moteur.idDImport(uid, s.ref), serie: serieParRang(idsSeries) } });
      }
      // ⚠️ 118 (audit du 16/10, 03 #3) — UNE SÉANCE DÉJÀ EN BASE N'EST JAMAIS RÉÉCRITE. L'aperçu ne voit que le cache
      // de l'appareil : un cache incomplet jugeait « nouvelle » une séance déjà importée ailleurs (même identifiant),
      // et son envoi réécrivait la séance et ses séries — une charge corrigée revenait, une série supprimée
      // réapparaissait. La base est donc lue avant d'écrire chaque paquet ; ce qu'elle a déjà est « déjà là ». Sans
      // réponse, rien ne part (l'import s'arrête, comme hors réseau).
      var enBase;
      try {
        enBase = await Donnees.seancesDejaEnBase(prets.map(function (x) { return x.ids.seance; }),
          prets.map(function (x) { return x.s.ref; }));
      } catch (e) {
        if (!generationValide(g)) return;
        resultat.arret = 'connexion';
        break;
      }
      if (!generationValide(g)) return;
      var dejaEnBase = {}, refsEnBase = {};
      (enBase || []).forEach(function (x) {
        if (!x) return;
        dejaEnBase[x.id] = true;
        if (x.source_ref) refsEnBase[x.source_ref] = true;
      });
      for (var q = 0; q < prets.length; q++) {
        var lue = prets[q].s, idsLue = prets[q].ids;
        if (dejaEnBase[idsLue.seance] || refsEnBase[lue.ref]) { resultat.dejaLa++; continue; }
        var m = Import.seanceAEcrire(lue, idsLue, index, uid);
        // Tous ses exercices laissés de côté : une séance vide n'est pas importée.
        if (!m) { resultat.deCote++; continue; }
        ops.push({ table: Attente.SESSIONS, op: Attente.UPSERT, id: m.id, donnees: Seance.ligneSession(m), creation: true });
        var lignesM = Seance.lignes(m);
        // 83 — une séance importée ne connaît que ses propres séries.
        ops.push({ table: Attente.SETS, op: Attente.REMPLACER, id: m.id, donnees: lignesM,
                   connues: lignesM.map(function (l) { return l.id; }) });
        modeles.push(m);
      }
      if (!generationValide(g)) return;
      if (modeles.length) {
        await poserPaquet(ops);
        adopterImportees(modeles);
        // Les records, dans l'ordre des dates, des seules séances plus récentes
        // que la dernière déjà là — comme une séance terminée, par le journal.
        var recentes = Import.avecRecords(modeles, dejaLa);
        if (recentes.length) {
          var avecSeries = {};
          faits.seancesAvecSeries(corpus()).forEach(function (se) { if (se) avecSeries[se.id] = se; });
          for (var j = 0; j < recentes.length; j++) {
            var se = avecSeries[recentes[j].id];
            if (se) await poserJournal(faits.journalDeLaSeance(corpus(), se, uid), se.id, se.id);
          }
        }
        resultat.importees += modeles.length;
      }
      imp.progression.fait = Math.min(choisies.length, p + paquet.length);
      if (importHevy === imp) rendreImportEcran();
      if (modeles.length) {
        var envoi = await attendreEnvoi(modeles.map(function (x) { return x.id; }), g);
        if (envoi === 'arret') return;
        if (envoi !== 'ok') { resultat.arret = envoi; break; }
      }
    }
    imp.etape = 'fini';
    imp.resultat = resultat;
    if (importHevy === imp && ecranCourant === 'import') rendreImportEcran();
  }

  function vueImport() {
    var imp = importHevy, M = Import.MESSAGES;
    var v = {
      etape: imp.etape, texte: imp.texte, erreur: imp.erreur, occupe: imp.occupe,
      surSaisie: function (t) { imp.texte = t; },
      surLireTexte: function (t) { imp.texte = t; lireImport('texte', t); },
      surChoisirFichier: function () {
        var f = $('fichier-hevy');
        if (!f) return;
        f.value = '';
        f.click();
      },
      surHistorique: function () {
        if (importDuQuestionnaire) return reprendreLeQuestionnaire();
        importHevy = null;
        allerA(Routeur.RACINE, {});
        rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
      }
    };
    // 187 — depuis le questionnaire : « Reprendre le questionnaire », à la fin comme au premier écran de l'import.
    if (importDuQuestionnaire) {
      v.libelleFin = 'Reprendre le questionnaire';
      v.surReprendre = reprendreLeQuestionnaire;
    }
    if (imp.etape === 'en_cours') {
      v.progression = { fait: imp.progression.fait, total: imp.progression.total,
        texte: imp.progression.fait + ' séances sur ' + imp.progression.total };
    } else if (imp.etape === 'fini') {
      v.fin = Import.phrasesDeFin(imp.resultat);
      v.fin.connexion = imp.resultat.arret ? M.connexion : null;
    } else if (imp.etape === 'apercu') {
      var index = indexDeLImport();
      var annee = new Date().getFullYear();
      var n = imp.lignes.length;
      v.titre = n + (n > 1 ? ' séances trouvées' : ' séance trouvée');
      v.periode = Import.periode(imp.lignes, annee);
      v.lignes = imp.lignes.map(function (l) {
        return { titre: l.seance.titre || 'Séance', quand: Import.jourEtHeure(l.seance.debut_local, annee),
                 sous: Import.sousLigne(l, imp.fuseau), coche: l.coche && l.verdict !== 'deja_la',
                 grise: l.verdict === 'deja_la', duree: l.duree_longue || null, sansFin: !!l.sans_fin };
      });
      v.surCocher = cocherImport;
      v.surChoisirFin = choisirFinImport;
      var noms = Import.nomsARattacher(imp.lignes, index, imp.ignores);
      v.noms = noms.map(function (x) {
        return { nom: x.nom, aide: x.series + (x.series > 1 ? ' séries, ' : ' série, ') + x.seances +
          (x.seances > 1 ? ' séances' : ' séance') + (x.ignore ? ' · laissé de côté' : '') };
      });
      var aRattacher = noms.filter(function (x) { return !x.ignore; }).length;
      v.titreNoms = noms.length + (noms.length > 1 ? ' exercices à rattacher' : ' exercice à rattacher');
      v.surChoisirNom = function (nom) { ouvrirCatalogue(null, null, null, nom); };
      var k = imp.lignes.filter(function (l) { return l.coche && l.verdict !== 'deja_la'; }).length;
      v.bouton = { libelle: k ? 'Importer ' + k + (k > 1 ? ' séances' : ' séance') : 'Importer',
                   actif: Import.pretAImporter(imp.lignes, index, imp.ignores) };
      v.attend = k && aRattacher ? M.attend : null;
      v.surImporter = function () { importerHevy().catch(function (e) { console.warn('Import :', texteErreur(e)); }); };
    }
    return v;
  }

  function rendreImportEcran() {
    if (!importHevy) importHevy = importNeuf();
    montrer('import', Routeur.IMPORT);
    Rendu.rendreImport($('import-hevy'), vueImport());
  }

  // ── Tous mes exercices (§2.4 bis) ────────────────────────────────────────
  //
  // 58-1 — les exercices faits et leur date (`faits.datesDesExercices`,
  // `faits.compterExercices`) : le module des faits, avec leur balayage gardé
  // et leur oubli explicite (`faits.oublierDates`).

  function rendreMesExercices() {
    montrer('exercices', Routeur.EXERCICES);
    var dates = faits.datesDesExercices(corpus());
    var recherche = ($('champ-recherche-mes-exos').value || '').trim();

    // ⚠️ LA RECHERCHE DU CATALOGUE, PAS UNE SECONDE. `Routines.chercher` replie
    // déjà les accents des deux côtés et exige tous les mots — « couche halt »
    // trouve « Développé Couché Haltères ». En réécrire une ici, c'était deux
    // recherches à tenir d'accord (CADRAGE-V2 §2 undecies).
    //
    // Sa limite par défaut est de 30, et son ordre est celui d'un champ de
    // saisie qui cherche UN exercice (§7 quindecies.11) : faux pour une liste
    // qui les montre TOUS. On lui demande donc tout, et on trie ici. 126 — elle
    // cherche aussi les noms alternatifs (le cache `alias`).
    var SANS_LIMITE = 100000;
    var lignes = Routines.chercher(local.exercices, recherche, { limite: SANS_LIMITE, alias: local.alias })
      .map(function (x) {
        return { slug: x.slug, nom: x.nom || x.slug, quandISO: dates[x.slug] || null };
      });

    // Les exercices FAITS d'abord, du plus récent au plus ancien ; les autres
    // ensuite, par ordre alphabétique. Un catalogue de 237 entrées trié
    // alphabétiquement répondrait à « quels exercices existent » — la question
    // ici est « qu'est-ce que je fais ».
    lignes.sort(function (a, b) {
      if (a.quandISO && b.quandISO) return a.quandISO < b.quandISO ? 1 : -1;
      if (a.quandISO) return -1;
      if (b.quandISO) return 1;
      return a.nom.localeCompare(b.nom, 'fr');
    });

    var nbFaits = 0;
    lignes.forEach(function (l) { if (l.quandISO) nbFaits++; });
    $('compte-mes-exos').textContent = lignes.length + ' exercice' +
      (lignes.length > 1 ? 's' : '') + ' · ' + nbFaits + ' déjà fait' +
      (nbFaits > 1 ? 's' : '');

    Rendu.rendreMesExercices($('liste-mes-exos'), {
      recherche: recherche,
      exercices: lignes.map(function (l) {
        return { slug: l.slug, nom: l.nom, jamais: !l.quandISO,
          quand: l.quandISO ? Rendu.jour(new Date(l.quandISO)) : 'jamais fait' };
      }),
      surChoix: function (slug) { afficherExercice(slug); }
    });
  }

  // ══ L'ENTRÉE : CONNEXION ET INSCRIPTION (§2 ter) ═════════════════════════

  var modeEntree = 'connexion';
  var sondePseudo = null;       // le minuteur de la vérification à la frappe
  var pseudoPris = null;        // true / false / null — null = « on ne sait pas »

  function champsEntree() {
    return {
      phrase: $('entree-phrase'), pseudo: $('env-pseudo'), oubli: $('btn-oubli'),
      aideMdp: $('aide-mdp'), bouton: $('btn-connexion'),
      bascule: $('btn-bascule-entree'), basculeAvant: $('entree-bascule-avant'),
      champEmail: $('champ-email'), champMdp: $('champ-mdp'), message: $('erreur-connexion')
    };
  }

  // ⚠️ REMISE À ZÉRO À CHAQUE OUVERTURE. Sans elle, l'ancienne erreur et
  // l'ancien mot de passe restaient dans le formulaire après un « Quitter » —
  // défaut relevé à l'état des lieux du 18/09.
  function rendreEntree(mode) {
    modeEntree = mode || 'connexion';
    montrer('connexion', modeEntree === 'inscription'
      ? Routeur.INSCRIPTION : Routeur.CONNEXION);
    $('erreur-connexion').textContent = '';
    $('aide-pseudo').textContent = '';
    $('champ-mdp').value = '';
    pseudoPris = null;
    if (sondePseudo) { racine.clearTimeout(sondePseudo); sondePseudo = null; }
    var c = champsEntree();
    c.mode = modeEntree;
    Rendu.rendreEntree(c);
    rendreEncartInstaller();   // 138 : iPhone, hors de l'app
    majBoutonEntree();
  }

  function etatEntree() {
    return {
      pseudo: $('champ-pseudo').value,
      email: $('champ-email').value.trim(),
      mdp: $('champ-mdp').value,
      pseudoPris: pseudoPris
    };
  }

  function majBoutonEntree() {
    var b = $('btn-connexion');
    if (modeEntree !== 'inscription') { b.disabled = false; return; }
    b.disabled = !Profil.inscriptionPrete(etatEntree());
  }

  // Vérifié À LA FRAPPE, et le refus PROPOSE DEUX ALTERNATIVES (§3.1) — sinon
  // on tâtonne. Les alternatives se dérivent de l'e-mail déjà saisi : « mel »
  // avec melodie.dupont@… donne « melodie » et « mel_d ».
  function surFrappePseudo() {
    var e = etatEntree();
    pseudoPris = null;
    var verdict = Profil.verdictPseudo(e.pseudo, null, e);
    $('aide-pseudo').textContent = verdict.message || '';
    $('aide-pseudo').className = 'entree-err';
    majBoutonEntree();
    if (sondePseudo) racine.clearTimeout(sondePseudo);
    if (verdict.code !== 'inconnu' && verdict.code !== 'libre') return;
    // 400 ms : assez pour ne pas interroger à chaque lettre, assez peu pour que
    // la réponse arrive avant le champ suivant.
    sondePseudo = racine.setTimeout(function () { sonderPseudo(verdict.pseudo); }, 400);
  }

  async function sonderPseudo(nom) {
    var reponse = await Donnees.pseudoPris(nom);
    // La frappe a continué pendant la requête : sa réponse ne parle plus du
    // champ. On la jette plutôt que d'afficher un verdict périmé.
    if (Profil.normaliserPseudo($('champ-pseudo').value) !== nom) return;
    pseudoPris = reponse;
    var verdict = Profil.verdictPseudo(nom, reponse, etatEntree());
    $('aide-pseudo').textContent = verdict.message || '';
    majBoutonEntree();
  }

  async function soumettreEntree(e) {
    e.preventDefault();
    var bouton = $('btn-connexion'), erreur = $('erreur-connexion');
    var inscription = modeEntree === 'inscription';
    erreur.textContent = '';
    erreur.className = 'erreur';
    bouton.disabled = true;
    bouton.textContent = inscription ? 'Création…' : 'Connexion…';
    try {
      if (inscription) {
        var etat = etatEntree();
        // ⚠️ RETENU AVANT L'APPEL. `onAuthStateChange` peut partir AVANT que
        // `signUp` ne rende la main : si le pseudo n'était posé qu'après, le
        // chargement du profil créerait la ligne sans lui.
        pseudoAInscrire = Profil.normaliserPseudo(etat.pseudo);
        // 59-4 — le lien de confirmation (s'il y en a un) revient sur CETTE app.
        // 60-3b — le pseudo (normalisé) part AVEC le compte, dans ses données : le lien de confirmation
        // s'ouvre souvent dans une autre page, où `pseudoAInscrire` n'existe plus.
        var r = await Auth.inscrire(etat.email, etat.mdp, racine.location.origin + '/', pseudoAInscrire);
        // 70 — sans session, TOUJOURS la même phrase (adresse neuve ou déjà inscrite :
        // Supabase ne le dit pas, et on ne le dirait pas), et « Mot de passe oublié ? »
        // juste dessous — c'est la seule issue d'une adresse déjà inscrite.
        var phrase = Auth.phraseInscription(r);
        if (phrase) {
          erreur.className = 'erreur ok';
          erreur.textContent = phrase;
          var c = champsEntree();
          c.mode = 'inscription';
          c.oubliSous = true;
          Rendu.rendreEntree(c);
        }
      } else {
        // Une connexion n'inscrit personne : un pseudo resté en mémoire (une création échouée, un autre
        // compte) ne doit pas partir dans la ligne d'un compte qui n'en a pas encore.
        pseudoAInscrire = null;
        await Auth.connecter($('champ-email').value.trim(), $('champ-mdp').value);
      }
    } catch (err) {
      pseudoAInscrire = null;
      erreur.textContent = texteErreur(err);
    } finally {
      bouton.textContent = inscription ? 'Créer mon compte' : 'Se connecter';
      majBoutonEntree();
    }
  }

  async function demanderReinitialisation() {
    var email = $('champ-email').value.trim(), erreur = $('erreur-connexion');
    if (!email) {
      erreur.className = 'erreur';
      erreur.textContent = 'Saisis d’abord ton e-mail.';
      return;
    }
    try { await Auth.reinitialiser(email, racine.location.origin + '/profil'); }
    catch (err) { erreur.className = 'erreur'; erreur.textContent = texteErreur(err); return; }
    // La même phrase que l'adresse existe ou non : dire « ce compte n'existe
    // pas » révélerait qui est inscrit à qui demande.
    erreur.className = 'erreur ok';
    erreur.textContent = 'Si un compte existe pour cette adresse, le lien vient de partir.';
  }

  // ── Routage ──────────────────────────────────────────────────────────────
  //
  // Les semaines EMPILENT une entrée d'historique, contrairement au commit
  // précédent. Sans empilement, le retour depuis une semaine ancienne n'aurait
  // que deux issues : quitter l'app — le défaut même qu'on corrige — ou sauter
  // sans prévenir à la semaine courante. Empiler est la seule qui ne surprenne
  // pas, et le bouton « Cette semaine » borne le coût d'une exploration lointaine.

  // 70 — l'attente d'un retour de lien est bornée (ECRAN-PROFIL §5.6), et ses deux phrases.
  var DELAI_LIEN_MS = 5000;
  var DELAI_DEPASSE = {};

  // 138 — le lien de confirmation en attente de « Continuer ici » : `{ session }` (la dernière reçue du SDK), ou `null`.
  var lienTenu = null;

  // L'écran du lien montre le bandeau du §3.5 au lieu d'entrer. « Continuer ici » appelle l'entrée qui aurait eu lieu ;
  // « Comment installer » ouvre la feuille (l'écran reste là).
  function proposerRetourIphone(sessionDuLien) {
    var noeud = $('bandeau-lien');
    var phrase = doc.querySelector('#vue-lien .entree-phrase');
    var p = Auth.PHRASES_IPHONE.lien;
    if (phrase) phrase.textContent = '';
    Rendu.rendreBandeauReprise(noeud, {
      quoi: p.quoi, sujet: p.sujet,
      libelleQuitter: 'Continuer ici',
      surQuitter: function () {
        var tenu = lienTenu;
        lienTenu = null;
        Rendu.rendreBandeauReprise(noeud, null);
        if (phrase) phrase.textContent = 'Ouverture du lien…';
        entrer((tenu && tenu.session) || sessionDuLien).catch(function (e) { console.warn('Entrée :', texteErreur(e)); });
      },
      libelleReprendre: 'Comment installer',
      surReprendre: ouvrirFeuilleInstaller
    });
  }
  var PHRASE_LIEN_EXPIRE = 'Ce lien a expiré ou a déjà servi. Redemande-en un avec « Mot de passe oublié ? ».';
  var PHRASE_LIEN_NON_VERIFIE = 'Le lien n\'a pas pu être vérifié. Réessaie, ou redemande-en un avec « Mot de passe oublié ? ».';

  // 70 — un fragment d'authentification ne reste JAMAIS dans l'adresse après sa
  // lecture : ni le jeton (le SDK n'efface que son contenu et laisse « # »), ni
  // l'erreur (que le SDK laisse en place), ni un `?code=` de flux PKCE.
  function effacerRetourDeLien() {
    try {
      var u = new URL(racine.location.href);
      u.searchParams.delete('code');
      racine.history.replaceState(racine.history.state, '', u.pathname + u.search);
    } catch (e) { /* adresse illisible : rien à retirer */ }
  }

  function allerA(vue, params, remplacer) {
    var chemin = Routeur.construire(vue, params);
    var empilee = false;
    if (chemin !== racine.location.pathname) {
      if (remplacer) racine.history.replaceState({ vue: vue }, '', chemin);
      else { racine.history.pushState({ vue: vue }, '', chemin); empilee = true; }
    }
    // Même quand rien ne bouge : l'ancre doit rester en place tant que l'app
    // n'a rien empilé en dessous d'elle.
    sortie.apresNavigation(empilee);
  }

  // ⚠️ UN BOUTON « ← » REMONTE L'HISTORIQUE, IL NE CHOISIT PAS UNE DESTINATION
  // (règle du chantier 40, généralisée au 47).
  //
  // Naviguer explicitement EMPILE une entrée de plus au lieu de retirer celle
  // qu'on quitte. Depuis le détail d'une séance, « ← Séances » appelait
  // `afficherSemaine()` : il fallait ensuite TROIS retours d'Android pour
  // sortir de l'app, et l'un d'eux ROUVRAIT le détail qu'on venait de quitter.
  // Le bouton de la page d'exercice avait déjà été corrigé pour cette raison
  // exacte ; les deux faisaient depuis le même geste de deux façons.
  //
  // ⚠️ ET LE REPLI N'EST PAS DU ZÈLE. Au fond de notre pile, `history.back()`
  // est ABSORBÉ par `Sortie` (l'ancre) : le bouton ne ferait alors RIEN — le
  // cas d'un rechargement direct sur /seance/<uuid> ou /exercice/<slug>, où
  // aucune de nos entrées n'a jamais été empilée. On demande donc à `Sortie`
  // s'il reste quelque chose à nous de retirer, et sinon on navigue.
  function remonter(repli) {
    if (sortie.etat().pile > 0) racine.history.back();
    else repli();
  }

  // Une vue peut déclarer qu'elle refuse la sortie. C'est le point d'accroche
  // de l'écran de saisie : une séance en cours fournira ici sa propre question.
  // Rien ne l'utilise encore — seul le mécanisme existe.
  function ajouterGarde(fn) { if (typeof fn === 'function') gardes.push(fn); }
  function retirerGarde(fn) { gardes = gardes.filter(function (g) { return g !== fn; }); }

  // Un onglet sans contenu n'a rien à rendre : sa section est écrite en clair
  // dans index.html. Montrer la vue suffit.
  // Il n'en reste AUCUN : Saisie a un contenu depuis le chantier 21, Profil
  // depuis le chantier 46. La table survit pour Progression, qui rend son
  // sommaire mais dont la coquille est bien en clair.
  var VUES_ONGLET = {};
  VUES_ONGLET[Routeur.PROGRESSION] = 'progression';

  // 163 — « Ma salle » dépend des routines (un exercice à l'élastique dans l'une d'elles) : si elles ne sont pas encore lues,
  // on les lit une fois et l'écran se refait. Jamais de boucle : une lecture à la fois, un seul nouveau rendu.
  var routinesDuProfilDemandees = false;
  function demanderLesRoutinesDuProfil() {
    if (etatRoutines.code === 'ok' || routinesDuProfilDemandees) return;
    routinesDuProfilDemandees = true;
    chargerRoutines().then(function () {
      if (etatRoutines.code === 'ok' && ecranCourant === 'profil') rendreProfilEcran();
    }).catch(function () { /* hors ligne : la ligne attend les routines */ }).then(function () { routinesDuProfilDemandees = false; });
  }

  function rendreRoute(route) {
    var cible = Routeur.routeAffichable(route, { session: sessionActive });
    // Sans session, l'URL est corrigée en même temps que l'écran : laisser
    // /semaine/… dans la barre d'adresse rejouerait le défaut au rechargement.
    if (cible.redirigeDepuis) allerA(Routeur.CONNEXION, {}, true);
    if (cible.vue === Routeur.CONNEXION) return rendreEntree('connexion');
    if (cible.vue === Routeur.INSCRIPTION) return rendreEntree('inscription');
    if (cible.vue === Routeur.PROFIL) { demanderLesRoutinesDuProfil(); return rendreProfilEcran(); }
    if (cible.vue === Routeur.EXERCICES) return rendreMesExercices();
    if (cible.vue === Routeur.IMPORT) return rendreImportEcran();
    // 64B — LA GARDE DU JEU VIT ICI, PAS DANS LE ROUTEUR (qui reste pur et ne connaît pas l'interrupteur). Jeu
    // éteint, `/jeu…` (lien direct, rechargement, retour) s'ouvre comme une route inconnue : « / » à sa place.
    // 87 — l'onglet, jeu éteint, ouvre le fil (le social ne dépend pas de l'interrupteur).
    if (cible.vue === Routeur.JEU && !jeuAllume()) { allerA(Routeur.FIL, {}, true); return rendreFil(); }
    if (Routeur.estVueDuJeu(cible.vue) && !jeuAllume()) {
      allerA(Routeur.RACINE, {}, true);
      return rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
    }
    if (cible.vue === Routeur.FIL) return rendreFil();
    if (cible.vue === Routeur.AMIS) return rendreAmis();
    if (cible.vue === Routeur.GUILDE) return rendreGuilde();
    if (cible.vue === Routeur.AMI) return rendreAmi(cible.params.pseudo, cible.params);
    if (cible.vue === Routeur.JEU) return rendreJeu();
    if (cible.vue === Routeur.MUSCLES) return rendreJeuMuscles();
    if (cible.vue === Routeur.SUCCES) return rendreJeuSucces();
    if (cible.vue === Routeur.DEBLOCAGES) return rendreJeuDeblocages();
    // 91 — revenir sur la séance (l'onglet) relit le groupe tout de suite : le geste de quelqu'un qui veut voir le direct.
    if (cible.vue === Routeur.SAISIE) { rendreSaisie(); if (seance) chargerGroupe(); return chargerSiBesoin(); }
    if (cible.vue === Routeur.ROUTINE) return prepererEditeur(cible.params.id || null);
    if (cible.vue === Routeur.RELECTURE) return rendreRelectureRoute(cible.params.dossier === undefined ? null : cible.params.dossier);
    if (cible.vue === Routeur.PROGRESSION) return rendreProgression();
    if (cible.vue === Routeur.VOLUME) return rendreVolume();
    if (cible.vue === Routeur.POIDS) return rendrePoids();
    if (cible.vue === Routeur.MOIS) return rendreMois(cible.params.mois || null);
    if (cible.vue === Routeur.RECORDS) return rendreRecordsDuMois(cible.params.mois || null);
    if (cible.vue === Routeur.PARCOURS) { demanderLesRoutinesDeLAccueil(); return rendreParcours(); }
    if (VUES_ONGLET[cible.vue]) return montrer(VUES_ONGLET[cible.vue], cible.vue);
    if (cible.vue === Routeur.EXERCICE) {
      return rendreExercice(cible.params.slug, cible.params.onglet);
    }
    if (cible.vue === Routeur.SEANCE) return rendreDetail(cible.params.id);
    if (cible.vue === Routeur.SEMAINE) return rendreSemaine(cible.params.lundi);
    return rendreSemaine(Semaine.bornesSemaine(new Date()).lundi);
  }

  // Une seule requête par session, sauf échec : revenir sur l'onglet ne
  // redemande rien tant que la liste est bonne.
  async function chargerSiBesoin() {
    if (etatRoutines.code === 'ok' || etatRoutines.code === 'charge') return;
    await chargerRoutines();
    if (!vues.saisie.hidden) rendreSaisie();
  }

  async function demarrer() {
    vues = {
      connexion: $('vue-connexion'), lien: $('vue-lien'), liste: $('vue-liste'), detail: $('vue-detail'),
      saisie: $('vue-saisie'), routine: $('vue-routine'), seance: $('vue-seance'),
      progression: $('vue-progression'), exercice: $('vue-exercice'),
      volume: $('vue-volume'), poids: $('vue-poids'), profil: $('vue-profil'),
      records: $('vue-records'),
      // 75 — « Ton parcours », sous Progression.
      parcours: $('vue-parcours'),
      exercices: $('vue-exercices'), questionnaire: $('vue-questionnaire'),
      // 69 — « Importer depuis Hevy », sous le profil.
      import: $('vue-import'),
      // 71 — le récap de fin de séance, plein écran, sans route.
      recap: $('vue-recap'),
      // 64B — le jeu : l'onglet et ses trois sous-vues.
      jeu: $('vue-jeu'), muscles: $('vue-muscles'), succes: $('vue-succes'), deblocages: $('vue-deblocages'),
      // 87 — le social : le fil, trouver des amis, le profil d'une personne.
      fil: $('vue-fil'), amis: $('vue-amis'), ami: $('vue-ami'),
      // 90 — la guilde.
      guilde: $('vue-guilde'),
      // 91 — le groupe de séance, plein écran, sans route.
      groupe: $('vue-groupe'),
      // 66B — « Le coach relit ta semaine », sous Saisie.
      relecture: $('vue-relecture')
    };
    sortie = Sortie.creer({
      history: racine.history,
      routeur: Routeur,
      chemin: function () { return racine.location.pathname; },
      etatHistorique: function () { return racine.history.state; },
      gardes: function () { return gardes; },
      rendre: rendreRoute
    });
    $('form-connexion').addEventListener('submit', soumettreEntree);
    // « Quitter » a quitté l'en-tête des séances : sa place est le profil, avec
    // « Supprimer mon compte » dessous (§2.5). Les deux boutons sont posés par
    // `rendreProfil`, avec leur propre confirmation.
    $('btn-bascule-entree').addEventListener('click', function () {
      var vers = modeEntree === 'inscription' ? Routeur.CONNEXION : Routeur.INSCRIPTION;
      allerA(vers, {});
      rendreEntree(vers);
    });
    $('btn-oubli').addEventListener('click', demanderReinitialisation);
    $('champ-pseudo').addEventListener('input', surFrappePseudo);
    ['champ-email', 'champ-mdp'].forEach(function (id) {
      $(id).addEventListener('input', majBoutonEntree);
    });
    // 91 — le groupe de séance : le retour de sa vue, et le direct relu environ toutes les 20 s (en séance ou dans un
    // groupe seulement ; une lecture qui échoue ne dit rien).
    $('btn-retour-groupe').addEventListener('click', fermerVueGroupe);
    // ⚠️ PAS UN SECOND `setInterval` : le chronomètre de repos est le seul (v2-barre-seance) ; un réveil qui se
    // reprogramme lui-même.
    (function boucleGroupe() { racine.setTimeout(function () { tickGroupe(); boucleGroupe(); }, Social.RAFRAICHIR_GROUPE_MS); })();
    $('btn-retour-mes-exos').addEventListener('click', function () {
      allerA(Routeur.PROFIL, {});
      rendreProfilEcran();
    });
    $('champ-recherche-mes-exos').addEventListener('input', rendreMesExercices);
    // 69 — l'import : le retour nomme le profil ; le fichier choisi se lit ; « Ne pas importer cet exercice ».
    $('btn-retour-import').addEventListener('click', function () {
      allerA(Routeur.PROFIL, {});
      rendreProfilEcran();
    });
    $('fichier-hevy').addEventListener('change', function () {
      lireFichierHevy().catch(function (e) { console.warn('Import :', texteErreur(e)); });
    });
    $('btn-ne-pas-importer').addEventListener('click', function () {
      var nom = intentionCatalogue && intentionCatalogue.rattacher;
      fermerVoile();
      if (nom) ignorerNom(nom);
    });
    // ⚠️ UN BOUTON QUI NOMME SA DESTINATION Y VA ; UN BOUTON QUI N'EN NOMME
    // AUCUNE REMONTE L'HISTORIQUE (ch. 49). Les deux « ← » ne sont PAS le même
    // bouton, et le chantier 47 les avait confondus.
    //
    //   · « ← Séances » NOMME la liste. Une promesse écrite ne peut pas dépendre
    //     du chemin parcouru : `history.back()` rend l'entrée précédente, et
    //     l'entrée précédente n'est la liste que si l'on vient d'y passer. Sur
    //     device, après un aller-retour par la saisie, ce bouton a ramené
    //     Aurélien ailleurs que là où son libellé l'annonçait. Il navigue donc,
    //     et en REMPLAÇANT — le détail quitté ne reste pas dessous, ce qui était
    //     le vrai grief du chantier 40 (« l'un des retours ROUVRAIT le détail »).
    //   · « ← Retour » ne nomme RIEN, et la page d'exercice s'atteint depuis
    //     trois écrans : décider pour elle en enverrait deux sur trois au mauvais
    //     endroit. Elle garde `remonter`, qui est la bonne réponse à « je ne sais
    //     pas d'où tu viens ».
    //
    // Coût assumé et mesuré : l'entrée remplacée reste comptée dans `pile`, donc
    // un retour d'Android depuis la liste ne fait rien de visible avant que le
    // suivant n'atteigne l'ancre. Un appui invisible, contre une promesse tenue.
    $('btn-retour').addEventListener('click', function () { afficherSemaine(null, true); });
    $('btn-retour-exercice').addEventListener('click', function () { remonter(afficherSemaine); });
    // 66B — « ‹ Routines » NOMME la bibliothèque : il y va (même règle que « ← Progression »).
    $('btn-retour-relecture').addEventListener('click', function () {
      allerA(Routeur.SAISIE, {});
      rendreSaisie();
    });
    ['btn-retour-volume', 'btn-retour-poids', 'btn-retour-records', 'btn-retour-parcours'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        allerA(Routeur.PROGRESSION, {});
        rendreProgression();
      });
    });
    // 64B — « ← Jeu » NOMME l'accueil du jeu : il y va (même règle que « ← Progression »).
    ['btn-retour-muscles', 'btn-retour-succes', 'btn-retour-deblocages'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        allerA(Routeur.JEU, {});
        rendreJeu();
      });
    });
    // 87 — les sous-onglets « Jeu » · « Fil », « ＋ » (Trouver des amis) et « ← Fil ».
    Array.prototype.forEach.call(doc.querySelectorAll('.s-onglet'), function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-social') === 'fil') { allerA(Routeur.FIL, {}); return rendreFil(); }
        if (b.getAttribute('data-social') === 'guilde') { allerA(Routeur.GUILDE, {}); return rendreGuilde(); }
        allerA(Routeur.JEU, {}); rendreRoute({ vue: Routeur.JEU, params: {} });
      });
    });
    ['btn-amis-jeu', 'btn-amis-fil', 'btn-amis-guilde'].forEach(function (id) {
      $(id).addEventListener('click', function () { allerA(Routeur.AMIS, {}); rendreAmis(); });
    });
    ['btn-retour-amis', 'btn-retour-ami'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        // 89 — d'une sous-page (son exercice, la comparaison), le retour ramène à son profil.
        if (id === 'btn-retour-ami' && social.ami && social.ami.sous) return allerAmi(social.ami.pseudo);
        allerA(Routeur.FIL, {}); rendreFil();
      });
    });
    $('btn-nouvelle-routine').addEventListener('click', function () { ouvrirRoutine(null); });
    // §7 vicies.1 — les deux boutons « Ranger », l'appui long étant l'autre
    // entrée. Un seul mode derrière : `ouvrirReorganisation` lit l'écran.
    $('btn-ranger-routines').addEventListener('click', ouvrirReorganisation);
    $('btn-ranger-routine').addEventListener('click', ouvrirReorganisation);
    // Sans argument : l'exercice se pose À LA FIN. Insérer après un bloc précis
    // reste le fait du menu de bloc, qui passe un vrai indice.
    $('btn-ajouter-exo-seance').addEventListener('click', function () { ouvrirCatalogue(); });
    $('btn-fermer-feuille').addEventListener('click', fermerVoile);
    $('feuille-seance').addEventListener('click', function (e) { if (e.target === this) fermerVoile(); });

    // Le réseau revient : on vide la file sans rien demander à personne — et le
    // profil modifié hors ligne repart avec elle.
    // Le profil ne repart que s'il y a quelque chose à envoyer : le renvoyer en entier à
    // chaque retour du réseau écraserait, avec un cache périmé, ce qu'un autre appareil
    // a répondu entre-temps (`questionnaire_fait_le`, objectif, priorités).
    racine.addEventListener('online', renvoyerCeQuiAttend);
    // 134 (I-13, audit iPhone) — LE RETOUR AU PREMIER PLAN, PAR LE MÊME CHEMIN. iOS n'a pas de Background Sync, et ne
    // délivre pas toujours `online` à la reprise : une séance finie hors ligne, l'app rouverte plus tard avec du
    // réseau, n'attendait plus que le prochain geste. Hors ligne, rien : `online` s'en chargera.
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState !== 'visible') return;
      if (racine.navigator && racine.navigator.onLine === false) return;
      renvoyerCeQuiAttend();
    });
    // 106 — les messages du groupe gardés hors ligne partent au retour du réseau.
    racine.addEventListener('online', function () { if (grp.file.length) chargerGroupe(); });
    // Rotation, clavier logiciel, changement de taille : les barres changent de
    // hauteur, la réserve les suit. Mesuré une première fois au démarrage pour
    // que `--h-onglets` existe avant le premier rendu de séance.
    racine.addEventListener('resize', mesurerBarres);
    racine.addEventListener('orientationchange', mesurerBarres);
    // 62 — app mise en veille puis rouverte : le réveil de la durée a pu être
    // suspendu ou retardé. On recalcule TOUT DE SUITE depuis `seance.debut` (jamais
    // un compteur qui aurait dérivé) et on repose le réveil sur la bonne minute.
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'hidden' || !seance || ecranCourant !== 'seance') return;
      rafraichirDuree();
      armerDuree();
    });
    mesurerBarres();
    $('btn-retour-routine').addEventListener('click', function () {
      allerA(Routeur.SAISIE, {});
      rendreSaisie();
    });
    // ⚠️ LE NOM EST UNE MODIFICATION COMME UNE AUTRE. Il vit dans le DOM et pas
    // dans le brouillon jusqu'à l'enregistrement : sans ce branchement, taper
    // un nom puis quitter l'écran le perdrait — et c'est le tout premier geste
    // d'une routine neuve.
    $('champ-nom-routine').addEventListener('input', function () {
      apresEditeur({ rendre: false });
    });
    $('btn-ajouter-exo').addEventListener('click', function () { ouvrirCatalogue(); });
    $('btn-enregistrer-routine').addEventListener('click', enregistrerBrouillon);
    $('btn-supprimer-routine').addEventListener('click', demanderSuppressionRoutine);
    $('btn-dupliquer-routine').addEventListener('click', demanderDuplication);
    $('btn-fermer-catalogue').addEventListener('click', fermerVoile);
    $('champ-recherche-exo').addEventListener('input', rendreCatalogue);
    $('btn-fermer-muscle').addEventListener('click', fermerVoile);
    $('btn-fermer-calendrier').addEventListener('click', fermerVoile);
    $('btn-cette-semaine').addEventListener('click', function () {
      fermerVoile();
      afficherSemaine(Semaine.bornesSemaine(new Date()).lundi);
    });
    $('btn-mois-prec').addEventListener('click', function () {
      moisCalendrier = Calendrier.decalerMois(moisCalendrier.annee, moisCalendrier.mois, -1);
      rendreCalendrier();
    });
    $('btn-mois-suiv').addEventListener('click', function () {
      moisCalendrier = Calendrier.decalerMois(moisCalendrier.annee, moisCalendrier.mois, 1);
      rendreCalendrier();
    });
    // Toucher le voile ferme, toucher la boîte ne ferme pas.
    ['fenetre-muscle', 'calendrier', 'catalogue'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === this) fermerVoile(); });
    });
    $('btn-rafraichir').addEventListener('click', async function () {
      Rendu.rendreEtat($('etat-sync'), { code: 'sync', libelle: 'Synchronisation…', local: false });
      await synchroniser();
      await chargerProfil();
      // La ligne de profil a pu ouvrir le questionnaire : on ne le recouvre pas.
      if (vues.questionnaire.hidden) afficherSemaine();
    });

    // Chaque onglet est une VUE du routeur, avec son URL — pas un basculement
    // d'affichage. Séances renvoie sur la semaine courante.
    Routeur.ONGLETS.forEach(function (vue) {
      var bouton = doc.querySelector('.onglet[data-vue="' + vue + '"]');
      if (!bouton) return;
      bouton.addEventListener('click', function () {
        fermerVoile();
        // Séances revient sur la semaine courante ; Progression garde celle
        // qu'on regardait, pour que l'aller-retour soit sans surprise.
        if (vue === Routeur.RACINE) return afficherSemaine(Semaine.bornesSemaine(new Date()).lundi);
        if (vue === Routeur.SAISIE) return afficherSaisie();
        allerA(vue, {});
        rendreRoute({ vue: vue, params: {} });
      });
    });

    racine.addEventListener('popstate', function () { sortie.surRetour(); });
    brancherMaj();

    // 70 — LU AVANT TOUT : l'adresse porte-t-elle un retour de lien ? (sonde
    // synchrone, sur l'adresse seule ; voir `Auth.retourDeLien`.)
    var retour = Auth.retourDeLien(racine.location);

    // Le SEUL chemin qui déconnecte. Une session nulle annoncée par le SDK ne
    // suffit pas : hors réseau, il annonce « pas de session » sans que personne
    // ne se soit déconnecté. On ne sort quelqu'un de ses données que si le
    // jeton a VRAIMENT disparu du stockage — ce que fait `Auth.deconnecter`, et
    // ce que fait le SDK quand le compte est réellement révoqué.
    Auth.surChangement(function (session, evenement) {
      // 138 — iPhone, hors de l'app, lien de confirmation : l'entrée attend « Continuer ici » (voir plus bas). La session
      // reçue est GARDÉE (la plus récente : le jeton peut être rafraîchi pendant l'attente), jamais perdue ni jetée.
      if (lienTenu && session) {
        if (evenement === 'PASSWORD_RECOVERY') lienTenu = null;   // une récupération n'attend personne (§5.6)
        else { lienTenu.session = session; return; }
      }
      // 70 — arrivé par un lien de récupération : la feuille du mot de passe
      // s'ouvre d'elle-même, dès que l'entrée a posé son premier écran.
      if (session && evenement === 'PASSWORD_RECOVERY') {
        recuperation = 'due';
        entrer(session);
        ouvrirRecuperationSiDue();
        return;
      }
      if (session) { entrer(session); return; }
      if (Auth.sessionPersistee()) return;
      sessionActive = null;
      entreeFaitePour = null;
      recuperation = null; renduPour = null;
      fermerQuestionnaire(); envoiProfil = null; versionProfil = 0; ligneACreer = false;
      profil = null; faits.oublierDates();
      allerA(Routeur.CONNEXION, {}, true);
      rendreEntree('connexion');
    });

    // ── DÉMARRAGE SANS RÉSEAU ────────────────────────────────────────────
    //
    // La sonde SYNCHRONE décide de ce qu'on affiche. Aucune attente, aucun
    // appel réseau : c'est cette attente qui laissait l'écran noir au
    // rechargement hors ligne, alors que les 28 000 séries étaient sur
    // l'appareil (cf. le commentaire de `sessionPersistee`).
    //
    // 70 — SAUF UN RETOUR DE LIEN. Le jeton est dans l'adresse, et le SDK le lit
    // de façon asynchrone : router d'abord (`replaceState` vers /connexion)
    // l'effaçait avant qu'il soit lu. On ATTEND donc le SDK — seulement dans ce
    // cas, où le réseau est de toute façon nécessaire —, on retire le fragment,
    // PUIS on décide. Une session enregistrée reste une session : un vieux lien
    // ne déconnecte personne.
    //
    // ⚠️ ET L'ATTENTE EST BORNÉE, ET ELLE SE VOIT (§5.6). Le SDK vérifie le jeton
    // auprès du serveur (`/auth/v1/user`), sans délai à lui : un réseau qui ne
    // répond pas laissait l'écran vide. « Ouverture du lien… » tout de suite ;
    // `DELAI_LIEN_MS` sans réponse, l'écran de connexion le dit. Le SDK a déjà lu
    // l'adresse à son initialisation : la nettoyer ne lui retire rien, et s'il
    // répond plus tard, le rappel de `surChangement` fait entrer (et ouvre la
    // feuille d'une récupération) — rien d'autre à écrire pour l'entrée tardive.
    var persistee = Auth.sessionPersistee();
    // ⚠️ 138 (ECRAN-PROFIL §3.5) — UN LIEN DE CONFIRMATION, SUR IPHONE HORS DE L'APP, S'ARRÊTE SUR SA PHRASE.
    // Le lien ouvre Safari, pas l'app installée, et le stockage de Safari est à part : y entrer en silence
    // connectait la personne dans une copie qu'elle ne cherchait pas (I-05). La personne décide (« Continuer ici »).
    //
    // L'ORDRE DES ÉVÉNEMENTS DU SDK (supabase-js 2.105.1, `GoTrueClient._initialize`, lu dans le dépôt ET relevé au banc
    // [138], vrai SDK, faux serveur) : le SDK lit le fragment, demande `GET /auth/v1/user`, ENREGISTRE la session
    // (`_saveSession`), puis émet `PASSWORD_RECOVERY` si le fragment porte `type=recovery`, et `SIGNED_IN` pour TOUT AUTRE
    // type (signup, magiclink, invite, email_change…), suivi de `INITIAL_SESSION` (la souscription l'attend). Relevé sur un
    // lien de confirmation : `SIGNED_IN`, `INITIAL_SESSION`, PUIS la lecture de `getSession()` rend la main — les événements
    // passent AVANT elle. Tous passent par `Auth.surChangement`, qui fait entrer : l'attente est donc POSÉE ICI, de façon
    // synchrone, avant le premier `await`, sans rien supposer de l'ordre entre l'événement et la lecture de la session ;
    // `surChangement` GARDE la session reçue au lieu d'entrer. La récupération se distingue AVANT toute décision, sur
    // l'adresse seule (`retour.recup`, le `type` du fragment) : elle n'attend jamais. Le flux PKCE (`?code=`) ne porte pas
    // son type : rien n'est arrêté (`retour.implicite` absent).
    lienTenu = retour && retour.implicite && surIphone() ? { session: null } : null;
    if (retour) {
      montrer('lien');
      var minuteur = null;
      var depasse = new Promise(function (resoudre) {
        minuteur = racine.setTimeout(function () { resoudre(DELAI_DEPASSE); }, DELAI_LIEN_MS);
      });
      var lue = null;
      try { lue = await Promise.race([Auth.sessionCourante(), depasse]); } catch (e) { lue = null; }
      racine.clearTimeout(minuteur);
      effacerRetourDeLien();
      var phraseLien = null;
      if (lue === DELAI_DEPASSE) {
        lue = null;
        phraseLien = PHRASE_LIEN_NON_VERIFIE;
      } else if (!lue) {
        phraseLien = retour.erreur ? PHRASE_LIEN_EXPIRE : PHRASE_LIEN_NON_VERIFIE;
      }
      // 138 — la session QUE LE LIEN A DONNÉE (ni le délai, ni une session déjà enregistrée), et qui n'est pas une récupération.
      var duLien = lue;
      if (lienTenu && duLien && recuperation !== 'due') {
        proposerRetourIphone(duLien);
        enregistrerSW();
        Auth.sessionCourante().catch(function () {});
        return;
      }
      // Sans session du lien (expiré, délai) : rien ne change. Un événement gardé en attendant n'est pas perdu.
      var tenu = lienTenu;
      lienTenu = null;
      lue = lue || (tenu && tenu.session) || Auth.sessionPersistee();
      // Une entrée a pu partir de l'événement du SDK pendant l'attente : elle décide, pas le délai.
      if (lue) await entrer(lue);
      else if (!entreeEnCours && !sessionActive) {
        allerA(Routeur.CONNEXION, {}, true);
        rendreEntree('connexion');
        $('erreur-connexion').className = 'erreur ok';
        $('erreur-connexion').textContent = phraseLien;
      }
    } else if (persistee) {
      await entrer(persistee);
    } else {
      var entree = Routeur.analyser(racine.location.pathname);
      var mode = entree.vue === Routeur.INSCRIPTION ? 'inscription' : 'connexion';
      allerA(mode === 'inscription' ? Routeur.INSCRIPTION : Routeur.CONNEXION, {}, true);
      rendreEntree(mode);
    }
    enregistrerSW();

    // Le verdict du SDK arrive après, et il ne bloque RIEN. Il rafraîchit le
    // jeton, ce qui déclenche `surChangement` — c'est là que la vraie session
    // remplace la sonde. Volontairement pas attendu : `.catch` vide parce qu'un
    // réseau muet n'est pas une erreur à montrer.
    Auth.sessionCourante().catch(function () {});
  }

  // Exposé pour l'écran de saisie à venir : une vue déclare ici qu'elle refuse
  // la sortie, et fournit sa propre question. Rien ne s'en sert encore.
  racine.THApp = { ajouterGarde: ajouterGarde, retirerGarde: retirerGarde, journal: etatDuJournal };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(typeof self !== 'undefined' ? self : globalThis);
