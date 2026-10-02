// v2/js/modele.js — transformation des lignes brutes en structure d'affichage.
//
// Module PUR : aucune dépendance au DOM, au réseau, à Supabase. C'est la seule
// partie du socle testable sans navigateur, et donc la seule qui porte des tests.
//
// Vocabulaire (ECRAN-SAISIE-V1 §2.1) :
//   bloc     = l'unité de l'écran. Un exercice normal est un bloc d'un seul,
//              un superset un bloc de 2 à 6. Même objet, même carte, même code.
//   exercice = une ligne de la légende du bloc, repérée par une lettre A, B, C…
//   série    = une ligne de la grille.
//
// Étiquetage (§2.3, §2.4) : la LETTRE identifie l'exercice dans le bloc, le
// CHIFFRE identifie le TOUR. Rien n'est stocké : tout se recalcule à l'affichage
// à partir de « cette série appartient à cet exercice, qui appartient à ce bloc,
// à cette position ».

(function (racine) {
  'use strict';

  var LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Les quatre valeurs réellement présentes en base (28 103 lignes) :
  // travail 26 132 · echauffement 1 458 · degressive 387 · echec 126.
  var TYPES_CONNUS = ['travail', 'echauffement', 'degressive', 'echec'];

  // ⚠️ LA SÉRIE DE TRAVAIL : UNE DÉFINITION, ICI (PR 6 de la consolidation,
  // 02/10/2026). Le type d'une série, et `travail` quand il manque : c'est le
  // défaut de la base (`sets.type_serie` NOT NULL, défaut `travail`). Il y en
  // avait cinq — `estTravail` disait « non » à une série sans type, `typeDe`
  // (`seance.js`, `rejeu.js`) disait « oui ». Partout ailleurs, on appelle ;
  // la garde d'architecture refuse un `type_serie === 'travail'` écrit en dur.
  function typeDe(serie) { return (serie && serie.type_serie) || 'travail'; }
  function estTravail(serie) {
    return !!serie && typeDe(serie) === 'travail';
  }

  // UN EXERCICE « FAIT » (PR 6, décision du 02/10/2026) : au moins une série
  // de travail, cardio compris — le tapis est un exercice fait. Un exercice où
  // l'on n'a fait que des chauffes ne l'est pas. Une seule fonction pour
  // Progression (« N exercices »), le profil (« déjà faits »), Mes exercices
  // et la carte de séance. Rend `{ slug: date }` : la date la plus récente de
  // ses séances quand `debutDe` (`{ session_id: debut }`) est donné, sinon
  // `true`.
  function exercicesFaits(series, debutDe) {
    var faits = {};
    (series || []).forEach(function (s) {
      if (!estTravail(s) || !s.exercise_slug) return;
      var d = debutDe ? debutDe[s.session_id] : true;
      if (!d) return;
      if (faits[s.exercise_slug] === undefined || (debutDe && d > faits[s.exercise_slug])) faits[s.exercise_slug] = d;
    });
    return faits;
  }

  // ── Formatage des unités ────────────────────────────────────────────────
  // Le séparateur décimal est la virgule. Jamais d'unité brute à l'écran.

  // ⚠️ LE FORMATEUR UNIQUE (consolidation, PR 7). Tout chiffre, toute date
  // affichée par l'app s'écrit ICI : `rendu.js` (`nombreFr`, `MOIS`, `mmss`,
  // `dateCourte`, `dateLongue`), `app.js` (`nombreGroupe`), `poids.js`
  // (`arrondi`), `calendrier.js` (les mois), `rejeu.js` (l'horodatage) en
  // avaient chacun une copie. La garde d'architecture refuse une virgule
  // décimale, une date `toLocale…` ou une liste de mois écrite ailleurs.

  // Arrondi SYMÉTRIQUE. `Math.round` arrondit −11,5 vers −11 et +11,5 vers
  // +12 : une prise de 1,15 kg s'afficherait « +1,2 » et une perte de 1,15 kg
  // « −1,1 ». On arrondit la valeur absolue et on repose le signe. Le résidu
  // du flottant (97,4 − 98,55 = −1,1499999999999915) est effacé AVANT.
  function arrondi(v, decimales) {
    var f = Math.pow(10, decimales === undefined ? 1 : decimales);
    var x = Math.round(v * f * 1e6) / 1e6;
    return (x < 0 ? -Math.round(-x) : Math.round(x)) / f;
  }

  function nombreTexte(v, decimales) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    if (!isFinite(n)) return '';
    return String(arrondi(n, decimales === undefined ? 2 : decimales)).replace('.', ',');
  }

  // Un nombre TEL QUEL (sans arrondi) : séparateur décimal français, et le
  // vrai signe moins (U+2212), jamais le trait d'union du clavier — une
  // assistance se note « −50 kg ».
  function nombreSigne(n) {
    return String(n).replace('.', ',').replace(/^-/, '\u2212');
  }

  // « 28 404 » : l'espace FINE insécable sépare les milliers (typographie
  // française ; un espace ordinaire casserait le nombre en bout de ligne).
  function nombreGroupe(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  }

  // « 1:30 » : un chronomètre.
  function mmss(secondes) {
    var s = Math.max(0, Math.round(secondes || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  // « 02 oct. 2026 ».
  function dateCourte(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // « Jeudi 11 septembre » ; l'année seulement si ce n'est pas l'année courante.
  function dateLongue(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var opts = { weekday: 'long', day: 'numeric', month: 'long' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    var t = d.toLocaleDateString('fr-FR', opts);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // L'horodatage du rejeu (outil de développement) : à Paris, à la seconde.
  function heureParis(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return String(iso || '–');
    try {
      return d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return d.toISOString().slice(11, 19) + ' UTC'; }
  }
  function dateHeureParis(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return String(iso || '–');
    try {
      return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + heureParis(iso);
    } catch (e) { return d.toISOString(); }
  }

  // ══ MOTEUR §20 bis (49-U19) — CE QUE LE FORMATEUR DÉCLARE ══════════════
  //
  // « Chaque chiffre cité porte sa nature, déclarée par le formateur unique
  // qui l'écrit. » Une phrase du coach se rédige SOUS CAPTURE
  // (`capturer(fn)`) : chaque chiffre que le formateur écrit pendant ce temps
  // s'inscrit au registre, avec sa nature et son objet (`cite`, le dernier
  // argument de chaque fonction) — `cible_du_jour`, `fait_passe`,
  // `cible_suivante`, `regle`. La garde de cohérence (`THPlan.verifierPhrases`)
  // LIT CES DÉCLARATIONS : elle n'analyse pas le texte après coup.
  //
  // Hors capture, rien ne s'inscrit et le texte est exactement le même : la
  // capture est une observation du formateur, pas une autre façon d'écrire.
  // Synchrone, rendue dans `finally` : aucune autre phrase ne s'y glisse.
  var NATURES = { CIBLE: 'cible_du_jour', FAIT: 'fait_passe', SUIVANTE: 'cible_suivante', REGLE: 'regle' };
  var registres = [];

  function capturer(fn) {
    var r = [];
    registres.push(r);
    var texte;
    try { texte = fn(); } finally { registres.pop(); }
    return { texte: texte, citations: r };
  }

  // Les citations d'une capture intérieure, REPORTÉES dans la capture en
  // cours : une phrase rédigée à part (pour décider de la garder), puis gardée.
  function reporter(citations) {
    if (!registres.length || !citations) return;
    var r = registres[registres.length - 1];
    citations.forEach(function (q) { r.push(q); });
  }

  function declarer(cite, valeurs, texte) {
    if (!registres.length) return;
    var c = cite || null;
    registres[registres.length - 1].push({
      nature: c && c.nature ? c.nature : null,
      objet: c && c.objet !== undefined ? c.objet : null,
      charge: valeurs.charge === undefined ? undefined : valeurs.charge,
      reps: valeurs.reps === undefined ? undefined : valeurs.reps,
      date: valeurs.date === undefined ? undefined : valeurs.date,
      valeur: valeurs.valeur === undefined ? undefined : valeurs.valeur,
      texte: texte
    });
  }

  function nombre(v, decimales, cite) {
    var t = nombreTexte(v, decimales);
    declarer(cite, { valeur: v === undefined ? null : v }, t);
    return t;
  }

  // ── LA VOIX DU COACH : LE SEUL FORMATEUR (MOTEUR §20.2, 49-U9) ──────────
  //
  // Toutes les phrases du coach — moteur ET plan — passent par ici pour les
  // charges, les reps et les dates : un seul format, charge d'abord, avec
  // « kg » (`125 kg × 5`). Aucune phrase ne formate un nombre elle-même :
  // trois graphies ont coexisté (`croix`, `kgFois`, celle de « ton test
  // arrive »), et c'est ce qui les avait fait diverger.
  //
  // ⚠️ L'ESPACE INSÉCABLE, ÉCRITE EN ÉCHAPPEMENT : entre le nombre et « kg »,
  // autour du « × » et dans la date. Sans elle, « 127,5 » et « kg » se
  // séparent en bout de ligne à 360 px.
  var INSECABLE = '\u00a0';
  var CRAN_INCONNU = 'le cran au-dessus';

  // « 125 kg ». Une charge inconnue se dit, elle ne se tait pas : « le cran
  // au-dessus » (§10.2, rang 4) — ou le repli que l'appelant donne.
  function chargeTexte(kg, repli) {
    if (kg === null || kg === undefined || kg === '' || !isFinite(Number(kg))) {
      return repli === undefined ? CRAN_INCONNU : repli;
    }
    return nombreTexte(kg) + INSECABLE + 'kg';
  }
  function chargeOuNul(kg) {
    return kg === null || kg === undefined || kg === '' || !isFinite(Number(kg)) ? null : Number(kg);
  }

  function charge(kg, repli, cite) {
    var t = chargeTexte(kg, repli);
    declarer(cite, { charge: chargeOuNul(kg) }, t);
    return t;
  }

  // « 125 kg × 5 » — la charge d'abord, puis les reps.
  function chargeFois(kg, reps, repli, cite) {
    var t = chargeTexte(kg, repli) + INSECABLE + '\u00d7' + INSECABLE + nombreTexte(reps);
    declarer(cite, { charge: chargeOuNul(kg), reps: [reps === undefined ? null : reps] }, t);
    return t;
  }

  // « 125 kg × 4, 4, 4 » — une série de reps à une même charge.
  function serie(kg, reps, repli, cite) {
    var l = (reps || []).map(function (r) { return nombreTexte(r); }).join(', ');
    var t = chargeTexte(kg, repli) + INSECABLE + '\u00d7' + INSECABLE + l;
    declarer(cite, { charge: chargeOuNul(kg), reps: (reps || []).slice() }, t);
    return t;
  }

  // Les mois : en entier (le calendrier, « septembre 2026 ») et abrégés. La
  // seconde liste est assumée : l'abréviation ne se dérive pas du nom entier
  // (« févr. », « mars » sans point, « juil. »). Un test vérifie que les deux
  // tables ont douze entrées dans le même ordre.
  var MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  // « 11 sept. », et « 11 sept. 2024 » hors de l'année de référence.
  function jourMois(d, anneeRef) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    var txt = d.getDate() + ' ' + MOIS_COURTS[d.getMonth()];
    var ref = typeof anneeRef === 'number' ? anneeRef : null;
    return ref === null || d.getFullYear() === ref ? txt : txt + ' ' + d.getFullYear();
  }
  // « 7 oct. » : le jour civil « AAAA-MM-JJ » (lu tel quel, sans fuseau),
  // DÉCLARÉ comme une date — le bandeau de la semaine allégée.
  function jourCourt(jour, cite) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour || ''));
    if (!m) return '';
    var t = Number(m[3]) + ' ' + MOIS_COURTS[Number(m[2]) - 1];
    declarer(cite, { date: jour }, t);
    return t;
  }
  // « septembre 2026 ».
  function moisAnnee(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return MOIS_LONGS[d.getMonth()] + ' ' + d.getFullYear();
  }
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var JOURS_NOMMES = 6;

  function jourLocal(iso) {
    if (iso === null || iso === undefined || iso === '') return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // « aujourd'hui » (même jour local), le NOM DU JOUR de 1 à 6 jours avant
  // (« mardi »), sinon « le 13 sept. ». `tete` : la majuscule, en tête de
  // phrase (« Mardi : … »).
  //
  // ⚠️ LA RÉFÉRENCE EST UNE ENTRÉE, JAMAIS L'HORLOGE : la date de la séance pour
  // laquelle la phrase est écrite. Le moteur et le plan restent purs — la même
  // consigne se relit à l'identique. Sans référence, la date absolue.
  //
  // L'écart se compte en JOURS DU CALENDRIER LOCAL, pas en heures : une séance
  // de 23 h la veille est « hier » même 1 h plus tard, et un changement
  // d'heure (23 h ou 25 h dans la journée) ne décale rien.
  function quand(iso, reference, tete, cite) {
    var t = quandTexte(iso, reference, tete);
    if (t) declarer(cite, { date: iso }, t);
    return t;
  }
  function quandTexte(iso, reference, tete) {
    var d = jourLocal(iso);
    if (d === null) return '';
    var dit = 'le ' + d.getDate() + INSECABLE + MOIS_COURTS[d.getMonth()];
    var r = jourLocal(reference);
    if (r !== null) {
      var ecart = Math.round((Date.UTC(r.getFullYear(), r.getMonth(), r.getDate()) -
                              Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
      if (ecart === 0) dit = 'aujourd\'hui';
      else if (ecart >= 1 && ecart <= JOURS_NOMMES) dit = JOURS[d.getDay()];
    }
    return tete ? dit.charAt(0).toUpperCase() + dit.slice(1) : dit;
  }

  // 23715 -> « 6 h 35 » · 750 -> « 12 min 30 » · 60 -> « 1 min »
  function formatDuree(secondes) {
    if (secondes === null || secondes === undefined || secondes === '') return '';
    var s = Math.round(Number(secondes));
    if (!isFinite(s) || s < 0) return '';
    if (s < 60) return s + ' s';
    var minutes = Math.floor(s / 60);
    if (minutes < 60) {
      var reste = s % 60;
      return reste ? minutes + ' min ' + reste : minutes + ' min';
    }
    var heures = Math.floor(minutes / 60);
    var min = minutes % 60;
    return min ? heures + ' h ' + (min < 10 ? '0' + min : min) : heures + ' h';
  }

  // 22660 -> « 22,7 km » · 850 -> « 850 m » · 1000 -> « 1 km »
  function formatDistance(metres) {
    if (metres === null || metres === undefined || metres === '') return '';
    var m = Number(metres);
    if (!isFinite(m) || m < 0) return '';
    if (m < 1000) return nombreTexte(m, 0) + ' m';
    return nombreTexte(m / 1000, 1) + ' km';
  }

  // « 52 kg × 12 » · « 6 h 35 · 22,7 km » · « 12 reps »
  function formatMesure(serie) {
    if (!serie) return '';
    var bouts = [];
    var aCharge = serie.charge_kg !== null && serie.charge_kg !== undefined;
    var aReps = serie.reps !== null && serie.reps !== undefined;
    if (aCharge) bouts.push(nombreTexte(serie.charge_kg) + ' kg');
    if (aReps) bouts.push(aCharge ? '× ' + serie.reps : serie.reps + ' reps');
    if (serie.duree_s) bouts.push(formatDuree(serie.duree_s));
    if (serie.distance_m) bouts.push(formatDistance(serie.distance_m));
    return bouts.length ? bouts.join(bouts.length > 1 && !aCharge ? ' · ' : ' ') : '—';
  }

  // ══ LES QUATRE MESURES ═══════════════════════════════════════════════════
  //
  // `exercises.mesure` définit QUATRE façons d'enregistrer une série, et toute
  // la grille de saisie avait été dessinée pour la première. Mesuré en base :
  //
  //   charge_reps     173 exos   22 056 séries de travail
  //   reps             45 exos    2 300   — pompes, tractions, dips
  //   temps            12 exos    1 275   — planche, gainage
  //   distance_temps    7 exos      501   — rando, course, natation, tapis
  //
  // 4 076 séries — 15 % de l'historique — ne s'enregistrent pas en charge ×
  // reps. Une planche à « 0 kg × 45 » est absurde, et c'est ce que la grille
  // unique produisait.
  //
  // Les données sont propres : chaque mesure ne remplit que ses colonnes, sans
  // une exception sur 28 103 séries. Rien à nettoyer, seulement à afficher.

  // ══ LA DURÉE SE SAISIT PAR DÉCALAGE, COMME UN PAVÉ DE CHRONOMÉTRAGE ══════
  //
  // Le chantier 24 avait tranché « l'unité suit la mesure » : secondes pour un
  // gainage, minutes pour une sortie. Vérifié sur device, c'était encore une
  // règle à apprendre, et elle ne couvrait pas l'écart réel entre exercices —
  // mesuré sur les séries : L-Sit 5 à 10 s, planche 10 s à 2 min, escaliers
  // 30 s à 8 min, pilates 15 min à 1 h, escalade 1 h 30 à 2 h, randonnée
  // jusqu'à 6 h 35. Un facteur MILLE entre les deux bouts.
  //
  // Les chiffres entrent PAR LA DROITE et poussent les autres vers la gauche :
  //
  //   `5` `0`           -> 00:50
  //   `1` `3` `0` `0`   -> 13:00
  //   `2` `0` `0` `0` `0` -> 02:00:00
  //
  // Aucune règle à deviner, aucune conversion, aucun choix d'unité : le même
  // geste vaut pour dix secondes et pour six heures. Et il n'y a plus deux
  // unités pour une seule colonne — `duree_min` a disparu avec son facteur 60.
  //
  // `saisie` dit au rendu quel champ construire ; `facteur` ne sépare plus que
  // les kilomètres des mètres.
  var CHAMPS_MESURE = {
    charge_kg:   { cle: 'charge_kg',  entete: 'KG',       unite: 'kg',  facteur: 1,    saisie: 'nombre' },
    reps:        { cle: 'reps',       entete: 'REPS',     unite: null,  facteur: 1,    saisie: 'nombre' },
    duree:       { cle: 'duree_s',    entete: 'DURÉE',    unite: null,  facteur: 1,    saisie: 'chrono' },
    // La DISTANCE ne change pas : une seule base de dix, une seule unité utile.
    // Taper `8,76` en kilomètres est aussi rapide que `8760` en mètres et plus
    // lisible. Le décalage n'apporte rien là où il n'y a ni trois groupes ni
    // base de soixante.
    distance_km: { cle: 'distance_m', entete: 'DISTANCE', unite: 'km',  facteur: 1000, saisie: 'nombre' }
  };

  // ── Le pavé de chronométrage, en fonctions pures ────────────────────────
  //
  // ⚠️ LE TAMPON DE CHIFFRES EST UN ÉTAT, et il ne peut pas se déduire de la
  // valeur. `6·3·5·0·0` passe par « 6350 » (63 min 50 s = 3 830 s) ; la forme
  // canonique de 3 830 s est « 10350 » (1 h 03 min 50), et repartir de celle-là
  // au chiffre suivant donnerait 1:03:50 au lieu de 6:35:00. Le tampon vit donc
  // dans le champ tant qu'on tape, et se recompose depuis la valeur au rendu
  // suivant — sans perte, puisque la valeur, elle, est exacte à la seconde.
  var MAX_DUREE_S = 9 * 3600 + 59 * 60 + 59;   // 9:59:59 — 35 999 s, LA borne
  var MAX_CHIFFRES_DUREE = 5;                  // sa conséquence, pas une règle

  function deux(n) { return (n < 10 ? '0' : '') + n; }

  function sansZerosDeTete(s) { return String(s).replace(/^0+(?=\d)/, ''); }

  // Un chiffre de plus, par la droite. UNE SEULE borne, et c'est la VALEUR :
  // au-delà de **9:59:59**, le chiffre n'entre pas.
  //
  // ⚠️ Elle existe parce que le pavé ne doit JAMAIS produire une durée qu'il ne
  // sait pas reprendre. Les groupes bruts acceptent 99 minutes et 99 secondes :
  // « 99999 » vaudrait 10 h 40 min 39 s, dont la forme canonique est
  // « 104039 » — SIX chiffres. En rouvrant la série, le champ afficherait la
  // bonne heure et refuserait ensuite tout nouveau chiffre. Un pavé qui écrit
  // ce qu'il ne peut plus relire est un piège, et il ne se voit qu'à la
  // réédition, sur device, jamais en CI.
  //
  // Un compteur de chiffres serait REDONDANT, et le banc de mutation l'a
  // prouvé : au-dessus de cinq chiffres, le premier groupe vaut au moins dix
  // heures, donc la borne de valeur a déjà refusé. Le remplacer par 99 ne
  // faisait tomber aucun test — un garde-fou qu'aucune mutation ne tue est un
  // garde-fou mort (leçon de `palier.js`). `MAX_CHIFFRES_DUREE` reste comme ce
  // qu'il est vraiment : la CONSÉQUENCE de la borne, que les tests vérifient.
  //
  // Aucun groupe n'est tronqué au passage : le chiffre de trop n'entre pas,
  // rien n'est silencieusement perdu.
  //
  // ⚠️ `max` EST LA BORNE DE L'APPELANT, ET IL N'Y EN A TOUJOURS QU'UNE. Le
  // repos cible d'une routine est contraint à 1 800 s par `routine_exos_repos_borne`
  // (chantier 42) : lui laisser 9:59:59 lui ferait produire une valeur que la
  // base refuse, c'est-à-dire exactement le piège que ce commentaire décrit, un
  // cran plus loin. Absent, on retombe sur la borne du chronomètre de séance —
  // aucun appelant existant ne change de comportement.
  //
  // La borne du BAS ne se pose PAS ici, et ce n'est pas un oubli : pour écrire
  // 0:45 il faut passer par 0:04, qui est sous le minimum. Un pavé qui refuse
  // ses états de passage est un pavé où l'on ne peut rien taper. Le minimum est
  // donc affaire de `valider()`, au moment de l'enregistrement.
  function poserChiffreDuree(chiffres, chiffre, max) {
    var courant = String(chiffres === null || chiffres === undefined ? '' : chiffres);
    var c = String(chiffre).replace(/\D/g, '');
    if (c.length !== 1) return courant;
    var plafond = (max === null || max === undefined) ? MAX_DUREE_S : max;
    var suite = sansZerosDeTete(courant + c);
    return dureeDeChiffres(suite) > plafond ? courant : suite;
  }

  // Effacer retire le dernier chiffre, par la droite — geste inverse exact.
  function retirerChiffreDuree(chiffres) {
    return String(chiffres === null || chiffres === undefined ? '' : chiffres).slice(0, -1);
  }

  // Les groupes se lisent DEUX PAR DEUX depuis la droite, et aucun n'est
  // tronqué : « 6350 » vaut 63 minutes 50 secondes, ce qui est une durée, pas
  // une erreur. La valeur est donc toujours exactement ce que les chiffres
  // disent — et c'est `formatChrono` qui la rend sous forme d'horloge, où les
  // minutes et les secondes sont par construction sous 60.
  function dureeDeChiffres(chiffres) {
    var s = String(chiffres === null || chiffres === undefined ? '' : chiffres).replace(/\D/g, '');
    if (!s) return null;
    var ss = Number(s.slice(-2) || 0);
    var mm = Number(s.slice(-4, -2) || 0);
    var hh = Number(s.slice(0, -4) || 0);
    return hh * 3600 + mm * 60 + ss;
  }

  // L'inverse : la forme canonique d'une durée déjà enregistrée, pour que le
  // champ reparte de ce qu'il affiche.
  function chiffresDeDuree(secondes) {
    if (secondes === null || secondes === undefined || secondes === '') return '';
    var n = Number(secondes);
    if (!isFinite(n)) return '';
    n = Math.max(0, Math.round(n));
    var hh = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60;
    return sansZerosDeTete((hh ? String(hh) + deux(mm) : String(mm)) + deux(ss));
  }

  // « 00:50 » · « 13:00 » · « 02:00:00 ». Les heures ne s'affichent QUE si
  // elles existent : cinq caractères inutiles sur un gainage de dix secondes,
  // c'est cinq de trop.
  function formatChrono(secondes) {
    if (secondes === null || secondes === undefined || secondes === '') return '';
    var n = Number(secondes);
    if (!isFinite(n)) return '';
    n = Math.max(0, Math.round(n));
    var hh = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60;
    return (hh ? deux(hh) + ':' : '') + deux(mm) + ':' + deux(ss);
  }

  // Le libellé est rappelé sous le nom de l'exercice : sans lui, une ligne à
  // deux colonnes au milieu de lignes à trois désoriente.
  //
  // `effort` : la colonne n'existe QUE là où il y a des répétitions. Sur
  // `temps` et `distance_temps`, aucune colonne, aucune question, rien en base.
  // C'est une décision, pas un oubli — un RPE sur un gainage produisait deux
  // notations dans la même colonne, sur deux lignes voisines (`−1` sur un
  // développé, `9` sur une planche). On ne demande pas une donnée qu'on ne
  // sait pas formuler correctement.
  var GABARITS = {
    charge_reps:    { mesure: 'charge_reps',    champs: ['charge_kg', 'reps'],
                      effort: true,  libelle: 'CHARGE × REPS' },
    reps:           { mesure: 'reps',           champs: ['reps'],
                      effort: true,  libelle: 'REPS SEULES' },
    temps:          { mesure: 'temps',          champs: ['duree'],
                      effort: false, libelle: 'DURÉE' },
    distance_temps: { mesure: 'distance_temps', champs: ['duree', 'distance_km'],
                      effort: false, libelle: 'DISTANCE ET DURÉE' }
  };

  var MESURES = Object.keys(GABARITS);

  // Une mesure inconnue — catalogue pas encore synchronisé, exercice ajouté
  // côté serveur — ne doit ni planter ni rendre une grille vide. On retombe sur
  // `charge_reps`, de loin la plus courante, et on TAIT le libellé : affirmer
  // « CHARGE × REPS » sur un exercice qu'on ne connaît pas serait mentir avec
  // aplomb. `inconnue` le dit à la vue.
  function gabaritDe(exo) {
    var m = exo && exo.mesure;
    var g = Object.prototype.hasOwnProperty.call(GABARITS, m) ? GABARITS[m] : null;
    if (g) return g;
    return { mesure: 'charge_reps', champs: GABARITS.charge_reps.champs,
             effort: true, libelle: null, inconnue: true };
  }

  function champDeMesure(nom) {
    return Object.prototype.hasOwnProperty.call(CHAMPS_MESURE, nom)
      ? CHAMPS_MESURE[nom] : null;
  }

  // La colonne « précédent » : 62 px. `formatMesure` y déborderait — on donne
  // la grandeur qui porte l'information, et elle seule.
  //   charge_reps → « 122,5×5 » · reps → « 12 » · temps → « 45 s »
  //   distance_temps → « 6 h 35 » (la distance ne tient pas, la durée gagne)
  function formatPrecedent(serie, mesure) {
    if (!serie) return '—';
    if (mesure === 'reps') {
      return serie.reps === null || serie.reps === undefined ? '—' : String(serie.reps);
    }
    // ⚠️ EN HORLOGE, comme le champ juste à côté. `formatDuree` dirait « 45 s »
    // à trois millimètres d'un champ qui dit « 00:45 » : deux écritures du même
    // chiffre sur la même ligne, et c'est la famille de défauts que l'audit v1
    // a cataloguée. La grille de saisie est une horloge ; le journal — cartes,
    // détail, résumés — reste en prose et garde `formatDuree`. Les deux ne se
    // rencontrent jamais.
    if (mesure === 'temps' || mesure === 'distance_temps') {
      return formatChrono(serie.duree_s) || '—';
    }
    if (serie.charge_kg === null || serie.charge_kg === undefined) return '—';
    return nombreTexte(serie.charge_kg) +
      (serie.reps === null || serie.reps === undefined ? '' : '\u00d7' + serie.reps);
  }

  // ⚠️ `Number(null)` vaut ZÉRO, et `isFinite(0)` vaut vrai.
  //
  // Sans cette garde, une série dont le champ est vide remontait « 0 » comme
  // s'il avait été mesuré — la « planche à 0 » que ce chantier supprime,
  // réintroduite par la porte de derrière. Le test l'a attrapée avant l'écran.
  function valeurNumerique(s, champ) {
    var v = s && s[champ];
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // Le maximum d'un champ sur un lot de séries, rendu en texte. `null` si
  // aucune série ne le porte — on n'affiche pas un zéro faute de mieux.
  function texteMax(series, champ, format) {
    var max = null;
    (series || []).forEach(function (s) {
      var v = valeurNumerique(s, champ);
      if (v === null) return;
      if (max === null || v > max) max = v;
    });
    return max === null ? null : format(max);
  }

  // ── Catalogue ───────────────────────────────────────────────────────────

  function indexerExercices(exercices) {
    var index = {};
    (exercices || []).forEach(function (e) {
      if (e && e.slug) index[e.slug] = e;
    });
    return index;
  }

  function nommer(index, slug) {
    var e = index && index[slug];
    return (e && e.nom) || slug || '(exercice inconnu)';
  }

  // Une « sortie » n'est pas une séance de musculation : l'exercice ne porte
  // aucune charge et se mesure en temps et/ou en distance. Établi par lecture
  // du catalogue : charge='aucune' + mesure ∈ {temps, distance_temps} couvre
  // Randonnée, Course à pieds, Cyclisme, Marche, Natation, Pilates, Escalade…
  function estExerciceSortie(exo) {
    return !!exo && exo.charge === 'aucune' &&
      (exo.mesure === 'temps' || exo.mesure === 'distance_temps');
  }

  // ── Découpage en blocs ──────────────────────────────────────────────────

  // Deux séries appartiennent au même bloc si elles se suivent par `rang` ET
  // partagent le même groupe de superset — ou, hors superset, le même exercice.
  function memeBloc(a, b) {
    if (!a || !b) return false;
    var ga = a.groupe_superset, gb = b.groupe_superset;
    if (ga !== null && ga !== undefined) return ga === gb;
    if (gb !== null && gb !== undefined) return false;
    return a.exercise_slug === b.exercise_slug;
  }

  // Tri stable par `rang` croissant. `rang` est NOT NULL en base ; une ligne
  // sans rang exploitable est renvoyée en fin de liste.
  function trierParRang(series) {
    return (series || []).slice().sort(function (x, y) {
      var rx = typeof x.rang === 'number' ? x.rang : Infinity;
      var ry = typeof y.rang === 'number' ? y.rang : Infinity;
      return rx - ry;
    });
  }

  function estChauffe(s) { return s && s.type_serie === 'echauffement'; }

  // Découpe les séries de travail d'UN exercice (ordre de rang) en paquets : un
  // paquet sort à un tour.
  //
  // Une dégressive ou un échec PROLONGE la série qui précède — on descend la
  // charge sans repos — donc ils restent dans le paquet de cette série, et l'on
  // obtient A1, A↓, B1 plutôt que A1, B1, A↓.
  //
  // ⚠️ LES CHAUFFES N'ARRIVENT PLUS JUSQU'ICI : elles sont retirées en amont et
  // forment leurs propres tours (§2.5, corrigé le 13/09). Elles ouvraient
  // autrefois le paquet suivant, ce qui les dispersait dans un superset.
  function paqueter(seriesExo) {
    var paquets = [];
    var courant = [];
    (seriesExo || []).forEach(function (s) {
      if (!estTravail(s) && paquets.length) {
        paquets[paquets.length - 1].push(s);
        return;
      }
      courant.push(s);
      if (estTravail(s)) { paquets.push(courant); courant = []; }
    });
    if (courant.length) paquets.push(courant);   // queue sans série de travail
    return paquets;
  }

  // Entrelace des tours : `parExo[e][t]` est ce que l'exercice `e` produit au
  // tour `t`, ou rien. Un exercice qui n'a pas de t-ième tour ne produit rien —
  // pas d'étiquette fantôme (§2.4). C'est la mécanique des séries inégales du
  // chantier 27, et les chauffes s'en servent à l'identique.
  //
  // ⚠️ ELLE MARQUE LA PREMIÈRE LIGNE DE CHAQUE TOUR (§7 undecies.2). C'est ici,
  // et nulle part ailleurs, qu'on sait où un tour commence : le rendu ne doit
  // pas le re-deviner en comparant des numéros — un tour de chauffe n'en a pas.
  // La toute première ligne du bloc n'est pas marquée : on ne sépare pas d'un
  // vide un tour de rien.
  function entrelacerTours(parExo, dejaEmis) {
    var out = [];
    var emis = !!dejaEmis;
    var profondeur = parExo.reduce(function (m, p) { return Math.max(m, p.length); }, 0);
    for (var t = 0; t < profondeur; t++) {
      var tour = [];
      for (var e = 0; e < parExo.length; e++) {
        if (parExo[e][t]) tour = tour.concat(parExo[e][t]);
      }
      if (!tour.length) continue;
      if (emis) tour[0] = Object.assign({}, tour[0], { debutTour: true });
      emis = true;
      out = out.concat(tour);
    }
    return out;
  }

  /**
   * construireBlocs(series, exercices) -> [bloc]
   *
   * bloc = {
   *   superset: bool,                     // vrai seulement à partir de 2 exercices
   *   exercices: [{ slug, nom, lettre, series, nbTravail }],
   *   series: [série],                    // dans l'ordre d'AFFICHAGE
   *   nbTravail: int, nbTours: int, chronologie: bool, resume: string
   * }
   * série = { …ligne brute, estTravail, tour, etiquette }
   */
  // ⚠️ « FAITE » N'EST PAS « `validee_a` » (chantier 35, D3).
  //
  // Les 28 103 séries importées ont `validee_a` à NULL — la contrainte
  // `sets_validee_si_saisie` ne l'exige que pour `source = 'app'`. Une séance
  // d'il y a trois semaines s'affichait donc entièrement vierge : aucune case
  // cochée, rien de vert, comme si elle n'avait jamais eu lieu. Le NULL ne dit
  // pas « pas faite », il dit « on ne sait pas QUAND ».
  //
  // ⚠️ ET ON NE RÉPARE PAS ÇA EN ÉCRIVANT `validee_a` : ce champ est aussi ce
  // qui décide `bloc.chronologie` ci-dessous, et une chronologie inventée
  // ENTRELACERAIT les séances importées — Hevy a aplati leurs tours (1 031
  // blocs groupés contre 53 entrelacés), et les entrelacer inventerait un ordre
  // que personne n'a fait. `faite` est donc une vérité D'AFFICHAGE : elle ne
  // s'écrit nulle part, et `chronologie` continue de lire `validee_a` seul.
  //
  // ⚠️ MIROIR DE `THSeance.partEnBase` — la même question, posée de l'autre
  // côté : « cette série existe-t-elle ? » et « a-t-elle été faite ? » ont la
  // même réponse. Recopiée plutôt qu'appelée parce que `modele.js` se charge
  // AVANT `seance.js` et que deux suites de tests chargent l'un sans l'autre.
  // `tests/unit/v2-gestes-corriges.test.js` prouve qu’elles ne divergent pas.
  function faiteEnBase(serie) {
    if (!serie) return false;
    if (serie.validee_a) return true;
    return !!serie.source && serie.source !== 'app';
  }

  function construireBlocs(series, exercices, options) {
    var o = options || {};
    var index = indexerExercices(exercices);
    var blocs = [];
    var courant = null;
    var precedente = null;

    // 1. Découpage en blocs et en exercices, dans l'ordre de rang.
    trierParRang(series).forEach(function (brute) {
      if (!courant || !memeBloc(precedente, brute)) {
        courant = { superset: false, groupe: null, exercices: [], series: [], nbTravail: 0,
                    nbTours: 0, chronologie: false, resume: '' };
        courant.groupe = brute.groupe_superset === undefined ? null : brute.groupe_superset;
        blocs.push(courant);
      }
      var slug = brute.exercise_slug;
      var exo = null;
      for (var i = 0; i < courant.exercices.length; i++) {
        if (courant.exercices[i].slug === slug) { exo = courant.exercices[i]; break; }
      }
      if (!exo) {
        exo = { slug: slug, nom: nommer(index, slug), lettre: '', series: [], nbTravail: 0 };
        courant.exercices.push(exo);
      }
      exo.series.push(brute);
      precedente = brute;
    });

    // 2. Étiquetage et ordre d'affichage, bloc par bloc.
    blocs.forEach(function (bloc) {
      // §2.1 et §5.9 : un bloc d'un seul exercice n'est pas un superset — même
      // si `groupe_superset` est renseigné (anomalie des 13 blocs importés).
      bloc.superset = bloc.exercices.length > 1;

      bloc.exercices.forEach(function (exo, i) {
        exo.lettre = bloc.superset ? (LETTRES[i] || '?') : '';
        var tour = 0;
        exo.series = exo.series.map(function (brute) {
          var travail = estTravail(brute);
          if (travail) tour++;
          return Object.assign({}, brute, {
            estTravail: travail,
            // Ce que l'écran doit montrer comme fait — coché, vert, compté.
            faite: faiteEnBase(brute),
            // Le tour d'une série de travail est son rang parmi les séries de
            // travail de SON exercice. Une série non-travail n'a pas de tour.
            tour: travail ? tour : null,
            // §2.3 : lettre = exercice, chiffre = tour. Bloc simple → pas de
            // lettre. §2.5 : l'échauffement porte la lettre seule, jamais un
            // libellé — la distinction se fait par le style.
            etiquette: travail ? exo.lettre + tour : exo.lettre
          });
        });
        exo.nbTravail = tour;
        bloc.nbTravail += tour;
        if (tour > bloc.nbTours) bloc.nbTours = tour;
      });

      // §7.1/§7.3 : `validee_a` est NULL sur les 28 103 séries importées. Une
      // série importée n'a pas de tours — elle s'affiche dans l'ordre de `rang`
      // (Hevy a aplati les tours : mesuré, 1 031 blocs groupés par exercice
      // contre 53 entrelacés). Dès qu'une chronologie existe, les tours sont
      // réels et l'affichage s'entrelace (§2.3).
      bloc.chronologie = bloc.exercices.some(function (e) {
        return e.series.some(function (s) { return !!s.validee_a; });
      });

      // ⚠️ `entrelacer` FORCE l'entrelacement, et c'est l'écran de SAISIE qui
      // le demande (chantier 27). La garde `chronologie` ci-dessus existe pour
      // le CORPUS IMPORTÉ : Hevy a aplati les tours, et entrelacer des séries
      // qui n'ont jamais été faites en alternance inventerait un ordre. Une
      // séance EN COURS n'a pas ce problème — la routine prescrit
      // l'enchaînement, et c'est justement ce qu'il faut montrer. Les deux
      // lectures se rejoignent dès la première validation, `chronologie`
      // devenant vraie : une séance saisie dans l'app s'affiche pareil à la
      // saisie et au détail.
      if (bloc.superset && (bloc.chronologie || o.entrelacer)) {
        // ⚠️ §2.5 CORRIGÉ LE 13/09 — LES CHAUFFES S'ENTRELACENT AUSSI.
        //
        // « Juste avant la première série de travail de son exercice » avait été
        // écrit en pensant à un exercice isolé, où cela veut dire « en tête ».
        // Dans un superset, la règle dispersait les chauffes :
        //
        //   A A A1 B B B1 C C1 D1      ← ce que ça donnait, constaté sur device
        //
        // — il fallait quitter une machine puis y revenir, exactement ce qu'un
        // superset cherche à éviter. Les chauffes forment donc leurs PROPRES
        // tours, tous avant le travail :
        //
        //   A B C D · A B · A1 B1 C1 D1 · A2 B2 C2 D2
        //
        // C'est le geste réel : un premier passage léger sur toutes les
        // machines, un second sur celles qui en ont besoin, puis le travail.
        // Les chauffes ne comptent toujours pas dans le compteur de tours —
        // `tour` reste `null` sur elles, plus haut.
        var chauffes = bloc.exercices.map(function (e) {
          return e.series.filter(estChauffe).map(function (s) { return [s]; });
        });
        var travail = bloc.exercices.map(function (e) {
          return paqueter(e.series.filter(function (s) { return !estChauffe(s); }));
        });
        var lignesChauffe = entrelacerTours(chauffes);
        bloc.series = lignesChauffe.concat(
          entrelacerTours(travail, lignesChauffe.length > 0));
      } else {
        bloc.series = trierParRang(
          bloc.exercices.reduce(function (acc, e) { return acc.concat(e.series); }, []));
      }

      // PR 6 (décision du 02/10/2026) — « DE TRAVAIL » SE DIT SUR LA RÈGLE
      // UNIQUE (`THSemaine.compteSeriesTravail`) : la somme des blocs « de
      // travail » du détail égale la carte. Un bloc dont aucun exercice ne
      // porte de volume (le tapis) dit « 3 séries », sans « de travail » :
      // elles existent, elles n'entrent pas dans le total. `nbTravail` reste
      // le compte de structure (tours, « 2 / 4 séries » replié).
      var brutes = [];
      bloc.exercices.forEach(function (e) { brutes = brutes.concat(e.series); });
      bloc.nbTravailVolume = racine.THSemaine.compteSeriesTravail(brutes, exercices);
      var horsVolume = bloc.nbTravail > 0 && bloc.nbTravailVolume === 0;
      var nResume = horsVolume ? bloc.nbTravail : bloc.nbTravailVolume;
      bloc.resume = (bloc.superset ? 'Superset · ' : '') +
        nResume + ' série' + (nResume > 1 ? 's' : '') + (horsVolume ? '' : ' de travail');
    });

    return blocs;
  }

  // ── Les blocs de la SÉANCE EN COURS (chantier 27) ───────────────────────
  //
  // ⚠️ MÊME FONCTION QUE LE DÉTAIL, PAS UNE SECONDE IMPLÉMENTATION.
  //
  // L'écran de saisie porte une structure imbriquée (`seance.exercices[].series[]`)
  // là où le détail lit des lignes plates de `sets`. On APLATIT donc la séance
  // et on appelle `construireBlocs` — celui-là même qui rend le détail. Écrire
  // un second entrelaceur, c'était garantir que les deux divergent un jour :
  // ici, ils ne peuvent pas.
  //
  // `_iExo` / `_iSerie` voyagent sur la ligne aplatie et ressortent intacts —
  // `construireBlocs` recopie la ligne entière (`Object.assign`). Ce sont eux
  // qui rebranchent chaque rangée affichée sur sa série réelle, l'affichage
  // étant entrelacé alors que le modèle reste rangé par exercice.
  function blocsDeSeance(seance, exercices) {
    var rang = 0;
    var plat = [];
    ((seance && seance.exercices) || []).forEach(function (exo, iExo) {
      (exo.series || []).forEach(function (serie, iSerie) {
        rang++;
        plat.push(Object.assign({}, serie, {
          exercise_slug: exo.exercise_slug,
          groupe_superset: exo.groupe_superset === undefined ? null : exo.groupe_superset,
          rang: rang,
          _iExo: iExo, _iSerie: iSerie
        }));
      });
    });
    var blocs = construireBlocs(plat, exercices, { entrelacer: true });
    // L'indice de l'exercice remonte sur la légende, avec ses deux réglages :
    // c'est la légende qui porte la note, le repos cible et le « + Série » de
    // chaque branche du superset — un réglage par exercice, jamais par bloc.
    blocs.forEach(function (b) {
      b.exercices.forEach(function (e) {
        var i = e.series.length ? e.series[0]._iExo : null;
        garnir(e, i, seance);
      });
    });
    return blocs.concat(exercicesSansSerie(seance, exercices, blocs))
      .sort(function (x, y) { return positionDe(x) - positionDe(y); });
  }

  function garnir(e, i, seance) {
    var src = i === null ? null : ((seance && seance.exercices) || [])[i];
    e._iExo = i;
    e.repos_cible_s = (src && src.repos_cible_s !== undefined) ? src.repos_cible_s : null;
    e.note = (src && src.note !== undefined) ? src.note : null;
    return e;
  }

  function positionDe(bloc) {
    return bloc.exercices.reduce(function (m, e) {
      return e._iExo === null || e._iExo === undefined ? m : Math.min(m, e._iExo);
    }, Infinity);
  }

  // ⚠️ UN EXERCICE VIDÉ DE SES SÉRIES RESTE À L'ÉCRAN.
  //
  // `construireBlocs` travaille sur des LIGNES : un exercice qui n'en produit
  // aucune n'existe pas pour lui. Or supprimer la dernière série d'un exercice
  // est un geste possible — et le bloc disparaîtrait alors entièrement, avec sa
  // note, son repos cible et son « + Série ». Plus aucun chemin pour y revenir :
  // la séance perdrait l'exercice sans que personne ne l'ait demandé.
  //
  // On regreffe donc un bloc vide à sa place. Il n'a pas de série, donc pas de
  // tour, donc rien à éclairer — juste sa tête et son bouton.
  function exercicesSansSerie(seance, exercices, blocs) {
    var index = indexerExercices(exercices);
    var vus = {};
    blocs.forEach(function (b) {
      b.exercices.forEach(function (e) { if (e._iExo !== null) vus[e._iExo] = true; });
    });
    var orphelins = [];
    ((seance && seance.exercices) || []).forEach(function (exo, iExo) {
      if (vus[iExo] || (exo.series || []).length) return;
      orphelins.push({
        superset: false, groupe: null, series: [], nbTravail: 0, nbTours: 0,
        chronologie: false, resume: '0 série de travail',
        exercices: [garnir({
          slug: exo.exercise_slug, nom: nommer(index, exo.exercise_slug),
          lettre: '', series: [], nbTravail: 0
        }, iExo, seance)]
      });
    });
    return orphelins;
  }

  // ── Le tour, et son éclairage (§2.6 et §2.7) ────────────────────────────
  //
  // Un TOUR du bloc, c'est la n-ième série de travail de chaque exercice qui le
  // compose. Il est COMPLET quand toutes ces séries sont validées — dans
  // n'importe quel ordre, et sans attendre un `C3` qui n'existe pas : un
  // exercice à deux séries ne produit rien au troisième tour, donc ne bloque
  // rien.
  //
  // Rien n'est stocké (§2.4) : tout se déduit de « cette série appartient à cet
  // exercice, à cette position ».
  //
  // ⚠️ UNE SEULE CONDITION, ET C'EST LA CAMPAGNE DE MUTATIONS QUI L'A DIT.
  // Le premier jet écrivait `if (!s.estTravail || !s.tour) return;` — deux
  // façons de dire la même chose, puisque `construireBlocs` ne donne un `tour`
  // QU'AUX séries de travail (`tour: travail ? tour : null`).
  //
  // Ce qui reste n'est pas non plus tuable par mutation, et c'est assumé : ce
  // n'est pas une garde mais un FILTRE D'ENTRÉE, dont la précondition est déjà
  // garantie en amont — la retirer ne ferait qu'ajouter une clé `null` que
  // personne ne lit. On la garde parce qu'elle dit la règle (« un tour est fait
  // de séries de travail »), pas parce qu'elle protège de quelque chose.
  function toursComplets(bloc) {
    var parTour = {};
    ((bloc && bloc.series) || []).forEach(function (s) {
      if (!s.tour) return;
      if (parTour[s.tour] === undefined) parTour[s.tour] = true;
      // `faite`, pas `validee_a` (chantier 35, D3) : sinon un tour entièrement
      // fait, mais importé, resterait éteint sur la séance rouverte.
      if (!s.faite) parTour[s.tour] = false;
    });
    return parTour;
  }

  // Le TOUR ATTEINT : combien de tours complets se suivent depuis le premier.
  // On s'arrête au premier trou — valider le tour 3 en sautant le 2 ne fait pas
  // avancer de deux crans.
  function toursFaits(bloc) {
    var complets = toursComplets(bloc);
    var n = 0;
    while (complets[n + 1] === true) n++;
    return n;
  }

  // Ce que l'appelant pose sur la séance : un compte par groupe de superset.
  // Les blocs d'un seul exercice n'y figurent pas — ils n'ont pas de tour à
  // annoncer, leur éclairage suffit.
  function toursFaitsParGroupe(blocs) {
    var faits = {};
    (blocs || []).forEach(function (b) {
      if (!b.superset || b.groupe === null || b.groupe === undefined) return;
      faits[String(b.groupe)] = toursFaits(b);
    });
    return faits;
  }

  // ── Résumé d'une séance pour la liste ───────────────────────────────────

  // ── L'aperçu d'une carte de séance (ECRAN-SAISIE §7 bis.5) ──────────────
  //
  // Les TROIS PREMIERS exercices dans l'ordre de la séance, puis « et N autres ».
  // Trois, parce que les séances font 8,1 exercices en moyenne et que tout
  // afficher rendrait la semaine illisible. Les trois PREMIERS, parce que
  // l'ordre porte l'intention : le mouvement principal vient en premier.
  //
  // ⚠️ Le PALIER manque, et ce n'est pas un oubli. Le §7 bis.5 veut « palier ×
  // meilleures reps au palier ». Le palier au sens du §7 du moteur exige les
  // exclusions des §4.1 (chauffe probable), §5 (montée) et §6 — c'est-à-dire le
  // moteur de progression, hors périmètre ici. La règle de majorité du §7.2
  // prise seule ne reconnaît un palier que sur 63,9 % des séance-exercices,
  // contre 93-98 % avec les exclusions : un tiers des cartes serait muet et
  // certaines afficheraient un chiffre que le moteur contredira ensuite. Deux
  // voix pour le même chiffre : la famille de défauts que l'audit v1 a
  // cataloguée. La colonne de droite attend le moteur.
  var APERCU_MAX = 3;

  // « et 1 autre exercice », « et 3 autres exercices ». Les DEUX mots
  // s'accordent — le second était resté au pluriel.
  function libelleAutres(n) {
    var k = Number(n) || 0;
    if (k <= 0) return '';
    return 'et ' + k + (k > 1 ? ' autres exercices' : ' autre exercice');
  }

  // La colonne de droite porte la MEILLEURE SÉRIE (§7 bis.5), pas le palier.
  //
  // Corrigé au chantier 18 après vérification sur device : le palier est la
  // charge tenue sur la majorité des séries — la grandeur du MOTEUR, elle décide
  // de la suite. Ce n'est pas ce qu'on lit dans un journal. Sur le hack squat du
  // 24/08 (`122,6×10 ×3 + 127,6×10`), le palier vaut 122,6 et c'est juste, mais
  // ce qu'on a fait de mieux ce jour-là, c'est 127,6 × 10.
  //
  // Les deux grandeurs cohabitent et ne se fusionnent pas.
  //
  // `etats` est la table de THPalier.etatsExercices, calculée une fois sur tout
  // le cache. Un exercice absent de la table reste « indéterminé » : aucune
  // hypothèse, jamais une valeur par défaut.
  //
  // ⚠️ LA MEILLEURE SÉRIE D'UN EXERCICE — UN SEUL CALCUL, DEUX LECTEURS.
  //
  // La carte de séance l'affichait déjà ; la page d'exercice (§7 quater) en a
  // besoin aussi. Extraite ici plutôt que réécrite là-bas : deux versions de
  // « ce qu'on a fait de mieux » finiraient par se contredire, comme la carte et
  // la barre du §1 de ce chantier (`CADRAGE-V2 §2 undecies`).
  //
  // Elle rend les mêmes clés qu'avant : `charge`/`reps` sur `charge_reps`,
  // `valeur` (+ `complement`) sur les trois autres mesures. Une absence reste
  // une absence — aucune clé plutôt qu'un zéro.
  function meilleureSerieDe(slug, series, exercices, palier, etats) {
    var index = indexerExercices(exercices || []);
    var g = gabaritDe(index[slug]);
    var e = {};

    // ⚠️ L'ORDRE ET LES CLÉS SONT CEUX D'AVANT L'EXTRACTION. `charge` et `reps`
    // sont posées — à `null` s'il n'y a rien — pour TOUTES les mesures dès qu'un
    // moteur est fourni : « absent » s'écrit `null`, jamais `undefined`, et un
    // consommateur qui distingue les deux verrait une régression là où il n'y a
    // qu'un déplacement de code.
    if (palier) {
      var parExo = {};
      palier.decouperParExercice(series || []).forEach(function (se) { parExo[se.slug] = se.series; });
      // ⚠️ LA MESURE EST DONNÉE AU MOTEUR, pas devinée par lui. Sans elle, il ne
      // distingue pas une planche — qui n'aura jamais de palier — d'un développé
      // couché dont les kilos n'ont pas été saisis ce jour-là.
      var r = palier.analyser(parExo[slug] || [], (etats || {})[slug], { mesure: g.mesure });
      // Une meilleure série absente ne s'invente pas.
      e.charge = r.meilleure ? r.meilleure.charge : null;
      e.reps = r.meilleure ? r.meilleure.reps : null;
    }
    if (g.mesure === 'charge_reps') return e;

    // ⚠️ LES TROIS AUTRES MESURES N'ONT PAS DE PALIER, ET C'EST CORRECT.
    // `palier.analyser` écarte toute série sans charge NI reps : sur `reps`,
    // `temps` et `distance_temps` il rend une absence propre. On lit donc la
    // meilleure série DIRECTEMENT, dans la grandeur de la mesure — aucune
    // formule, aucune comparaison, le maximum de ce qui a été fait.
    var siennes = (series || []).filter(function (x) {
      return x && x.exercise_slug === slug && estTravail(x);
    });
    if (!siennes.length) return e;

    if (g.mesure === 'reps') {
      // Pas de clé du tout quand il n'y a rien à dire : « rien » et « zéro » ne
      // doivent pas se ressembler, même en interne.
      var t = texteMax(siennes, 'reps', String);
      if (t !== null) e.valeur = t;
      return e;
    }

    var longue = null, plusLongue = null;
    siennes.forEach(function (x) {
      var d = valeurNumerique(x, 'duree_s');
      if (d === null) return;
      if (longue === null || d > plusLongue) { longue = x; plusLongue = d; }
    });
    if (longue === null) return e;
    e.valeur = formatDuree(longue.duree_s);
    if (g.mesure === 'distance_temps' && longue.distance_m) {
      e.complement = '\u00b7 ' + formatDistance(longue.distance_m);
    }
    return e;
  }

  // ── LA MEILLEURE SÉRIE DE TOUT L'HISTORIQUE (§7 quater) ──────────────────
  //
  // ⚠️ AUCUN SECOND CALCUL ICI — on RAPPELLE le chemin de la carte. La page
  // d'exercice montre un record, la carte montre le meilleur du jour : c'est la
  // même question posée sur un périmètre plus large, et deux calculs finiraient
  // par se contredire (`CADRAGE-V2` §2 undecies).
  //
  // ⚠️ ET ON NE LUI DONNE PAS L'UNION DE TROIS ANS. Le palier est une notion de
  // SÉANCE : « chauffe probable » se juge à ≤ 75 % de la plus lourde DU JOUR, et
  // `rang` n'ordonne que l'intérieur d'une séance. Sur l'union, une série de
  // travail de 2024 passerait pour l'échauffement d'un record de 2026.
  //
  // Les mesures SANS charge échappent à ce piège : leur meilleure série est un
  // maximum (reps, durée), et un maximum ne dépend pas du découpage en séances.
  // Un seul appel sur tout l'historique y donne exactement le même résultat que
  // le meilleur des appels séance par séance — on ne fait donc pas les autres.
  //
  // `parSeance` est une liste de `{ cle, series }` : la clé est ce que
  // l'appelant veut retrouver — la date du jour du record. Elle ressort sur la
  // meilleure série SEULEMENT quand on a comparé séance par séance, c'est-à-dire
  // sur `charge_reps`. Ailleurs, un maximum n'a pas de séance gagnante à
  // désigner sans la rechercher, et on ne prétend pas la connaître.
  function meilleureSerieDeTout(slug, parSeance, exercices, palier, etats) {
    var groupes = parSeance || [];
    var g = gabaritDe(indexerExercices(exercices || [])[slug]);
    if (g.mesure !== 'charge_reps') {
      var toutes = [];
      groupes.forEach(function (gr) { toutes = toutes.concat((gr && gr.series) || []); });
      return meilleureSerieDe(slug, toutes, exercices, palier, etats);
    }

    // Même contrat que la carte : sans moteur, il n'y a rien à dire, et rien se
    // dit avec aucune clé — pas avec un `null`.
    if (!palier) return {};

    var best = null;
    groupes.forEach(function (gr) {
      var m = meilleureSerieDe(slug, (gr && gr.series) || [], exercices, palier, etats);
      if (m.charge === null || m.charge === undefined) return;
      // La plus lourde ; à charge égale, les meilleures reps — l'arbitrage de
      // `THPalier.meilleureSerie`, appliqué d'une séance à l'autre.
      if (!best || m.charge > best.charge ||
          (m.charge === best.charge && m.reps > best.reps)) {
        m.cle = gr ? gr.cle : null;
        best = m;
      }
    });
    // « Absent » s'écrit `null`, jamais `undefined` : c'est ce que la carte
    // rend, et un consommateur qui distingue les deux verrait une régression.
    return best || { charge: null, reps: null };
  }

  // ── LA TABLE PAR NOMBRE DE RÉPÉTITIONS (§7 quater.3) ─────────────────────
  //
  // « C'est elle qui dit le niveau réel » — « mon record c'est 140 » ne veut
  // rien dire sans le nombre de répétitions.
  //
  // ⚠️ ELLE NE VAUT QUE POUR `charge_reps` ET `reps`. Sur `distance_temps`, il
  // n'y a pas de table : ces exercices sont hors du périmètre du moteur
  // (§3 ter.3). Sur `temps`, la spec veut une table par nombre de SÉRIES — « la
  // plus longue en une série, en deux, en trois » — qui est un AUTRE calcul, et
  // la phrase se lit de deux façons. On ne l'invente pas : on rend une liste
  // vide, et la page affiche la meilleure série. Écart signalé, pas comblé.
  //
  // ⚠️ BRUT, AVEC LES LIGNES DÉDUITES SIGNALÉES. Une ligne est DÉDUITE quand un
  // meilleur résultat existe à PLUS de répétitions : qui a fait 80 × 15 a
  // forcément pu faire 80 × 14. On n'écrase pas le brut — on le garde et on dit
  // qu'il est dépassé, parce que « ce que j'ai fait » et « ce que je pourrais
  // revendiquer » sont deux lectures différentes.
  //
  // Mesuré sur le développé couché d'aurel_br : une seule ligne déduite sur
  // quinze, celle des 14 reps — le brut y donnait 42,5 kg de février 2024 alors
  // qu'il a fait 80 × 15 en juillet 2025.
  //
  // La DATE est portée par chaque ligne, et elle change la lecture : un record à
  // 8 reps de novembre et un à 6 reps d'hier ne se lisent pas pareil.
  function tableParReps(series, mesure, dateDe) {
    if (mesure !== 'charge_reps' && mesure !== 'reps') return [];
    var quand = dateDe || function (s) { return s && s.validee_a; };

    // Le meilleur par nombre de reps. « Meilleur » veut dire la charge la plus
    // lourde sur `charge_reps` ; sur `reps`, il n'y a pas de charge à comparer,
    // et c'est la règle du déduit ci-dessous qui s'en charge.
    var parReps = {};
    (series || []).forEach(function (s) {
      if (!estTravail(s)) return;
      var r = valeurNumerique(s, 'reps');
      if (r === null || r <= 0) return;
      var c = mesure === 'charge_reps' ? valeurNumerique(s, 'charge_kg') : 0;
      if (mesure === 'charge_reps' && c === null) return;
      var actuel = parReps[r];
      if (!actuel || c > actuel.charge) parReps[r] = { reps: r, charge: c, date: quand(s) };
    });

    var lignes = Object.keys(parReps)
      .map(function (k) { return parReps[k]; })
      .sort(function (a, b) { return a.reps - b.reps; });

    // Déduite : un meilleur résultat existe à PLUS de répétitions. On balaie de
    // la droite vers la gauche en gardant le maximum vu — une seule passe.
    //
    // ⚠️ LA GRANDEUR COMPARÉE N'EST PAS LA MÊME SELON LA MESURE. Sur
    // `charge_reps`, c'est la CHARGE qui tranche : 42,5 × 14 est déduit par
    // 80 × 15. Sur `reps`, il n'y a pas de charge — `charge` vaut 0 partout, et
    // une comparaison de charges ne déduirait JAMAIS rien alors que tout est
    // déduit : on ne fait pas 15 répétitions sans pouvoir en faire 14. La table
    // d'un exercice en `reps` a donc une seule ligne pleine, la plus haute.
    var maxADroite = null;
    for (var i = lignes.length - 1; i >= 0; i--) {
      lignes[i].deduit = mesure === 'reps'
        ? i < lignes.length - 1
        : (maxADroite !== null && maxADroite > lignes[i].charge);
      // Ce qu'on pourrait revendiquer ne s'écrit que s'il y a quelque chose à
      // revendiquer : sur `reps`, la charge déduite serait un zéro trompeur.
      if (lignes[i].deduit && mesure === 'charge_reps') lignes[i].chargeDeduite = maxADroite;
      if (maxADroite === null || lignes[i].charge > maxADroite) maxADroite = lignes[i].charge;
    }
    return lignes;
  }

  // ── LE RECORD DE CHARGE (§7 quater, PR 5 de la consolidation) ────────────
  //
  // LA LIGNE LA PLUS LOURDE DE LA TABLE PAR REPS ; à charge égale, celle qui
  // a le plus de reps (l'autre est déduite). Un record est un FAIT, en vraies
  // barres, exploration comprise (décision du 02/10/2026) : la fiche et la
  // table d'une même page ne peuvent plus se contredire, elles lisent la même
  // liste. Rend `{ charge, reps, date }`, ou `{ charge: null, reps: null,
  // date: null }` sans table.
  function recordDeLaTable(table) {
    var best = null;
    (table || []).forEach(function (l) {
      if (!l || l.charge === null || l.charge === undefined) return;
      if (!best || l.charge > best.charge || (l.charge === best.charge && l.reps > best.reps)) best = l;
    });
    return best ? { charge: best.charge, reps: best.reps, date: best.date || null }
      : { charge: null, reps: null, date: null };
  }

  function apercuExercices(series, exercices, palier, etats) {
    var index = indexerExercices(exercices || []);
    var vus = {}, ordre = [];
    trierParRang(series || []).forEach(function (s) {
      if (!s || !s.exercise_slug || vus[s.exercise_slug]) return;
      vus[s.exercise_slug] = true;
      ordre.push({ slug: s.exercise_slug, nom: nommer(index, s.exercise_slug) });
    });

    var tete = ordre.slice(0, APERCU_MAX);
    // Un seul calcul, partagé avec la page d'exercice : voir `meilleureSerieDe`.
    tete.forEach(function (e) {
      var m = meilleureSerieDe(e.slug, series, exercices, palier, etats);
      Object.keys(m).forEach(function (k) { e[k] = m[k]; });
    });

    return {
      tete: tete,
      // Jamais « et 0 autres exercices » : une séance de trois exercices ou
      // moins est montrée en entier, il n'y a rien à annoncer.
      autres: Math.max(0, ordre.length - APERCU_MAX)
    };
  }

  function resumerSeance(seance, series, exercices, palier, etats) {
    var index = indexerExercices(exercices);
    var listeSeries = series || [];
    // ⚠️ LA CARTE LIT LE MÊME COMPTE QUE LA BARRE (chantier 40).
    //
    // Elle comptait `estTravail` seul, sans la règle du volume : la séance du
    // 14/09 affichait 23 dans la barre et 25 sur sa carte, pour les MÊMES séries
    // — les deux du tapis. Le chantier 39 avait posé la règle à un endroit sur
    // deux, ce que `CADRAGE-V2 §2 undecies` appelle la maladie de la semaine.
    //
    // ⚠️ ON APPELLE, ON NE RECOPIE PAS. Trois lignes recopiées ici divergeraient
    // le jour où la règle bouge — et elle a déjà bougé deux fois. `THSemaine` se
    // charge APRÈS `THModele` mais AVANT tout appel : la lecture est donc tardive,
    // et sans repli, pour qu'une dépendance manquante casse bruyamment plutôt que
    // de rendre un compte faux en silence.
    var dureeTotale = 0, distanceTotale = 0;
    var sortie = listeSeries.length > 0;

    listeSeries.forEach(function (s) {
      if (s.duree_s) dureeTotale += Number(s.duree_s) || 0;
      if (s.distance_m) distanceTotale += Number(s.distance_m) || 0;
      if (!estExerciceSortie(index[s.exercise_slug])) sortie = false;
    });

    // Une séance dont AUCUNE série n'est en cache n'est pas une séance vide :
    // elle est incomplète. Vérifié en base — toutes les séances ont leurs
    // séries, randonnées et natations comprises (charge `aucune`, mesure
    // `distance_temps`). L'afficher « 0 exercice · 0 série » la ferait passer
    // pour un fait légitime alors que c'est un manque, et le manque se dit.
    //
    // ⚠️ ON DEMANDE, ON NE RECOMPTE PAS (chantier 47). La règle vit dans
    // `THSeance.seriesIncompletes` et couvre DEUX manques — aucune série, ou
    // des séries sans provenance. La recopier ici (`listeSeries.length === 0`,
    // ce qu'elle disait) laissait la carte plus permissive que la garde de la
    // réouverture, et c'est par cet écart qu'une séance se faisait effacer.
    // Lecture TARDIVE, comme `THSemaine` juste en dessous : `seance.js` se
    // charge après `modele.js`, et sans repli pour qu'une dépendance manquante
    // casse bruyamment plutôt que de rendre un verdict faux en silence.
    var incomplet = racine.THSeance.seriesIncompletes(listeSeries);
    var nbTravail = racine.THSemaine.compteSeriesTravail(listeSeries, exercices);

    return {
      id: seance.id,
      titre: seance.titre || 'Séance',
      incomplet: incomplet,
      debut: seance.debut,
      salle: seance.salle_norme || seance.salle || '',
      nbExercices: Object.keys(exercicesFaits(listeSeries)).length,
      nbSeriesTravail: nbTravail,
      // Une sortie ne se résume pas en séries : elle se résume en durée et
      // distance. Elle reste visible, simplement plus discrète.
      // Une séance incomplète n'est jamais classée en sortie : `sortie` part de
      // `listeSeries.length > 0`, donc sans série il vaut déjà faux.
      estSortie: sortie,
      // Une sortie n'a pas d'aperçu d'exercices : elle se dit en durée et en
      // distance. On ne construit donc rien qu'on n'affichera pas.
      apercu: sortie ? null : apercuExercices(listeSeries, exercices, palier, etats),
      dureeTotale: dureeTotale || null,
      distanceTotale: distanceTotale || null
    };
  }

  // ══ L'ANCIENNETÉ, EN CLAIR (§7 nonies, §7 octodecies.3) ══════════════════
  //
  // ⚠️ ELLE RÈGLE LE PROBLÈME DU SEUIL SANS QU'ON EN FIXE UN. On n'a jamais su
  // dire à partir de combien de temps une séance ouverte — ou un brouillon —
  // devient un oubli. On ne le dit pas : on affiche « depuis 3 jours », et ça
  // se lit tout seul comme un oubli. C'est le raisonnement du §7 nonies, et il
  // vaut pour les deux bandeaux.
  //
  // ⚠️ `maintenant` EST UN PARAMÈTRE, pas un `Date.now()` caché. Une fonction
  // qui lit l'horloge ne se teste qu'en attendant, et un bandeau qui se teste
  // en attendant ne se teste pas.
  //
  // Le futur — une horloge d'appareil en avance, un fuseau mal posé — retombe
  // sur « à l'instant » plutôt que sur un « depuis -2 h » qui n'existe pas.
  var MINUTE = 60, HEURE = 3600, JOUR = 86400;
  function anciennete(depuis, maintenant) {
    var t = Date.parse(depuis);
    var n = maintenant instanceof Date ? maintenant.getTime() : Number(maintenant);
    if (!isFinite(t) || !isFinite(n)) return '';
    var s = Math.floor((n - t) / 1000);
    if (s < MINUTE) return 'à l\u2019instant';
    if (s < HEURE) return 'depuis ' + Math.floor(s / MINUTE) + ' min';
    if (s < JOUR) {
      var h = Math.floor(s / HEURE);
      return 'depuis ' + h + ' h';
    }
    var j = Math.floor(s / JOUR);
    return 'depuis ' + j + ' jour' + (j > 1 ? 's' : '');
  }

  var api = {
    LETTRES: LETTRES,
    TYPES_CONNUS: TYPES_CONNUS,
    MESURES: MESURES,
    GABARITS: GABARITS,
    CHAMPS_MESURE: CHAMPS_MESURE,
    gabaritDe: gabaritDe,
    champDeMesure: champDeMesure,
    MAX_CHIFFRES_DUREE: MAX_CHIFFRES_DUREE,
    MAX_DUREE_S: MAX_DUREE_S,
    poserChiffreDuree: poserChiffreDuree,
    retirerChiffreDuree: retirerChiffreDuree,
    dureeDeChiffres: dureeDeChiffres,
    chiffresDeDuree: chiffresDeDuree,
    formatChrono: formatChrono,
    formatPrecedent: formatPrecedent,
    estTravail: estTravail,
    typeDe: typeDe,
    exercicesFaits: exercicesFaits,
    nombre: nombre,
    charge: charge,
    capturer: capturer,
    reporter: reporter,
    NATURES: NATURES,
    chargeFois: chargeFois,
    serie: serie,
    quand: quand,
    MOIS_COURTS: MOIS_COURTS,
    MOIS_LONGS: MOIS_LONGS,
    arrondi: arrondi,
    nombreSigne: nombreSigne,
    nombreGroupe: nombreGroupe,
    mmss: mmss,
    dateCourte: dateCourte,
    dateLongue: dateLongue,
    jourMois: jourMois,
    jourCourt: jourCourt,
    moisAnnee: moisAnnee,
    heureParis: heureParis,
    dateHeureParis: dateHeureParis,
    JOURS: JOURS,
    JOURS_NOMMES: JOURS_NOMMES,
    anciennete: anciennete,
    formatDuree: formatDuree,
    formatDistance: formatDistance,
    formatMesure: formatMesure,
    estExerciceSortie: estExerciceSortie,
    memeBloc: memeBloc,
    trierParRang: trierParRang,
    paqueter: paqueter,
    indexerExercices: indexerExercices,
    nommer: nommer,
    construireBlocs: construireBlocs,
    faiteEnBase: faiteEnBase,
    blocsDeSeance: blocsDeSeance,
    toursComplets: toursComplets,
    toursFaits: toursFaits,
    toursFaitsParGroupe: toursFaitsParGroupe,
    resumerSeance: resumerSeance,
    apercuExercices: apercuExercices,
    meilleureSerieDe: meilleureSerieDe,
    meilleureSerieDeTout: meilleureSerieDeTout,
    tableParReps: tableParReps,
    recordDeLaTable: recordDeLaTable,
    libelleAutres: libelleAutres
  };

  // Pas de module ES6 (contrainte du dépôt) : namespace global côté navigateur,
  // module.exports côté Jest.
  racine.THModele = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // ⚠️ `globalThis` ET NON `this` — corrigé le 19/09/2026 (48b-5b-1). Sous Jest,
  // le code est transformé en mode STRICT, où `this` vaut `undefined` à la
  // racine d'un module : `racine.THModele = api` levait un TypeError et le
  // module devenait INCHARGEABLE dans un test `@jest-environment node`. Dans le
  // navigateur `self` gagne toujours, donc rien ne change à l'écran ; en node
  // nu, `this` valait `module.exports` et le global restait vide — le module se
  // chargeait mais ne se câblait pas. `palier.js`, `moteur.js` et onze autres
  // modules v2 emploient déjà `globalThis`.
})(typeof self !== 'undefined' ? self : globalThis);
