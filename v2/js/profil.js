// v2/js/profil.js — les règles du profil, de l'inscription et du pseudo.
//
// Module PUR : aucune dépendance au DOM, au réseau, à Supabase. Les référentiels
// (discipline, matériel, ancienneté…), la phrase du bandeau, le verdict d'un
// pseudo et la liste des champs qu'on a le droit d'écrire vivent ici, et se
// testent sans navigateur.
//
// ⚠️ LES LISTES SONT CELLES DE LA BASE, RELEVÉES SUR LES CONTRAINTES — pas
// supposées. `profiles_materiel_ok`, `profiles_anciennete_ok`,
// `profiles_sexe_ok`, `profiles_intention_ok` : une valeur hors liste est
// refusée par Postgres, donc une faute de frappe ici devient un 23514 à
// l'écriture, pas un défaut visible.
//
// UN SEUL CRITÈRE GOUVERNE CHAQUE CHAMP (ECRAN-PROFIL-V1) : quelque chose le
// lit, ou le lira au chantier 1. Rien n'est demandé « au cas où ». C'est
// pourquoi on ne trouvera ici ni score articulaire, ni objectif de barre, ni
// style de coaching — la v1 les collectait, et personne ne sait ce qu'ils valent.

(function (racine) {
  'use strict';

  // ── Référentiels ─────────────────────────────────────────────────────────

  // 60-1 (QUESTIONNAIRE-COACH-V2 §6) — LA DISCIPLINE, LE NIVEAU DÉCLARÉ, LES JOURS
  // VISÉS ET LES UNITÉS ONT QUITTÉ L'ÉCRAN : aucune règle ne les lit (relevé
  // 60-0), et la discipline est absorbée par l'objectif (60-2). Leurs valeurs
  // restent en base ; ce module n'en porte plus la liste, et ils ne sont plus
  // écrits (`CHAMPS_ECRITS`) ni relus (`COLONNES_PROFIL`).

  var MATERIELS = [
    { cle: 'salle_complete', libelle: 'Salle complète', sous: 'Barres, machines, poulies' },
    { cle: 'salle_basique', libelle: 'Salle basique', sous: 'Barres et haltères, peu de machines' },
    { cle: 'maison_equipee', libelle: 'Maison équipée', sous: 'Barre, rack, haltères' },
    { cle: 'maison_minimal', libelle: 'Maison, minimum', sous: 'Haltères ou élastiques' },
    { cle: 'poids_du_corps', libelle: 'Poids du corps', sous: 'Rien d’autre' }
  ];

  // ── LE MATÉRIEL RANGE, IL NE CACHE JAMAIS (60-1, QUESTIONNAIRE-COACH-V2 §4) ──
  //
  // `exercises.equipement`, relevé en base le 07/10/2026 : aucun 58 · machine 54
  // · barre 50 · poulie 31 · haltere 30 · machine_smith 5 · elastique 5 ·
  // kettlebell 2 · disque 2. Une valeur que cette liste ne connaît pas (ou
  // l'absence de valeur) n'est JAMAIS « hors matériel » : on ne devine pas.
  var EQUIPEMENTS = ['aucun', 'barre', 'haltere', 'machine', 'machine_smith', 'poulie',
                     'elastique', 'kettlebell', 'disque'];
  // 67B (ECRAN-SAISIE §7 quindecies.10) — LEURS LIBELLÉS, une seule table, à côté de la liste : le filtre « matériel »
  // du catalogue et la sous-ligne de chaque résultat. Une valeur que la table ne connaît pas se rend telle quelle.
  var LIBELLES_EQUIPEMENT = { aucun: 'Sans matériel', barre: 'Barre', haltere: 'Haltère', machine: 'Machine',
                              machine_smith: 'Machine Smith', poulie: 'Poulie', elastique: 'Élastique',
                              kettlebell: 'Kettlebell', disque: 'Disque' };
  function libelleEquipement(e) {
    if (Object.prototype.hasOwnProperty.call(LIBELLES_EQUIPEMENT, e)) return LIBELLES_EQUIPEMENT[e];
    return String(e === null || e === undefined ? '' : e);
  }

  // La table, exacte. `null` : tout le matériel (Salle complète), et aussi
  // « pas renseigné » — dans les deux cas, rien ne change d'ordre. `poulie` :
  // salle seulement.
  var EQUIPEMENTS_DU_MATERIEL = {
    salle_complete: null,
    salle_basique: ['aucun', 'barre', 'haltere', 'poulie', 'elastique', 'kettlebell', 'disque'],
    maison_equipee: ['barre', 'haltere', 'disque', 'kettlebell', 'elastique', 'aucun'],
    maison_minimal: ['haltere', 'kettlebell', 'elastique', 'aucun'],
    poids_du_corps: ['aucun', 'elastique']
  };

  // Les équipements du matériel, ou `null` quand rien n'est à ranger.
  function equipementsDe(materiel) {
    if (!Object.prototype.hasOwnProperty.call(EQUIPEMENTS_DU_MATERIEL, materiel)) return null;
    var liste = EQUIPEMENTS_DU_MATERIEL[materiel];
    return liste === null ? null : liste.slice();
  }

  // Un équipement connu, que le matériel n'a pas.
  function estHorsMateriel(equipement, autorises) {
    if (!autorises || EQUIPEMENTS.indexOf(equipement) < 0) return false;
    return autorises.indexOf(equipement) < 0;
  }

  // LES ÉCARTÉS, EN FIN DE LISTE (ECRAN-SAISIE §7 quindecies.9, MOTEUR §9.19) : un exercice que la personne a refusé
  // n'est jamais caché — il passe APRÈS tout le reste, dans l'ordre où il était. Une partition stable, comme le
  // matériel : la même règle « range, ne cache jamais ». `liste` : des éléments qui portent `.slug` ; `ecartes` : des
  // slugs. Sans écarté, la liste reçue (la même référence).
  function ecartesALaFin(liste, ecartes) {
    var e = Array.isArray(ecartes) ? ecartes : [];
    if (!e.length) return liste;
    var dans = [], fin = [];
    (liste || []).forEach(function (x) { (x && e.indexOf(x.slug) >= 0 ? fin : dans).push(x); });
    return dans.concat(fin);
  }

  // Range une liste d'exercices du catalogue (`{ slug, equipement }`) : ce qui
  // sort du matériel passe APRÈS, dans le même ordre ; rien n'est retiré. Un
  // exercice déjà fait par la personne (`faits` : `{ [slug]: … }`) n'est jamais
  // rétrogradé — c'est son historique, pas son matériel qui parle. Sans
  // matériel renseigné, la liste rendue est celle reçue. 60-4 : les ÉCARTÉS
  // (`ecartes`, des slugs) passent en tout dernier, fait ou non — c'est le même
  // rangement, pas un second tri.
  function rangerParMateriel(liste, materiel, faits, ecartes) {
    var autorises = equipementsDe(materiel);
    var rangee = liste;
    if (autorises) {
      var dans = [], apres = [];
      (liste || []).forEach(function (x) {
        var fait = !!(faits && x && Object.prototype.hasOwnProperty.call(faits, x.slug));
        (!fait && x && estHorsMateriel(x.equipement, autorises) ? apres : dans).push(x);
      });
      rangee = dans.concat(apres);
    }
    return ecartesALaFin(rangee, ecartes);
  }

  // EN FOURCHETTE, PAS UNE DATE (§2.2). « Depuis quand régulièrement » — on peut
  // s'entraîner depuis cinq ans et rester débutant, et une date exacte
  // demanderait une précision que personne n'a.
  var ANCIENNETES = [
    { cle: 'moins_1_an', libelle: 'Moins d’un an' },
    { cle: '1_a_3_ans', libelle: '1 à 3 ans' },
    { cle: '3_a_5_ans', libelle: '3 à 5 ans' },
    { cle: 'plus_5_ans', libelle: 'Plus de 5 ans' }
  ];

  var SEXES = [
    { cle: 'homme', libelle: 'Homme' },
    { cle: 'femme', libelle: 'Femme' },
    { cle: 'non_precise', libelle: 'Non précisé' }
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
  // « Je ne sais pas » écrit le VIDE — au questionnaire comme au Profil, par la même
  // `preparerChamps` (60-2c) — et le vide se lit « maintien » : c'est `phaseDe` qui le
  // dit, une fois, pour l'écran comme pour le plan.
  var PHASES = [
    { cle: 'prise_de_masse', libelle: 'Prise de masse' },
    { cle: 'maintien', libelle: 'Maintien ou recomposition' },
    { cle: 'seche', libelle: 'Sèche' },
    { cle: 'inconnue', libelle: 'Je ne sais pas' }
  ];
  var PHASES_EN_BASE = ['prise_de_masse', 'maintien', 'seche'];
  var PHASE_DEFAUT = 'maintien';
  // Ce que le récapitulatif du questionnaire et le Profil disent d'une phase vide.
  var LIBELLE_PHASE_VIDE = 'Maintien (par défaut)';

  // La phase EFFECTIVE d'un profil : sa valeur si elle est connue, sinon
  // « maintien » (MOTEUR §9.16 : vide = maintien). Jamais vide.
  function phaseDe(profil) {
    var v = profil && profil.phase;
    return PHASES_EN_BASE.indexOf(v) >= 0 ? v : PHASE_DEFAUT;
  }
  // 98 (BILANS-V1) — LA PHASE À UN JOUR `AAAA-MM-JJ` (le nom d'une saison suit la phase au début de la saison). Le
  // profil ne garde que la phase en cours et son début (`phase_depuis`) : si elle a commencé ce jour-là ou avant (ou
  // sans date), c'est elle ; si elle a commencé après, la phase d'avant n'est écrite nulle part — on dit le défaut,
  // « maintien », comme une phase vide. Jamais vide.
  function phaseAuJour(profil, jour) {
    var depuis = jourCalendaire(profil && profil.phase_depuis), j = jourCalendaire(jour);
    if (depuis !== null && j !== null && depuis > j) return PHASE_DEFAUT;
    return phaseDe(profil);
  }

  // LE DÉBUTANT : « Moins d'un an » d'ancienneté régulière (la règle du
  // générateur, 60-6) ; absente ou inconnue : pas débutant. Lu par la semaine
  // qui déraille et par la dégressive proposée (MOTEUR §14, 111).
  var ANCIENNETE_DEBUTANT = 'moins_1_an';
  function estDebutant(profil) {
    return !!profil && profil.anciennete === ANCIENNETE_DEBUTANT;
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

  // ══ LE RAPPEL DE PHASE (MOTEUR §9.16, 60-2b) ═════════════════════════════
  //
  // Une phase se déclare, puis elle dure : la plupart vont de 8 à 16 semaines. Au
  // bout de 6 semaines, on la redemande — par un bandeau, sans question (§20.2).
  // `phase_confirmee_le` est la date de la dernière réponse (le questionnaire, le
  // Profil, le bandeau lui-même) ; à défaut, `phase_depuis`. Sans phase déclarée
  // (`profiles.phase` vide : « maintien » par défaut), rien à confirmer.
  var RAPPEL_PHASE_JOURS = 42;

  // Le numéro du jour CALENDRIER LOCAL d'un instant (Date, ISO complet ou date
  // seule `AAAA-MM-JJ`), ou `null` s'il est illisible. Comme `quand` : l'écart se
  // compte en jours du calendrier, pas en heures — 42 jours à cheval sur un
  // changement d'heure valent 42 jours, pas 41 jours et 23 h.
  function jourCalendaire(v) {
    if (v === null || v === undefined || v === '') return null;
    var d = v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) + 'T00:00:00' : v);
    if (isNaN(d.getTime())) return null;
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  // 60-4 — Les jours CALENDAIRES écoulés depuis un instant (Date, ISO ou date seule) jusqu'à `aujourdhui` : la carte
  // « Passer en cycles » compte 21 jours après la création du programme (`programme_construit_le`). `null` si l'un
  // des deux est illisible ; négatif si `depuis` est dans le futur.
  function joursDepuis(depuis, aujourdhui) {
    var d = jourCalendaire(depuis);
    var a = jourCalendaire(aujourdhui === undefined ? new Date() : aujourdhui);
    return d === null || a === null ? null : a - d;
  }

  // Vrai quand une phase est DÉCLARÉE et que sa dernière confirmation date de
  // 42 jours calendaires ou plus. Faux sans date lisible, avec une date dans le
  // futur, ou sans phase déclarée. `aujourdhui` : l'horloge, passée pour les tests.
  function rappelDePhase(profil, aujourdhui) {
    var p = profil || {};
    if (PHASES_EN_BASE.indexOf(p.phase) < 0) return false;
    var depuis = jourCalendaire(p.phase_confirmee_le || p.phase_depuis);
    var auj = jourCalendaire(aujourdhui === undefined ? new Date() : aujourdhui);
    if (depuis === null || auj === null) return false;
    return auj - depuis >= RAPPEL_PHASE_JOURS;
  }

  // « Sèche depuis le 28 sept. » : la phase, puis la date où elle a été déclarée
  // (`phase_depuis`, par le formateur de la voix `quand`). Sans cette date — une
  // phase posée par le questionnaire sur un profil qui n'en avait pas —, la phase
  // seule : on ne ment pas sur un « depuis ».
  function phraseRappelDePhase(profil) {
    var p = profil || {};
    if (PHASES_EN_BASE.indexOf(p.phase) < 0) return null;
    var nom = libelleDe(PHASES, p.phase);
    var q = p.phase_depuis && racine.THModele ? racine.THModele.quand(p.phase_depuis) : '';
    return q ? nom + ' depuis ' + q : nom + '.';
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

  // L'OBJECTIF EFFECTIF d'un profil (MOTEUR §9.16, 60-2b) : l'une des quatre
  // valeurs de la contrainte `profiles_objectif_ok`, sinon `null` — « sans
  // réponse ». PAS de défaut, contrairement à la phase : un vide est une réponse
  // (rien n'est supposé), et le fondement des paris le dit tel quel.
  function objectifDe(profil) {
    var v = profil && profil.objectif;
    return dansLaListe(OBJECTIFS, v) ? v : null;
  }

  // LE GEL de l'objectif, jumeau de `phaseGelee` : lu UNE fois et gelé pour la
  // séance (MOTEUR §9.16, I40). `gel` : `{ seanceId, objectif }` ou `null` ;
  // `sauvee` : l'objectif gelé relu du disque pour cette séance. ⚠️ `null` est une
  // valeur LÉGITIME (« sans réponse ») : `undefined` seul veut dire « rien de
  // sauvé » (séance gelée avant 60-2b) — alors, l'objectif du profil maintenant.
  function objectifGele(gel, seanceId, sauvee, profil) {
    if (gel && gel.seanceId === seanceId) return gel;
    var gardee = sauvee === null || (sauvee !== undefined && dansLaListe(OBJECTIFS, sauvee));
    return { seanceId: seanceId, objectif: gardee ? sauvee : objectifDe(profil) };
  }

  // ── LA SECTION « TA PHASE », À CÔTÉ DU RYTHME ────────────────────────────
  //
  // Le même composant et la même écriture que « Ton rythme » (`ecrire` =
  // `ecrireProfil`, local d'abord puis la file du profil). Elle existe aussi
  // en Entretenir : la phase est un fait sur l'utilisateur, pas un réglage du
  // moteur de charge. Choisir écrit `phase`, `phase_depuis` ET `phase_confirmee_le` (maintenant).
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
          // 60-2c : la MÊME préparation que le questionnaire — un seul endroit dit ce
          // qu'une réponse sur la phase écrit. TOUTE réponse est une confirmation
          // (`phase_confirmee_le`, que lit le rappel de phase) ; re-toucher la phase déjà
          // choisie ne fait que cela (`phase_depuis`, le début de cette phase, ne repart pas
          // de zéro) ; « Je ne sais pas » écrit le vide.
          ecrire(preparerChamps(p, { phase: v }, quand));
        }
      },
      // Une phase vide ne dit pas « depuis » : elle dit ce que le coach en fait.
      pied: PHASES_EN_BASE.indexOf(p.phase) >= 0 ? depuisPhase(p) : LIBELLE_PHASE_VIDE
    };
  }

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
  // `sexe` et `intention` sont NOT NULL avec un défaut en base : ils ne peuvent
  // pas manquer, donc ils n'y figurent pas.
  var A_RENSEIGNER = ['materiel', 'anciennete', 'taille_cm',
                      'date_naissance', 'seances_par_semaine', 'duree_seance_min'];

  function vide(v) {
    if (v === null || v === undefined || v === '') return true;
    return Array.isArray(v) && v.length === 0;
  }

  // ── LE QUESTIONNAIRE EST UNE RÈGLE DE ROUTAGE (ECRAN-PROFIL §4 bis) ──────
  //
  // 60-2a — IL REMPLACE L'ANCIENNE RÈGLE (`doitOuvrirProfil`, retirée). Ce n'est plus `onboarding_completed`
  // (« profil vu », déjà vrai chez les quatre comptes existants) qui décide,
  // mais `questionnaire_fait_le` : vide tant que la personne n'est pas arrivée
  // au récapitulatif (QUESTIONNAIRE-COACH-V2 §2).
  //
  // ⚠️ TROIS ÉTATS, PAS DEUX — la leçon de l'ancienne règle, gardée :
  //   `null`      → la base dit qu'il n'a jamais été rempli → on l'ouvre ;
  //   une date    → rempli → on ouvre ce que l'URL demande ;
  //   ABSENT      → on ne sait pas : profil pas encore chargé, cache d'avant la
  //                 colonne, premier démarrage hors ligne, ligne partielle écrite
  //                 sans réseau. **On n'ouvre pas un questionnaire sur une
  //                 supposition.**
  //
  // Une lecture lâche (`!profil.questionnaire_fait_le`) confondrait le troisième
  // cas avec le premier, et un compte qui a trois ans d'historique rouvrirait
  // le questionnaire à chaque démarrage hors ligne.
  //
  // `dejaVuIci` : il s'est déjà ouvert de lui-même sur CET appareil (une clé
  // locale par compte). « Plus tard » le repousse sans rien perdre : le bandeau
  // de Saisie et la ligne du Profil prennent le relais, jusqu'à ce qu'il soit
  // rempli.
  function doitOuvrirQuestionnaire(profil, dejaVuIci) {
    return !dejaVuIci && questionnaireAFaire(profil);
  }

  // Le questionnaire n'est pas terminé — ce que le bandeau de Saisie et la ligne
  // du Profil lisent, tant qu'il ne l'est pas : la même règle à trois états, sans
  // la mémoire de l'appareil.
  function questionnaireAFaire(profil) {
    return !!profil && Object.prototype.hasOwnProperty.call(profil, 'questionnaire_fait_le') &&
      profil.questionnaire_fait_le === null;
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
                       'anciennete', 'intention',
                       'rythme_progression', 'phase', 'phase_depuis', 'lest_reponse', 'lest_reponse_le',
                       // 127 (v2_099, MOTEUR §9.17 bis) — la réponse à la carte « marche suivante », par exercice de
                       // départ (`{ slug: { r, le, aide } }`). FACULTATIVE en lecture et en écriture tant que la migration
                       // n'est pas lancée (`COLONNES_FACULTATIVES`, donnees.js).
                       'marche_reponses',
                       'materiel',
                       'seances_par_semaine', 'duree_seance_min',
                       // 60-2a (v2_065) — le questionnaire du coach. `zone_force_reponse*` n'y
                       // est PAS : ni écrite ni lue (SCHEMA-REEL).
                       'objectif', 'objectif_depuis', 'priorites', 'temps_reponse',
                       'historique_declare', 'phase_confirmee_le', 'questionnaire_fait_le',
                       // 60-3 — l'écran 8 (« Ton programme ») : `deduit`, `moi`, et depuis 60-4
                       // `construis` (CHECK `deduit` · `moi` · `construis`, relevé au schéma le 08/10).
                       'programme_choix',
                       // 60-4 (v2_066) — le programme construit (QUESTIONNAIRE-COACH-V2 §5 bis) : la
                       // zone à ménager (lue par le générateur seulement), les exercices écartés, le
                       // dossier du programme construit et sa date, la date de la carte « Passer en
                       // cycles ». Leurs bornes sont celles des CHECK (`preparerChamps`) : un 23514
                       // bloquerait l'envoi de TOUT le profil.
                       'zones_a_menager', 'exercices_ecartes', 'programme_construit_dossier',
                       'programme_construit_le', 'carte_cycles_le',
                       // 64B (v2_068) — l'interrupteur du jeu (JEU-V1 §9.1).
                       'jeu_actif',
                       // 87 (v2_078) — le compte privé, et le niveau et le titre du jeu que l'app publie
                       // (`publierJeu`, app.js) : l'affichage social seulement, jamais relus par le jeu.
                       'compte_prive', 'jeu_niveau', 'jeu_titre',
                       // 104 (v2_086, NOT NULL DEFAULT '{}', au plus 200) — les bilans déjà annoncés ('2026',
                       // '2026-ete', '2026-09') : l'annonce ne revient pas sur un autre appareil (BILANS-V1).
                       // Colonne FACULTATIVE (`Donnees`) : absente en base, le profil se lit et s'écrit sans elle.
                       'bilans_annonces',
                       // 108 (v2_088) — ma salle (MOTEUR §10 bis). FACULTATIVE en lecture et en écriture tant que
                       // la migration n'est pas lancée (`COLONNES_FACULTATIVES`, donnees.js).
                       'ma_salle',
                       'onboarding_completed'];

  // ⚠️ `jeu_actif` EST NOT NULL (v2_068) : un `null` serait un 23502, que la file classe définitif — et le profil part
  // en ligne ENTIÈRE à chaque envoi, il bloquerait tout. Seul un booléen part ; absent ou nul, il n'est pas envoyé (la
  // base garde sa valeur, `true` par défaut).
  var BOOLEENS_NON_NULS = ['jeu_actif', 'compte_prive'];
  function champsEcrits(champs) {
    var src = champs || {}, sortie = {};
    CHAMPS_ECRITS.forEach(function (c) {
      if (!Object.prototype.hasOwnProperty.call(src, c)) return;
      if (BOOLEENS_NON_NULS.indexOf(c) >= 0 && typeof src[c] !== 'boolean') return;
      // 104 — `bilans_annonces` est NOT NULL et borné à 200 (CHECK, 23514 définitif pour TOUTE la ligne) : seule une
      // liste part, ramenée à ses 200 dernières périodes ; absente ou illisible, elle ne part pas (la base garde la sienne).
      if (c === 'bilans_annonces') {
        if (!Array.isArray(src[c])) return;
        sortie[c] = ajouterBilansAnnonces(src[c], []);
        return;
      }
      // 127 — les réponses à la carte « marche suivante » : un objet, jamais une liste ni un scalaire.
      if (c === 'marche_reponses') {
        var mr = src[c];
        if (mr === null || (mr && typeof mr === 'object' && !Array.isArray(mr))) sortie[c] = mr;
        return;
      }
      // 108 — une salle hors bornes ne part pas (elle serait refusée en 23514, et tout le profil avec elle).
      if (c === 'ma_salle') {
        var s = salleValide(src[c]);
        if (s !== undefined) sortie[c] = s;
        return;
      }
      sortie[c] = src[c];
    });
    return sortie;
  }

  // ── CE QUI ATTEND D'ÊTRE ENVOYÉ (audit du 16/10/2026, prompt 116) ─────────
  //
  // ⚠️ UN GESTE N'ENVOIE QUE SES COLONNES. Avant 116, chaque geste renvoyait TOUTE la ligne en cache, et le profil
  // ne se relit qu'au démarrage : un réglage fait sur un autre appareil (ou une prévisualisation de PR, une autre
  // origine) était réécrit à son ancienne valeur par le geste suivant de l'appareil resté ouvert — Ma salle, la
  // phase, les priorités, « questionnaire rempli ». L'`upsert` de PostgREST ne touche que les colonnes reçues :
  // n'envoyer que celles du geste suffit.
  //
  // L'ATTENTE : `false` (rien n'attend), un objet `{ colonne: valeur }` — les colonnes des gestes pas encore partis,
  // FUSIONNÉES (deux gestes hors réseau partent ensemble, chacun avec ses colonnes ; le plus récent l'emporte sur une
  // même colonne) —, ou `true` : la forme d'avant 116, un simple drapeau gardé sur l'appareil, qui ne dit pas
  // quelles colonnes ont changé. Celle-là envoie la ligne entière, UNE fois (ne rien envoyer perdrait le geste).
  function fusionnerEnAttente(attente, champs) {
    if (attente === true) return true;
    var out = Object.assign({}, attente && typeof attente === 'object' ? attente : {}, champsEcrits(champs));
    return Object.keys(out).length ? out : false;
  }
  // Ce qui part : les colonnes en attente (filtrées par la liste blanche), ou la ligne entière pour `true`.
  function champsEnAttente(attente, profil) {
    if (attente === true) return champsEcrits(profil);
    return champsEcrits(attente && typeof attente === 'object' ? attente : {});
  }
  // L'attente, moins ce qui vient de partir : une colonne n'en sort que si elle vaut TOUJOURS ce qui est parti — un
  // geste posé pendant l'envoi, sur la même colonne, attend le sien. `true` est rendu tel quel (l'appelant décide).
  function memeValeur(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function retirerEnvoyes(attente, envoyes) {
    if (attente === true) return true;
    if (!attente || typeof attente !== 'object') return false;
    var e = envoyes || {}, out = {};
    Object.keys(attente).forEach(function (c) {
      if (Object.prototype.hasOwnProperty.call(e, c) && memeValeur(attente[c], e[c])) return;
      out[c] = attente[c];
    });
    return Object.keys(out).length ? out : false;
  }
  // ── UN REFUS DÉFINITIF NE BLOQUE PLUS LE PROFIL (audit du 16/10/2026, 03 #6) ──
  //
  // Les bornes de l'app doublent les CHECK connus ; mais une borne qui diverge, ou un CHECK pas relevé, faisait
  // refuser l'envoi À L'IDENTIQUE à chaque départ — et tous les gestes suivants avec lui, sans un mot. Ces codes ne
  // passeront jamais tels quels : la colonne fautive quitte l'envoi, le reste part, et une phrase discrète le dit.
  // `PGRST204` (une colonne que la base n'a pas, hors colonnes facultatives) en est ; `42703` n'en est PAS : il vient
  // de la lecture qui suit l'écriture, et toutes les colonnes le recevraient — les jeter perdrait tous les gestes.
  // Ni le refus d'un pseudo (`23505`, son propre chemin : `estRefusDePseudo`), ni le RLS (`42501`, un état de
  // session) n'en sont : ils gardent leur traitement.
  var REFUS_DEFINITIFS = ['23502', '23514', '22P02', '22001', '22003', '22007', '22008', '22023', 'PGRST204'];
  function estRefusDefinitif(erreur) {
    return !!erreur && REFUS_DEFINITIFS.indexOf(String(erreur.code || '')) >= 0;
  }
  // Le nom d'une colonne, comme le Profil la montre ; une colonne sans ligne au Profil : « un réglage ».
  var LIBELLES_COLONNES = {
    username: 'Pseudo', bio: 'Bio', sexe: 'Sexe', taille_cm: 'Taille', date_naissance: 'Date de naissance',
    anciennete: 'Ancienneté', intention: 'Progresser ou carnet', rythme_progression: 'Ton rythme', phase: 'Ta phase',
    phase_depuis: 'Ta phase', lest_reponse: 'Lest', materiel: 'Matériel', seances_par_semaine: 'Séances par semaine',
    duree_seance_min: 'Durée d’une séance', objectif: 'Objectif', priorites: 'Priorités', temps_reponse: 'Ton temps',
    historique_declare: 'Historique', programme_choix: 'Ton programme', zones_a_menager: 'Zone à ménager',
    exercices_ecartes: 'Exercices écartés', jeu_actif: 'Le jeu', compte_prive: 'Compte privé', ma_salle: 'Ma salle',
    marche_reponses: 'Marche suivante'
  };
  // « Pas enregistré : Bio. La base a refusé cette valeur ; celle d'avant est gardée. » — `null` sans colonne.
  function phraseRefusProfil(colonnes) {
    var noms = [];
    (colonnes || []).forEach(function (c) {
      var n = LIBELLES_COLONNES[c] || 'un réglage';
      if (noms.indexOf(n) < 0) noms.push(n);
    });
    if (!noms.length) return null;
    return noms.length === 1
      ? 'Pas enregistré : ' + noms[0] + '. La base a refusé cette valeur ; celle d’avant est gardée.'
      : 'Pas enregistrés : ' + noms.join(', ') + '. La base a refusé ces valeurs ; celles d’avant sont gardées.';
  }

  // Relue sur l'appareil : un objet ou `true` (la forme d'avant 116) ; tout le reste vaut « rien n'attend ».
  function lireEnAttente(v) {
    return v === true || (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) ? v : false;
  }

  // ── Les bilans déjà annoncés (104, BILANS-V1, v2_086) ───────────────────
  // La liste des périodes annoncées (la `cle` de la période : '2026', '2026-ete', '2026-09'), la plus ancienne
  // d'abord. Au plus 200 : les plus anciennes sortent (une période ancienne ne s'annonce de toute façon plus).
  var BILANS_ANNONCES_MAX = 200;
  function bilansAnnonces(profil) {
    var l = profil && profil.bilans_annonces;
    return Array.isArray(l) ? l.filter(function (x) { return typeof x === 'string' && x; }) : [];
  }
  // La liste, plus les clés nouvelles (sans doublon, dans l'ordre), ramenée aux 200 dernières. Rien n'est muté.
  function ajouterBilansAnnonces(liste, cles) {
    var out = [];
    (Array.isArray(liste) ? liste : []).concat(Array.isArray(cles) ? cles : []).forEach(function (x) {
      if (typeof x === 'string' && x && out.indexOf(x) < 0) out.push(x);
    });
    return out.length > BILANS_ANNONCES_MAX ? out.slice(out.length - BILANS_ANNONCES_MAX) : out;
  }

  // ── Le jeu est-il allumé ? (64B, JEU-V1 §9.1) ────────────────────────────
  // Éteint SEULEMENT si le profil le dit (`false`). Absent — un cache d'avant la colonne, un profil pas encore lu,
  // pas de profil du tout — : allumé, comme le défaut de la base.
  function jeuActif(profil) {
    return !(profil && profil.jeu_actif === false);
  }

  // 87 — le compte est-il privé ? Privé SAUF si le profil dit `false` (le défaut de la base est `true`).
  function comptePrive(profil) {
    return !(profil && profil.compte_prive === false);
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

  // ══ LE QUESTIONNAIRE DU COACH (60-2a, QUESTIONNAIRE-COACH-V2 §3 et §4) ══════
  //
  // Les LISTES du questionnaire vivent ici, avec celles du profil : un libellé
  // par valeur, pour l'écran du questionnaire et pour la ligne du Profil (60-2a
  // §4.1). Les CLÉS sont celles des contraintes de la base (`v2_065`, relevées
  // par Claude.ai le 07/10/2026) : une valeur hors liste y devient un 23514 —
  // et le profil ne classe pas les refus (`profilAEnvoyer` reste vrai, l'envoi
  // de TOUTE la ligne est retenté sans fin). On refuse donc ICI, avant.
  var OBJECTIFS = [
    { cle: 'force', libelle: 'Force' },
    { cle: 'muscle', libelle: 'Muscle' },
    { cle: 'les_deux', libelle: 'Les deux' },
    { cle: 'forme', libelle: 'Forme et santé' }
  ];

  // Les quatre réponses de l'écran « Temps et matériel ». Les sous-lignes du
  // questionnaire (« Je te proposerai des séances plus courtes ») vivent dans le
  // questionnaire ; celles de la feuille du Profil (`AIDE_TEMPS`, `optionsTemps`)
  // disent ce que le coach fait de la réponse, maintenant que quelque chose la lit.
  var TEMPS_REPONSES = [
    { cle: 'max', libelle: 'C’est mon maximum' },
    { cle: 'marge', libelle: 'J’ai de la marge pour en faire plus' },
    { cle: 'moins', libelle: 'J’ai moins de temps en ce moment' },
    { cle: 'varie', libelle: 'Ça varie beaucoup' }
  ];

  var HISTORIQUES = [
    { cle: 'import', libelle: 'Oui, dans une autre app' },
    { cle: 'non_note', libelle: 'Oui, mais je ne l’ai pas noté' },
    { cle: 'debutant', libelle: 'Non, je débute' }
  ];

  // L'écran 8 (« Ton programme », 60-3) : trois chemins. « Construis-le-moi »
  // (`construis`, permis par la base) a son lecteur depuis 60-4 : le générateur
  // (QUESTIONNAIRE-COACH-V2 §5 bis).
  var PROGRAMMES = [
    { cle: 'deduit', libelle: 'Garder ce que je fais' },
    { cle: 'moi', libelle: 'Je crée mes routines moi-même' },
    { cle: 'construis', libelle: 'Construis-le-moi' }
  ];

  // ── LE PROGRAMME CONSTRUIT : zones à ménager, exercices écartés, dossier (60-4) ──
  //
  // LES ZONES À MÉNAGER (`profiles.zones_a_menager`, v2_065) : cinq clés, celles du CHECK de la base
  // (`profiles_zones_a_menager_ok`) ET celles que le générateur charge (`Generateur.CHARGE_ZONE`, un test les
  // rapproche). « Aucune » n'est pas une valeur : c'est la liste vide, écrite `NULL` (vide = NULL). Le
  // générateur seul les lit ; rien n'en change en séance (« J'ai mal » reste là).
  var ZONES_A_MENAGER = [
    { cle: 'epaule', libelle: 'Épaule' },
    { cle: 'dos', libelle: 'Dos' },
    { cle: 'genou', libelle: 'Genou' },
    { cle: 'coude', libelle: 'Coude' },
    { cle: 'hanche', libelle: 'Hanche' }
  ];

  // Une liste de zones telle que la base la veut : connues, sans doublon, dans l'ordre de `ZONES_A_MENAGER`
  // (une même sélection s'écrit toujours pareil). `[]` est valide (« aucune ») ; ce qui n'est pas une liste
  // n'en est pas une (`null`).
  function zonesAMenagerValides(liste) {
    if (!Array.isArray(liste)) return null;
    return ZONES_A_MENAGER.filter(function (z) { return liste.indexOf(z.cle) >= 0; })
      .map(function (z) { return z.cle; });
  }

  // Une zone qu'on touche : on l'ajoute, ou on la retire ; « aucune » les retire toutes. L'écran 8b et la
  // feuille du Profil la partagent : un seul geste, une seule règle.
  function basculerZone(liste, cle) {
    if (cle === 'aucune') return [];
    var l = zonesAMenagerValides(liste) || [];
    if (ZONES_A_MENAGER.every(function (z) { return z.cle !== cle; })) return l;
    var i = l.indexOf(cle);
    if (i >= 0) l.splice(i, 1);
    else l.push(cle);
    return zonesAMenagerValides(l);
  }

  // LES EXERCICES ÉCARTÉS (`profiles.exercices_ecartes`, ECRAN-SAISIE §7 quindecies.9) : des slugs du catalogue,
  // sans doublon, dans l'ordre où on les a écartés ; deux cents au plus (le CHECK de la base) — au-delà, les plus
  // anciens s'effacent. `[]` est valide ; ce qui n'est pas une liste n'en est pas une (`null`).
  var ECARTES_MAX = 200, SLUG_MAX = 120;
  function ecartesValides(liste) {
    if (!Array.isArray(liste)) return null;
    var vus = Object.create(null), sortie = [];     // sans prototype : « constructor » est un slug comme un autre
    liste.forEach(function (x) {
      if (typeof x !== 'string' || x === '' || x.length > SLUG_MAX || x !== x.trim() || vus[x]) return;
      vus[x] = true;
      sortie.push(x);
    });
    return sortie.length > ECARTES_MAX ? sortie.slice(sortie.length - ECARTES_MAX) : sortie;
  }

  // Les écartés EFFECTIFS d'un profil : la liste valide, sinon aucun.
  function ecartesDe(profil) { return ecartesValides(profil && profil.exercices_ecartes) || []; }

  // LE DOSSIER DU PROGRAMME CONSTRUIT (`profiles.programme_construit_dossier`) : la borne de `routines.dossier`
  // (`routines_dossier_ok`) — 1 à 40 caractères, SANS espace autour. Il ne se tronque pas : c'est le NOM RÉEL du
  // dossier créé, un nom coupé ne désignerait plus rien (la carte « Passer en cycles » compte les séances de ce
  // dossier).
  var DOSSIER_PROGRAMME_MAX = 40;
  function dossierDuProgrammeValide(nom) {
    return typeof nom === 'string' && nom === nom.trim() && nom.length >= 1 && nom.length <= DOSSIER_PROGRAMME_MAX
      ? nom : null;
  }

  // LES PRIORITÉS (QUESTIONNAIRE §3, écran 6) : jusqu'à trois, des EXERCICES
  // ou des MUSCLES. Les cinq exercices sont des slugs du catalogue, relevés sur
  // les fixtures tirées de la base (`cas-51-1-peu-de-temps.json` les porte
  // tous) — pas dans un catalogue statique, qui n'existe pas côté client : un
  // slug absent du catalogue d'une personne est simplement sans effet. Les six
  // muscles sont les ZONES de `semaine.js` (par leur `cle`), dans l'ordre du
  // radar (`periode.js`) : lus là, jamais recopiés — un libellé par zone.
  // 124 (audit du 16/10/2026, 06 #16) — les quatre barres et leur nom court sont écrits une fois, dans `THModele`.
  function exercicesPrioritaires() {
    var M = racine.THModele;
    return M.BARRES.map(function (b) {
      var n = M.NOM_DE_BARRE[b];
      return { cle: b, libelle: n.charAt(0).toUpperCase() + n.slice(1) };
    }).concat([{ cle: 'tractions', libelle: 'Tractions' }]);
  }
  var PRIORITES_MAX = 3;

  function musclesPrioritaires() {
    var zones = (racine.THSemaine && racine.THSemaine.ZONES) || [];
    var ordre = (racine.THPeriode && racine.THPeriode.ORDRE) ||
      zones.map(function (z) { return z.cle; });
    var sortie = [];
    ordre.forEach(function (cle) {
      zones.forEach(function (z) { if (z.cle === cle) sortie.push({ cle: z.cle, libelle: z.libelle }); });
    });
    return sortie;
  }

  // Une liste de priorités telle que la base la veut : connues, sans doublon,
  // trois au plus (dans l'ordre où on les a choisies). `[]` est une RÉPONSE
  // (« Pas de priorité »), pas un trou ; ce qui n'est pas une liste n'en est pas
  // une (`null`).
  function prioritesValides(liste) {
    if (!Array.isArray(liste)) return null;
    var connues = {};
    exercicesPrioritaires().concat(musclesPrioritaires()).forEach(function (x) { connues[x.cle] = true; });
    var vues = {}, sortie = [];
    liste.forEach(function (c) {
      if (sortie.length >= PRIORITES_MAX || !connues[c] || vues[c]) return;
      vues[c] = true;
      sortie.push(c);
    });
    return sortie;
  }

  // LES PRIORITÉS EFFECTIVES d'un profil (MOTEUR §14.6, 60-2b) : la liste de
  // chaînes que la base donne, sinon aucune — `null` (jamais répondu) et `[]`
  // (« Pas de priorité ») valent la même chose pour le coach. Elle se LIT sans se
  // valider (`prioritesValides` garde l'ÉCRITURE) : une valeur ancienne ou inconnue
  // (un exercice retiré du catalogue, une zone renommée) ne correspond à rien, ni
  // routine ni zone, donc n'a aucun effet — inoffensive sans qu'on la filtre.
  function prioritesDe(profil) {
    var l = profil && profil.priorites;
    return Array.isArray(l) ? l.filter(function (x) { return typeof x === 'string'; }) : [];
  }

  // LE GEL des priorités, jumeau de `phaseGelee` : lues UNE fois, gelées pour la
  // séance — changer une priorité dans Profil en pleine séance ne fait ni
  // apparaître ni disparaître une carte de série de plus (I12 : le mémo du plan
  // ne voit pas les priorités). `gel` : `{ seanceId, priorites }` ou `null` ;
  // `sauvee` : la liste gelée relue du disque (rechargement) — ⚠️ `[]` est une
  // valeur LÉGITIME ; ce qui n'est pas une liste veut dire « rien de sauvé »
  // (séance gelée avant 60-2b) : alors, les priorités du profil maintenant.
  function prioritesGelees(gel, seanceId, sauvee, profil) {
    if (gel && gel.seanceId === seanceId) return gel;
    return { seanceId: seanceId, priorites: Array.isArray(sauvee) ? prioritesDe({ priorites: sauvee }) : prioritesDe(profil) };
  }

  // Une priorité qu'on touche : on l'ajoute, ou on la retire ; trois au plus (la
  // quatrième est sans effet). Le questionnaire et la feuille du Profil la
  // partagent : un seul geste, une seule règle.
  function basculerPriorite(liste, cle) {
    var l = Array.isArray(liste) ? liste.slice() : [];
    var i = l.indexOf(cle);
    if (i >= 0) { l.splice(i, 1); return l; }
    if (l.length >= PRIORITES_MAX) return l;
    l.push(cle);
    return l;
  }

  function libelleDePriorite(cle) {
    return libelleDe(exercicesPrioritaires(), cle) || libelleDe(musclesPrioritaires(), cle) || cle;
  }

  // Ce que la ligne « Priorités » montre : `null` (pas répondu → « à renseigner »),
  // « Pas de priorité » (`[]`, une réponse), ou les libellés dans l'ordre choisi.
  function resumeDesPriorites(liste) {
    if (!Array.isArray(liste)) return null;
    return liste.length ? liste.map(libelleDePriorite).join(', ') : 'Pas de priorité';
  }

  function memeListe(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function dansLaListe(liste, cle) {
    for (var i = 0; i < liste.length; i++) if (liste[i].cle === cle) return true;
    return false;
  }

  function entierDans(v, min, max) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) && Math.floor(n) === n && n >= min && n <= max ? n : null;
  }

  // `profiles_rythme_borne` : 10 à 300 minutes (les durées PROPOSÉES au profil
  // en sont un sous-ensemble ; celles du questionnaire vont jusqu'à 120).
  var DUREE_MIN = 10, DUREE_MAX = 300;

  // ══ LA PRÉPARATION DES CHAMPS — UNE FOIS, POUR LE QUESTIONNAIRE ET LE PROFIL ═
  //
  // Une réponse devient les colonnes à écrire. Le questionnaire (un écran à la
  // fois) et le Profil (une ligne à la fois) appellent CETTE fonction : une
  // valeur changée écrit la même chose partout, et les dates qui la datent
  // aussi.
  //
  //   · RIEN QUI N'AIT CHANGÉ N'EST ÉCRIT — comparé au profil tel qu'on le
  //     connaît. Une réponse vide ne vide rien (le questionnaire ne sait pas
  //     effacer) ; une valeur hors liste ou hors bornes ne part pas.
  //   · `objectif_depuis` : QUAND l'objectif change, et seulement alors.
  //   · `phase_depuis` : quand la phase EFFECTIVE change (un vide vaut
  //     « maintien », `phaseDe`). `phase_confirmee_le` : à CHAQUE réponse sur la
  //     phase, changée ou non — c'est la date que lira le rappel de phase
  //     (60-2b). « Je ne sais pas » écrit une phase VIDE (QUESTIONNAIRE §3, 60-2c).
  //   · L'ANNÉE ne réécrit `date_naissance` que si elle change : le 1er
  //     janvier de l'année tapée. Une date complète déjà saisie est gardée.
  //   · `fait: true` pose `questionnaire_fait_le`.
  //
  // `entrees` : `{ historique_declare, anciennete, seances_par_semaine,
  // duree_seance_min, sexe, annee_naissance, taille_cm, objectif, phase,
  // priorites, temps_reponse, materiel, rythme_progression, intention, fait }`,
  // tous facultatifs. `maintenant` : l'horloge, passée pour les tests.
  function preparerChamps(profil, entrees, maintenant) {
    var p = profil || {}, e = entrees || {}, sortie = {};
    var quand = (maintenant instanceof Date ? maintenant : new Date()).toISOString();
    var present = function (v) { return v !== undefined && v !== null && v !== ''; };
    var differe = function (cle, v) { return v !== p[cle]; };

    function fermee(cle, liste) {
      if (present(e[cle]) && dansLaListe(liste, e[cle]) && differe(cle, e[cle])) sortie[cle] = e[cle];
    }
    fermee('historique_declare', HISTORIQUES);
    fermee('anciennete', ANCIENNETES);
    fermee('sexe', SEXES);
    fermee('materiel', MATERIELS);
    fermee('temps_reponse', TEMPS_REPONSES);
    fermee('rythme_progression', RYTHMES);
    fermee('intention', INTENTIONS);
    fermee('programme_choix', PROGRAMMES);

    var seances = entierDans(e.seances_par_semaine, SEANCES_MIN, SEANCES_MAX);
    if (seances !== null && differe('seances_par_semaine', seances)) sortie.seances_par_semaine = seances;
    var duree = entierDans(e.duree_seance_min, DUREE_MIN, DUREE_MAX);
    if (duree !== null && differe('duree_seance_min', duree)) sortie.duree_seance_min = duree;
    var taille = present(e.taille_cm) ? tailleValide(e.taille_cm) : null;
    if (taille !== null && differe('taille_cm', taille)) sortie.taille_cm = taille;

    if (present(e.annee_naissance)) {
      var an = entierDans(e.annee_naissance, 1000, 9999);
      var avant = p.date_naissance ? Number(String(p.date_naissance).slice(0, 4)) : null;
      var jour = an !== null ? naissanceValide(an + '-01-01', maintenant instanceof Date ? maintenant : new Date()) : null;
      if (jour !== null && avant !== an) sortie.date_naissance = jour;
    }

    if (present(e.objectif) && dansLaListe(OBJECTIFS, e.objectif) && differe('objectif', e.objectif)) {
      sortie.objectif = e.objectif;
      sortie.objectif_depuis = quand;
    }

    // « Je ne sais pas » (`'inconnue'`) écrit le VIDE (60-2c) : la colonne reste NULL, le coach
    // la compte « maintien » (`phaseDe`) et le rappel de phase ne la voit pas. Le vide se compare
    // à ce que la base porte (`declaree`), pas à un `undefined` : jamais d'écriture pour rien.
    if (present(e.phase)) {
      var vide = e.phase === 'inconnue';
      var cible = vide ? null : e.phase;
      if (vide || PHASES_EN_BASE.indexOf(cible) >= 0) {
        var declaree = PHASES_EN_BASE.indexOf(p.phase) >= 0 ? p.phase : null;
        if (declaree !== cible) sortie.phase = cible;
        if (phaseDe(p) !== (cible || PHASE_DEFAUT)) sortie.phase_depuis = quand;
        sortie.phase_confirmee_le = quand;
      }
    }

    if (e.priorites !== undefined && e.priorites !== null) {
      var liste = prioritesValides(e.priorites);
      if (liste !== null && !memeListe(liste, p.priorites)) sortie.priorites = liste;
    }

    // 60-4 — le programme construit. Les listes vides s'écrivent `NULL` (vide = NULL) et se comparent
    // comme telles : « aucune zone » sur une colonne vide n'écrit rien. Un dossier hors des bornes, une date
    // illisible ne partent pas (un 23514 bloquerait l'envoi de tout le profil).
    if (e.zones_a_menager !== undefined && e.zones_a_menager !== null) {
      var zones = zonesAMenagerValides(e.zones_a_menager);
      if (zones !== null && !memeListe(zones, zonesAMenagerValides(p.zones_a_menager) || [])) {
        sortie.zones_a_menager = zones.length ? zones : null;
      }
    }
    if (e.exercices_ecartes !== undefined && e.exercices_ecartes !== null) {
      var ecartes = ecartesValides(e.exercices_ecartes);
      if (ecartes !== null && !memeListe(ecartes, ecartesValides(p.exercices_ecartes) || [])) {
        sortie.exercices_ecartes = ecartes.length ? ecartes : null;
      }
    }
    if (present(e.programme_construit_dossier)) {
      var dossier = dossierDuProgrammeValide(e.programme_construit_dossier);
      if (dossier !== null && differe('programme_construit_dossier', dossier)) sortie.programme_construit_dossier = dossier;
    }
    ['programme_construit_le', 'carte_cycles_le'].forEach(function (cle) {
      if (!present(e[cle])) return;
      var t = e[cle] instanceof Date ? e[cle] : new Date(e[cle]);
      if (!isNaN(t.getTime()) && differe(cle, t.toISOString())) sortie[cle] = t.toISOString();
    });

    if (e.fait === true) sortie.questionnaire_fait_le = quand;
    return sortie;
  }

  // ══ « TON BUT » ET « TON TEMPS », AU PROFIL (60-2a, QUESTIONNAIRE-COACH-V2 §6) ═
  //
  // Les mêmes réponses que le questionnaire, une ligne à la fois : elles s'écrivent
  // par `preparerChamps` (ci-dessus), donc `objectif_depuis` suit un objectif qui
  // change, et une réponse inchangée n'écrit rien. Les phrases d'aide (#382 les avait
  // retirées : elles promettaient un effet absent) sont revenues avec leurs lecteurs
  // (60-2b) : voir `AIDE_OBJECTIF`, `AIDE_PRIORITES`, `optionsTemps`. `ouvrir(cle)` ouvre
  // la feuille de la ligne (`objectif`, `priorites`, `temps_reponse`) : le voile vit chez l'appelant.
  function sectionBut(profil, ouvrir) {
    var p = profil || {};
    return {
      titre: 'TON BUT',
      lignes: [
        { libelle: 'Objectif', valeur: libelleDe(OBJECTIFS, p.objectif),
          surChoix: function () { ouvrir('objectif'); } },
        { libelle: 'Priorités', valeur: resumeDesPriorites(p.priorites),
          surChoix: function () { ouvrir('priorites'); } }
      ]
    };
  }

  // LES PHRASES D'AIDE de « Ton but » et « Ton temps » (ECRAN-PROFIL §4 bis, 08/10/2026,
  // 60-2b) : chaque réponse dit ce que le coach en fait — maintenant que quelque chose la
  // lit. Elles s'écrivent ICI, une fois : l'écran ne compose aucun mot.
  //   · Objectif et Priorités : une phrase sous le titre de la feuille ;
  //   · Ton temps : une sous-ligne par réponse, et seulement pour celles que quelque chose
  //     lit en séance — « C'est mon maximum » et « J'ai de la marge » n'ont pas de phrase.
  var AIDE_OBJECTIF = 'Il choisit la zone de ton premier bloc de programme : Lourd pour la force, Mix pour le muscle.';
  var AIDE_PRIORITES = 'Un exercice prioritaire est coché d’office dans un programme. Un muscle prioritaire peut ' +
    'recevoir une série de plus jusqu’à ton plus haut volume, hors sèche.';
  var AIDE_TEMPS = {
    moins: 'Quand ta routine dépasse ta durée visée, je te propose de la raccourcir dès son ouverture.',
    varie: 'Quand ta routine dépasse ta durée visée, je te le montre à côté de « J’ai peu de temps ».'
  };

  // Les quatre réponses de « Ton temps », celles qui ont une phrase la portant en sous-ligne.
  function optionsTemps() {
    return TEMPS_REPONSES.map(function (o) {
      return Object.prototype.hasOwnProperty.call(AIDE_TEMPS, o.cle)
        ? { cle: o.cle, libelle: o.libelle, sous: AIDE_TEMPS[o.cle] } : { cle: o.cle, libelle: o.libelle };
    });
  }

  // ── « MOINS EN CE MOMENT » DEMANDE COMBIEN (60-2c, QUESTIONNAIRE §3) ──────────
  //
  // Choisir « Moins en ce moment » fait apparaître JUSTE DESSOUS quatre durées, 45 · 60 · 75 ·
  // 90 min : sans durée, la réponse n'a pas de lecteur (`Moteur.reponseDeTemps` ne lit que
  // `duree_seance_min`). UNE SEULE fonction compose ces puces pour l'écran 7 du questionnaire
  // ET pour la feuille « Ton temps » du Profil — elle ne dessine rien et ne lit rien :
  //   · `declaree`   — `duree_seance_min` (la durée visée, déclarée), ou `null` ;
  //   · `habituelle` — la durée habituelle MONTRÉE (la médiane des séances, un nombre), ou `null` ;
  //   · `choisie`    — la puce que la personne vient de toucher, ou `null`.
  // `valeur` (la puce cochée) : celle qu'on vient de toucher ; sinon la durée visée, SI elle est
  // l'une des quatre ET plus courte que l'habituelle (« moins » que d'habitude) ; sinon aucune.
  // L'écriture reste `preparerChamps` : `duree_seance_min` avec `temps_reponse`, et rien du tout
  // tant qu'aucune puce n'est touchée.
  var DUREES_DE_MOINS = [45, 60, 75, 90];
  var TITRE_DUREES_DE_MOINS = 'Combien de temps par séance ?';

  function pucesDeMoins(declaree, habituelle, choisie) {
    var dedans = function (v) { return DUREES_DE_MOINS.indexOf(Number(v)) >= 0; };
    var valeur = null;
    if (dedans(choisie)) valeur = Number(choisie);
    else if (dedans(declaree) && typeof habituelle === 'number' && Number(declaree) < habituelle) valeur = Number(declaree);
    return {
      cle: 'dureeMoins', titre: TITRE_DUREES_DE_MOINS, valeur: valeur,
      options: DUREES_DE_MOINS.map(function (n) { return { cle: n, libelle: n + ' min' }; })
    };
  }

  // La ligne « Ton temps », sous la durée d'une séance (« Ta semaine »).
  function ligneTemps(profil, ouvrir) {
    return { libelle: 'Ton temps', valeur: libelleDe(TEMPS_REPONSES, (profil || {}).temps_reponse),
             surChoix: function () { ouvrir('temps_reponse'); } };
  }

  // « Terminer mon questionnaire › », en tête du Profil tant qu'il n'est pas rempli
  // (QUESTIONNAIRE §2) ; `null` sinon — y compris pour une ligne qu'on ne connaît
  // pas (même règle que l'ouverture : on ne devine pas).
  function ligneQuestionnaire(profil, ouvrir) {
    if (!questionnaireAFaire(profil)) return null;
    return { libelle: 'Terminer mon questionnaire', surChoix: ouvrir };
  }

  // ══ LE PROGRAMME CONSTRUIT, AU PROFIL (60-4, ECRAN-PROFIL §4 bis, G10) ════════
  //
  // Trois lignes dans la section du matériel : « Zone à ménager » (une feuille à puces), « Exercices écartés » (la
  // liste, « Reprendre » sur chacun ; vide : la ligne ne s'affiche pas) et « Refaire mon programme » (les deux
  // questions de l'écran 8b, puis l'aperçu ; un NOUVEAU dossier, l'ancien reste). Chaque phrase dit ce qui est
  // branché : le programme construit lit la zone et les écartés, rien d'autre.
  var PHRASE_ZONES = 'Ton programme construit la garde sans série lourde. Rien ne change en séance.';
  var PHRASE_ECARTES = 'Un exercice écarté n\u2019est plus proposé dans tes programmes. Il reste au catalogue, en fin de liste.';
  var PHRASE_REFAIRE = 'Je te pose deux questions et je te construis un nouveau dossier. Le tien reste tel quel.';

  // « Genou, Dos » — dans l'ordre de la liste ; « Aucune » quand il n'y en a pas (une réponse, pas un trou).
  function libelleDesZones(profil) {
    var zones = zonesAMenagerValides(profil && profil.zones_a_menager) || [];
    if (!zones.length) return 'Aucune';
    return ZONES_A_MENAGER.filter(function (z) { return zones.indexOf(z.cle) >= 0; })
      .map(function (z) { return z.libelle; }).join(', ');
  }

  // `ouvrir(quoi)` : 'zones', 'ecartes' ou 'refaire'. Les lignes sont rendues par `rendreProfil` comme les autres.
  function lignesProgramme(profil, ouvrir) {
    var lignes = [{ libelle: 'Zone à ménager', sous: PHRASE_ZONES, valeur: libelleDesZones(profil),
                    surChoix: function () { ouvrir('zones'); } }];
    var ecartes = ecartesDe(profil);
    if (ecartes.length) {
      lignes.push({ libelle: 'Exercices écartés', sous: PHRASE_ECARTES, valeur: String(ecartes.length),
                    surChoix: function () { ouvrir('ecartes'); } });
    }
    lignes.push({ libelle: 'Refaire mon programme', sous: PHRASE_REFAIRE, sansValeur: true,
                  surChoix: function () { ouvrir('refaire'); } });
    return lignes;
  }

  // ══ MA SALLE (MOTEUR §10 bis, ECRAN-PROFIL §2.4 quinquies — 108, décidé le 15/10/2026) ══
  //
  // « Seulement pour qui le déclare ; non renseigné, rien ne change (on suppose qu'on peut ajouter des disques). »
  // Une fois, dans le Profil : les barres fixes EZ et droites (les poids cochés), et les haltères (jusqu'à X kg, de
  // Y en Y). Les machines : pas pour l'instant. En base, UNE colonne (`profiles.ma_salle`, jsonb, v2_088) :
  //   `{ barres_ez: [10, 15, …], barres_droites: [10, …], halteres: { max: 40, pas: 2 } | [{ jusqua, pas }, …] | null }`,
  //   ou `NULL` (les tranches : 123, v2_095 — plus bas).
  // Les bornes ci-dessous DOUBLENT la contrainte `profiles_ma_salle_ok` : un 23514 bloquerait l'envoi de TOUT le
  // profil (la file le classe définitif) — on refuse avant, on ne l'envoie pas.
  //
  // ⚠️ LES HALTÈRES SE DÉCLARENT PAR HALTÈRE, comme une salle les range (« jusqu'à 40 kg, de 2 en 2 ») ; les séries
  // les notent pour la PAIRE (MOTEUR §10.1 : 92 kg = 2 × 46). La conversion est faite ici, une fois.
  var SALLE_BARRE_MIN = 1, SALLE_BARRE_MAX = 100, SALLE_BARRES_MAX = 20;
  var SALLE_HALTERES_MIN = 1, SALLE_HALTERES_MAX = 100, SALLE_PAS_MIN = 0.5, SALLE_PAS_MAX = 10;
  // Les puces de la maquette validée (15/10/2026) ; « ＋ » ajoute un autre poids.
  var SALLE_BARRES_PROPOSEES = { barres_ez: [10, 15, 20, 25, 30, 35, 40], barres_droites: [10, 15, 20, 25, 30] };
  var SALLE_PAS_PROPOSES = [1, 2, 2.5, 5];
  var PHRASE_SALLE = 'Non renseigné : le coach suppose qu’on peut ajouter des disques, comme aujourd’hui.';
  var PHRASE_BARRES_FIXES = 'Les barres déjà chargées de ta salle. Le coach ne te proposera que ces charges-là.';

  // Un nombre (jamais une chaîne : la contrainte refuse « "10" »), au demi-kilo.
  function auDemi(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.abs(v * 2 - Math.round(v * 2)) < 1e-9 ? Math.round(v * 2) / 2 : null;
  }
  // Une liste de barres valide : des poids au demi-kilo, de 1 à 100 kg, sans doublon, croissants, au plus 20 ; ou
  // `null` si un poids est hors bornes (on refuse, on ne corrige pas en silence).
  function barresValides(l) {
    if (l === null || l === undefined) return [];
    if (!Array.isArray(l)) return null;
    var sortie = [];
    for (var i = 0; i < l.length; i++) {
      var v = auDemi(l[i]);
      if (v === null || v < SALLE_BARRE_MIN || v > SALLE_BARRE_MAX) return null;
      if (sortie.indexOf(v) < 0) sortie.push(v);
    }
    sortie.sort(function (a, b) { return a - b; });
    return sortie.length > SALLE_BARRES_MAX ? null : sortie;
  }
  // 123 (16/10/2026, v2_095) — LES HALTÈRES PAR TRANCHES. Demande d'Aurélien, mot pour mot : « Ok ma salle, par contre
  // pour les petites haltères de 1 à 10 c'est de 1 en 1 » (Basic-Fit : de 1 en 1 jusqu'à 10 kg, puis de 2 en 2
  // jusqu'à 40). Une tranche `{ jusqua, pas }` donne les multiples de son pas, de la fin de la précédente (exclue ; 0
  // pour la première) à son « jusqu'à » (inclus) ; 1 à 3 tranches, des « jusqu'à » croissants, chaque pas au plus la
  // longueur de sa tranche (il y a toujours une charge dedans — `pas ≤ max` d'avant). DEUX FORMES ÉCRITES :
  //   · UNE tranche : l'ancienne, `{ max, pas }` — acceptée par v2_088 comme par v2_095, lue par toutes les apps en
  //     circulation (un autre appareil resté sur une version d'avant ne perd pas la salle) ;
  //   · deux ou trois : la liste `[{ jusqua, pas }, …]` (v2_095). Avant la migration, la base la refuse (23514) : la
  //     colonne sort de l'envoi, la salle d'avant est gardée, le Profil le dit (le mécanisme de 116, `estRefusDefinitif`)
  //     — rien n'est inventé (aucune tranche « équivalente » écrite à la place de celle déclarée).
  // L'ancienne forme est lue comme une tranche unique, jamais réécrite sans geste. `halteresValides` rend la forme
  // écrite ; `tranchesDe` la liste des tranches, quelle que soit la forme.
  var SALLE_TRANCHES_MAX = 3;
  function tranchesValides(l) {
    if (!Array.isArray(l) || !l.length || l.length > SALLE_TRANCHES_MAX) return undefined;
    var t = [];
    for (var i = 0; i < l.length; i++) {
      var x = l[i];
      if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
      var j = auDemi(x.jusqua), pas = auDemi(x.pas);
      if (j === null || pas === null || j < SALLE_HALTERES_MIN || j > SALLE_HALTERES_MAX ||
          pas < SALLE_PAS_MIN || pas > SALLE_PAS_MAX) return undefined;
      t.push({ jusqua: j, pas: pas });
    }
    t.sort(function (a, b) { return a.jusqua - b.jusqua; });
    for (var k = 0; k < t.length; k++) {
      var debut = k ? t[k - 1].jusqua : 0;
      if (t[k].jusqua <= debut || t[k].pas > t[k].jusqua - debut) return undefined;
    }
    return t;
  }
  function halteresValides(h) {
    if (h === null || h === undefined) return null;
    if (typeof h !== 'object') return undefined;
    var t = Array.isArray(h) ? tranchesValides(h) : tranchesValides([{ jusqua: h.max, pas: h.pas }]);
    if (t === undefined) return undefined;
    return t.length === 1 ? { max: t[0].jusqua, pas: t[0].pas } : t;
  }
  // Les tranches d'une forme écrite (valide), ou `[]`.
  function tranchesDe(h) {
    if (!h) return [];
    return Array.isArray(h) ? h.map(function (t) { return { jusqua: t.jusqua, pas: t.pas }; })
      : [{ jusqua: h.max, pas: h.pas }];
  }
  // Les charges PAR HALTÈRE que les tranches font, croissantes : Aurélien, 1 … 10, 12, 14 … 40.
  function chargesDesTranches(tranches) {
    var sortie = [], debut = 0;
    (tranches || []).forEach(function (t) {
      for (var k = Math.floor(debut / t.pas + 1e-9) + 1; k * t.pas <= t.jusqua + 1e-9 && sortie.length < 400; k++) {
        var v = Math.round(k * t.pas * 100) / 100;
        if (v > debut + 1e-9) sortie.push(v);
      }
      debut = t.jusqua;
    });
    return sortie;
  }
  // LA DÉCLARATION, normalisée : l'objet tel qu'il s'écrit, `null` quand rien n'est déclaré (non renseigné), ou
  // `undefined` quand une valeur est hors bornes (refusée : rien ne s'écrit).
  function salleValide(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object' || Array.isArray(v)) return undefined;
    var ez = barresValides(v.barres_ez), droites = barresValides(v.barres_droites), h = halteresValides(v.halteres);
    if (ez === null || droites === null || h === undefined) return undefined;
    if (!ez.length && !droites.length && h === null) return null;
    return { barres_ez: ez, barres_droites: droites, halteres: h };
  }
  // La salle d'un profil, lisible, ou `null` (absente, illisible, ou une colonne pas encore là : rien ne change).
  function salleDe(profil) {
    var s = salleValide(profil && profil.ma_salle);
    return s === undefined ? null : s;
  }
  // Les gestes de la feuille, en fonctions pures (la feuille garde un brouillon ; « Valider » l'écrit).
  // 123 — les haltères du brouillon : `null` (« Pas d'haltères », ou rien de déclaré), ou les lignes de la feuille,
  // une par tranche : `{ jusqua (null : vide ou illisible), pas, pasChoisi }`.
  function brouillonSalle(profil) {
    var s = salleDe(profil);
    return s ? { barres_ez: s.barres_ez.slice(), barres_droites: s.barres_droites.slice(),
                 halteres: s.halteres ? tranchesDe(s.halteres).map(function (t) {
                   return { jusqua: t.jusqua, pas: t.pas, pasChoisi: true };
                 }) : null }
             : { barres_ez: [], barres_droites: [], halteres: null };
  }
  function basculerBarre(brouillon, type, kg) {
    var b = Object.assign({}, brouillon);
    var l = (b[type] || []).slice(), v = auDemi(kg);
    if (v === null) return b;
    var i = l.indexOf(v);
    if (i >= 0) l.splice(i, 1);
    else if (v >= SALLE_BARRE_MIN && v <= SALLE_BARRE_MAX && l.length < SALLE_BARRES_MAX) l.push(v);
    l.sort(function (x, y) { return x - y; });
    b[type] = l;
    return b;
  }
  // Les haltères du brouillon : le « jusqu'à » tapé de la ligne `i` (`null` : effacé) et l'écart choisi (2 kg par
  // défaut, la maquette). Une seule ligne, sans « jusqu'à » ni écart choisi : pas d'haltères ; un écart sans
  // « jusqu'à » attend sa saisie (« Valider » n'écrit alors pas d'haltères, `halteresGardees`).
  var SALLE_PAS_DEFAUT = 2;
  function lignesHalteres(brouillon) {
    var h = brouillon && brouillon.halteres;
    return Array.isArray(h) ? h.map(function (l) { return Object.assign({}, l); }) : null;
  }
  function poserMaxHalteres(brouillon, max, i) {
    var b = Object.assign({}, brouillon), l = lignesHalteres(b), n = i || 0;
    var m = max === null || max === undefined || max === '' || !isFinite(Number(max)) ? null : Number(max);
    if (!l) {
      if (m !== null && n === 0) b.halteres = [{ jusqua: m, pas: SALLE_PAS_DEFAUT, pasChoisi: false }];
      return b;
    }
    if (!l[n]) return b;
    l[n] = { jusqua: m, pas: l[n].pas, pasChoisi: !!l[n].pasChoisi };
    b.halteres = l.length === 1 && m === null && !l[0].pasChoisi ? null : l;
    return b;
  }
  function poserPasHalteres(brouillon, pas, i) {
    var b = Object.assign({}, brouillon), l = lignesHalteres(b), n = i || 0;
    if (!l) { b.halteres = [{ jusqua: null, pas: Number(pas), pasChoisi: true }]; return b; }
    if (!l[n]) return b;
    l[n] = { jusqua: l[n].jusqua, pas: Number(pas), pasChoisi: true };
    b.halteres = l;
    return b;
  }
  // « + Une tranche » (au plus 3) : une ligne de plus, vide, à l'écart de la précédente.
  function ajouterTrancheHalteres(brouillon) {
    var b = Object.assign({}, brouillon), l = lignesHalteres(b);
    if (!l || l.length >= SALLE_TRANCHES_MAX) return b;
    l.push({ jusqua: null, pas: l[l.length - 1].pas, pasChoisi: false });
    b.halteres = l;
    return b;
  }
  function retirerTrancheHalteres(brouillon, i) {
    var b = Object.assign({}, brouillon), l = lignesHalteres(b);
    if (!l || !l[i]) return b;
    l.splice(i, 1);
    b.halteres = l.length ? l : null;
    return b;
  }
  // « Pas d'haltères » : le geste explicite (point resté ouvert au 116 — vider le champ ne les efface plus).
  function sansHalteres(brouillon) {
    return Object.assign({}, brouillon, { halteres: null });
  }
  // « + Une tranche » se propose : des lignes, moins de 3.
  function peutAjouterTranche(brouillon) {
    var l = lignesHalteres(brouillon);
    return !!l && l.length < SALLE_TRANCHES_MAX;
  }
  // Les puces d'un type : celles de la maquette, plus les poids ajoutés (« ＋ »), croissantes.
  function pucesDeBarres(brouillon, type) {
    var l = (SALLE_BARRES_PROPOSEES[type] || []).slice();
    ((brouillon && brouillon[type]) || []).forEach(function (v) { if (l.indexOf(v) < 0) l.push(v); });
    return l.sort(function (a, b) { return a - b; }).map(function (v) {
      return { kg: v, coche: ((brouillon && brouillon[type]) || []).indexOf(v) >= 0 };
    });
  }
  // Ce qui part en base : `{ ma_salle }` — l'objet, ou `NULL` quand rien n'est déclaré ; `null` (rien à écrire)
  // quand le brouillon est hors bornes. Les haltères : une tranche → `{ max, pas }`, deux ou trois → la liste (123).
  function champsSalle(brouillon) {
    var b = Object.assign({}, brouillon || {});
    // Une ligne sans « jusqu'à » (un écart choisi sans le plus lourd) : rien à déclarer pour elle.
    var l = (lignesHalteres(b) || []).filter(function (x) { return x.jusqua !== null && x.jusqua !== undefined; });
    b.halteres = l.length ? l.map(function (x) { return { jusqua: x.jusqua, pas: x.pas }; }) : null;
    var s = salleValide(b);
    return s === undefined ? null : { ma_salle: s };
  }
  // La phrase d'un brouillon hors bornes (la feuille reste ouverte) : celle d'avant pour une tranche unique.
  function phraseHalteresHorsBornes(brouillon) {
    var l = lignesHalteres(brouillon) || [];
    var pas = (racine.THModele ? racine.THModele.nombreSigne(SALLE_PAS_MIN) : String(SALLE_PAS_MIN));
    if (l.length <= 1) {
      return 'Haltères : le plus lourd entre ' + SALLE_HALTERES_MIN + ' et ' + SALLE_HALTERES_MAX + ' kg, un écart de ' +
        pas + ' à ' + SALLE_PAS_MAX + ' kg.';
    }
    return 'Haltères : chaque « jusqu’à » entre ' + SALLE_HALTERES_MIN + ' et ' + SALLE_HALTERES_MAX +
      ' kg, plus lourd que le précédent ; un écart de ' + pas + ' à ' + SALLE_PAS_MAX + ' kg, pas plus grand que sa tranche.';
  }
  // 116 (audit du 16/10/2026, 03 #8) — UN « JUSQU'À » VIDÉ OU ILLISIBLE N'EFFACE PAS LES HALTÈRES DÉCLARÉS. Le champ
  // est numérique : une faute de frappe (« 4O ») s'y lit vide, et « Valider » écrivait la salle SANS haltères, sans
  // un mot. Haltères déjà déclarés et un « jusqu'à » absent du brouillon : la feuille reste ouverte, la ligne reprend
  // le « jusqu'à » déclaré (l'écart choisi est gardé), et une phrase dit pourquoi. `null` : rien à garder.
  // 123 — par ligne : avec autant de lignes que de tranches déclarées, chaque ligne vide reprend la sienne ; sinon
  // (une tranche ajoutée et laissée vide, rien de déclaré mais une autre ligne remplie) la feuille reste ouverte, rien
  // n'est repris, et la phrase dit quoi faire. Toutes vides et rien de déclaré : pas d'haltères (inchangé).
  function halteresGardees(profil, brouillon) {
    var l = lignesHalteres(brouillon);
    if (!l) return null;
    var vides = [];
    l.forEach(function (x, i) { if (x.jusqua === null || x.jusqua === undefined) vides.push(i); });
    if (!vides.length) return null;
    var s = salleDe(profil), declarees = s ? tranchesDe(s.halteres) : [];
    if (!declarees.length && vides.length === l.length) return null;
    if (declarees.length !== l.length) {
      return { brouillon: brouillon,
               phrase: '« Jusqu’à » vide ou illisible : remplis-le, ou retire la tranche.' };
    }
    var repris = [];
    vides.forEach(function (i) {
      l[i] = { jusqua: declarees[i].jusqua, pas: l[i].pas, pasChoisi: true };
      repris.push(declarees[i].jusqua + ' kg');
    });
    var b = Object.assign({}, brouillon, { halteres: l });
    return { brouillon: b,
             phrase: l.length === 1 ? '« Jusqu’à » vide ou illisible : tes haltères restent à ' + declarees[0].jusqua + ' kg.'
               : '« Jusqu’à » vide ou illisible : je remets ' + repris.join(' et ') + '.' };
  }

  // « EZ, droite, haltères » — ce qui est déclaré ; `null` : non renseigné.
  function resumeSalle(profil) {
    var s = salleDe(profil);
    if (!s) return null;
    var t = [];
    if (s.barres_ez.length) t.push('EZ');
    if (s.barres_droites.length) t.push(t.length ? 'droite' : 'Barre droite');
    if (s.halteres) t.push(t.length ? 'haltères' : 'Haltères');
    return t.join(', ');
  }
  function ligneSalle(profil, ouvrir) {
    return { libelle: 'Ma salle', sous: PHRASE_SALLE, valeur: resumeSalle(profil), surChoix: ouvrir };
  }

  // ── QUELLE SALLE POUR QUEL EXERCICE (MOTEUR §10 bis) ─────────────────────
  //
  // La donnée du catalogue qui dit le matériel : `exercises.equipement`. `haltere` → les haltères déclarés. `barre`
  // → une barre FIXE, sauf la barre lourde (les quatre barres et leurs frères à la barre, la définition du générateur,
  // `THGenerateur.estBarreLourde`) : une barre olympique chargée de disques n'est pas concernée. Laquelle : le NOM au
  // catalogue (« Curl Biceps (Barre EZ) ») — `equipement` ne distingue pas l'EZ de la droite —, sinon la barre droite.
  // Le moteur ajoute une garde (`salleEnVigueur`) : un palier au-delà de la plus lourde barre fixe déclarée vient
  // d'une barre qu'on charge, et la salle n'en dit rien.
  //
  // Rend `{ materiel: 'barre_ez' | 'barre_droite' | 'halteres', charges: [...] }` (charges des séries : une barre, son
  // poids ; des haltères, la paire), ou `null` : rien de déclaré pour ce matériel, ou un exercice qui n'est pas
  // concerné — et alors rien ne change.
  function estBarreEZ(fiche) {
    var nom = sansAccent(String((fiche && fiche.nom) || '').toLowerCase());
    return /\bbarre ez\b/.test(nom) || /(^|_)ez(_|$)/.test(String((fiche && fiche.slug) || ''));
  }
  // §10 bis (16/10/2026) — `isolation: true` pour un exercice d'isolation (la définition du moteur,
  // `THMoteur.estIsolation` sur les trois listes de muscles du catalogue : des muscles, moins de trois ; un exercice
  // sans muscle connu n'en est pas une — 124, la même que le plan) : à la plus lourde de la salle, sa fourchette
  // s'étend jusqu'à 15 reps. La clé n'y figure que si elle est vraie.
  function avecIsolation(salle, fiche) {
    var Mo = racine.THMoteur;
    if (!salle || !Mo || !Mo.estIsolation) return salle;
    var muscles = { prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [],
                    stab: fiche.muscles_stabilisateurs || [] };
    return Mo.estIsolation(muscles) ? Object.assign(salle, { isolation: true }) : salle;
  }
  function salleDeLExercice(profil, slug, index) {
    var s = salleDe(profil);
    var fiche = index && slug && Object.prototype.hasOwnProperty.call(index, slug) ? index[slug] : null;
    if (!s || !fiche) return null;
    if (fiche.equipement === 'haltere') {
      if (!s.halteres) return null;
      // 123 — toutes tranches confondues (11 kg n'existe pas chez Aurélien : 10 ou 12), en PAIRE (§10.1).
      var charges = chargesDesTranches(tranchesDe(s.halteres)).map(function (v) { return Math.round(2 * v * 100) / 100; });
      return avecIsolation({ materiel: 'halteres', charges: charges }, fiche);
    }
    if (fiche.equipement !== 'barre') return null;
    var G = racine.THGenerateur;
    if (G && G.estBarreLourde(slug, index)) return null;
    var ez = estBarreEZ(Object.assign({ slug: slug }, fiche));
    var liste = ez ? s.barres_ez : s.barres_droites;
    return liste.length ? avecIsolation({ materiel: ez ? 'barre_ez' : 'barre_droite', charges: liste.slice() }, fiche) : null;
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

  // ── 60-3b — LE PSEUDO TRAVERSE LA CONFIRMATION D'E-MAIL (ECRAN-PROFIL §3.1) ──────────────────
  //
  // La confirmation d'e-mail est activée sur le projet : le lien s'ouvre souvent dans une AUTRE
  // page, où la mémoire de l'inscription (`pseudoAInscrire`, `app.js`) n'existe plus. Le pseudo
  // voyage donc avec le compte : l'inscription le dépose dans `user_metadata.pseudo`, et la
  // création de la ligne de profil le reprend de là.
  //
  // ⚠️ UN SEUL ENDROIT CHOISIT, et c'est ici. Le pseudo de la page d'abord ; sinon celui des
  // données du compte. Les deux sont NORMALISÉS (par la même fonction) et doivent valoir un pseudo
  // (3 caractères au moins, une lettre en tête, les bornes de l'inscription) : les données d'un
  // compte sont modifiables par son propriétaire, ce ne sont pas une valeur de confiance — un
  // pseudo qui n'en est pas un est ignoré, la ligne naît sans lui, comme avant. `null` : aucun.
  function pseudoPosable(p) { return p.length >= PSEUDO_MIN && /^[a-z]/.test(p); }

  function pseudoDeLInscription(enMemoire, metadonnees) {
    var meta = metadonnees && typeof metadonnees === 'object' ? metadonnees.pseudo : null;
    var candidats = [enMemoire, meta];
    for (var i = 0; i < candidats.length; i++) {
      if (typeof candidats[i] !== 'string') continue;
      var p = normaliserPseudo(candidats[i]);
      if (pseudoPosable(p)) return p;
    }
    return null;
  }

  // La ligne « Pseudo » du Profil. « Pris entre-temps » : un pseudo a été refusé par la base (celui de l'inscription,
  // le 23505 de `chargerProfil` ; ou un pseudo choisi depuis le Profil, 60-5) ; la ligne le dit tant que `pseudoPris`
  // se tient. `pseudoPris` est un ÉTAT DE L'ÉCRAN, retenu en local par compte (`app.js`), pas une colonne — et c'est
  // `app.js` qui sait s'il parle encore de CETTE ligne (le pseudo que la ligne portait au refus : aucun, ou l'ancien,
  // qui est alors revenu sans un mot — ECRAN-PROFIL §3.1) ; ici on ne fait que le dire.
  var PHRASE_PSEUDO_PRIS = 'Ce pseudo vient d’être pris : choisis-en un autre.';

  function lignePseudo(profil, pseudoPris, surChoix) {
    var p = profil || {};
    return { libelle: 'Pseudo', valeur: p.username || null,
             sous: pseudoPris ? PHRASE_PSEUDO_PRIS : null, surChoix: surChoix };
  }

  // ── 60-5 — UN PSEUDO REFUSÉ NE BLOQUE JAMAIS LE RESTE DU PROFIL (ECRAN-PROFIL §3.1) ─────────────
  //
  // Le profil n'a pas de file : une ligne entière part en un `upsert`, et un envoi refusé reste en attente
  // (`profilAEnvoyer`) pour repartir à l'identique. Un pseudo refusé par l'unicité (`23505`) ne changera pas
  // au rejeu : il bloquerait, avec lui, TOUTES les colonnes — les réponses du questionnaire comprises.
  //
  // `estRefusDePseudo` : l'erreur est-elle le refus d'unicité du pseudo, sur une ligne qui en portait un ?
  // Une contrainte NOMMÉE qui n'est pas celle du pseudo (une clé primaire) n'en est pas un : elle reste une
  // erreur ordinaire, et l'envoi repartira comme avant. Sans nom (une erreur réduite), le code seul décide —
  // c'est la lecture de `chargerProfil` depuis 60-2c. `sansPseudo` : la même ligne, sans la colonne.
  function estRefusDePseudo(erreur, champs) {
    if (!erreur || String(erreur.code || '') !== '23505') return false;
    if (!champs || typeof champs.username !== 'string' || !champs.username) return false;
    var nom = /constraint "([^"]+)"/.exec(String(erreur.message || '') + ' ' + String(erreur.details || ''));
    return !nom || /username/i.test(nom[1]);
  }

  function sansPseudo(champs) {
    var sortie = {};
    Object.keys(champs || {}).forEach(function (c) { if (c !== 'username') sortie[c] = champs[c]; });
    return sortie;
  }

  var api = {
    estRefusDePseudo: estRefusDePseudo, sansPseudo: sansPseudo,
    MATERIELS: MATERIELS, ANCIENNETES: ANCIENNETES,
    SEXES: SEXES, INTENTIONS: INTENTIONS,
    sectionIntention: sectionIntention,
    RYTHMES: RYTHMES, RYTHME_DEFAUT: RYTHME_DEFAUT,
    rythmeDe: rythmeDe, phraseRythme: phraseRythme, sectionRythme: sectionRythme,
    PHASES: PHASES, RAPPEL_PHASE_JOURS: RAPPEL_PHASE_JOURS,
    rappelDePhase: rappelDePhase, phraseRappelDePhase: phraseRappelDePhase, PHASE_DEFAUT: PHASE_DEFAUT, PHASES_EN_BASE: PHASES_EN_BASE, LIBELLE_PHASE_VIDE: LIBELLE_PHASE_VIDE,
    DUREES_DE_MOINS: DUREES_DE_MOINS, pucesDeMoins: pucesDeMoins, phaseDe: phaseDe, phaseAuJour: phaseAuJour, estDebutant: estDebutant, phaseGelee: phaseGelee, sectionPhase: sectionPhase,
    objectifDe: objectifDe, objectifGele: objectifGele,
    prioritesDe: prioritesDe, prioritesGelees: prioritesGelees,
    DUREES: DUREES, SEANCES_MIN: SEANCES_MIN, SEANCES_MAX: SEANCES_MAX,
    TAILLE_MIN: TAILLE_MIN, TAILLE_MAX: TAILLE_MAX,
    comptePrive: comptePrive,
    BILANS_ANNONCES_MAX: BILANS_ANNONCES_MAX, bilansAnnonces: bilansAnnonces, ajouterBilansAnnonces: ajouterBilansAnnonces,
    PSEUDO_MIN: PSEUDO_MIN, PSEUDO_MAX: PSEUDO_MAX, MDP_MIN: MDP_MIN,
    CHAMPS_ECRITS: CHAMPS_ECRITS, A_RENSEIGNER: A_RENSEIGNER,
    EQUIPEMENTS: EQUIPEMENTS, LIBELLES_EQUIPEMENT: LIBELLES_EQUIPEMENT, libelleEquipement: libelleEquipement,
    equipementsDe: equipementsDe, estHorsMateriel: estHorsMateriel,
    rangerParMateriel: rangerParMateriel,
    libelleDe: libelleDe,
    initiale: initiale,
    age: age,
    sousTitre: sousTitre,
    statsDe: statsDe,
    libelleAnciennete: libelleAnciennete,
    manquants: manquants,
    OBJECTIFS: OBJECTIFS, TEMPS_REPONSES: TEMPS_REPONSES, HISTORIQUES: HISTORIQUES, PROGRAMMES: PROGRAMMES,
    ZONES_A_MENAGER: ZONES_A_MENAGER, zonesAMenagerValides: zonesAMenagerValides, basculerZone: basculerZone,
    ECARTES_MAX: ECARTES_MAX, ecartesValides: ecartesValides, ecartesDe: ecartesDe, ecartesALaFin: ecartesALaFin,
    DOSSIER_PROGRAMME_MAX: DOSSIER_PROGRAMME_MAX, dossierDuProgrammeValide: dossierDuProgrammeValide,
    PHRASE_PSEUDO_PRIS: PHRASE_PSEUDO_PRIS, pseudoDeLInscription: pseudoDeLInscription, lignePseudo: lignePseudo,
    get EXERCICES_PRIORITAIRES() { return exercicesPrioritaires(); }, PRIORITES_MAX: PRIORITES_MAX,
    musclesPrioritaires: musclesPrioritaires, prioritesValides: prioritesValides,
    DUREE_MIN: DUREE_MIN, DUREE_MAX: DUREE_MAX,
    preparerChamps: preparerChamps,
    basculerPriorite: basculerPriorite, libelleDePriorite: libelleDePriorite, resumeDesPriorites: resumeDesPriorites,
    AIDE_OBJECTIF: AIDE_OBJECTIF, AIDE_PRIORITES: AIDE_PRIORITES, optionsTemps: optionsTemps,
    sectionBut: sectionBut, ligneTemps: ligneTemps, ligneQuestionnaire: ligneQuestionnaire,
    lignesProgramme: lignesProgramme, libelleDesZones: libelleDesZones, joursDepuis: joursDepuis,
    PHRASE_ZONES: PHRASE_ZONES, PHRASE_ECARTES: PHRASE_ECARTES, PHRASE_REFAIRE: PHRASE_REFAIRE,
    doitOuvrirQuestionnaire: doitOuvrirQuestionnaire,
    questionnaireAFaire: questionnaireAFaire,
    champsEcrits: champsEcrits,
    // 116 — ce qui attend d'être envoyé : les colonnes des gestes, fusionnées (audit du 16/10/2026).
    fusionnerEnAttente: fusionnerEnAttente, champsEnAttente: champsEnAttente, retirerEnvoyes: retirerEnvoyes,
    lireEnAttente: lireEnAttente,
    estRefusDefinitif: estRefusDefinitif, phraseRefusProfil: phraseRefusProfil,
    jeuActif: jeuActif,
    tailleValide: tailleValide,
    naissanceValide: naissanceValide,
    normaliserPseudo: normaliserPseudo,
    alternatives: alternatives,
    verdictPseudo: verdictPseudo,
    mdpValide: mdpValide,
    inscriptionPrete: inscriptionPrete,
    // 108 — ma salle (MOTEUR §10 bis).
    SALLE_BARRES_PROPOSEES: SALLE_BARRES_PROPOSEES, SALLE_PAS_PROPOSES: SALLE_PAS_PROPOSES,
    SALLE_BARRE_MIN: SALLE_BARRE_MIN, SALLE_BARRE_MAX: SALLE_BARRE_MAX, SALLE_BARRES_MAX: SALLE_BARRES_MAX,
    SALLE_HALTERES_MIN: SALLE_HALTERES_MIN, SALLE_HALTERES_MAX: SALLE_HALTERES_MAX,
    SALLE_PAS_MIN: SALLE_PAS_MIN, SALLE_PAS_MAX: SALLE_PAS_MAX,
    PHRASE_SALLE: PHRASE_SALLE, PHRASE_BARRES_FIXES: PHRASE_BARRES_FIXES,
    salleValide: salleValide, salleDe: salleDe, brouillonSalle: brouillonSalle, basculerBarre: basculerBarre,
    pucesDeBarres: pucesDeBarres, champsSalle: champsSalle, poserMaxHalteres: poserMaxHalteres,
    poserPasHalteres: poserPasHalteres, halteresGardees: halteresGardees,
    // 123 — les haltères par tranches.
    SALLE_TRANCHES_MAX: SALLE_TRANCHES_MAX, tranchesDe: tranchesDe, chargesDesTranches: chargesDesTranches,
    ajouterTrancheHalteres: ajouterTrancheHalteres, retirerTrancheHalteres: retirerTrancheHalteres, sansHalteres: sansHalteres,
    peutAjouterTranche: peutAjouterTranche, phraseHalteresHorsBornes: phraseHalteresHorsBornes, SALLE_PAS_DEFAUT: SALLE_PAS_DEFAUT, resumeSalle: resumeSalle, ligneSalle: ligneSalle,
    estBarreEZ: estBarreEZ, salleDeLExercice: salleDeLExercice
  };

  racine.THProfil = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
