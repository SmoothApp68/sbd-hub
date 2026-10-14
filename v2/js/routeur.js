// v2/js/routeur.js — routage d'URL et décisions de retour.
//
// Module PUR : aucune dépendance au DOM, à History, au réseau. Analyser un
// chemin, en construire un, dire quelle route est affichable — tout cela se
// teste sans navigateur, et c'est là que vivent les règles.
//
// SCHÉMA D'URL
//   /                       la semaine courante — la racine, onglet Séances
//   /semaine/AAAA-MM-JJ     une semaine, désignée par son lundi
//   /seance/<uuid>          le détail d'une séance
//   /saisie                 onglet Saisie — la bibliothèque de routines
//   /routine/nouvelle       créer une routine
//   /routine/<uuid>         modifier une routine
//   /saisie/relecture[/<dossier>]   « Le coach relit ta semaine » (66B) : un dossier, encodé ; sans dossier, rien
//   /progression            onglet Progression — le SOMMAIRE
//   /progression/volume     le volume par muscle d'une semaine, et le radar
//   /progression/poids      le poids de corps
//   /progression/mois[/AAAA-MM]     le bilan d'un mois (le mois écoulé par défaut)
//   /progression/records[/AAAA-MM]  les records d'un mois
//   /profil                 onglet Profil
//   /profil/exercices       tous mes exercices, et leur dernière séance
//   /jeu                    onglet Jeu (64B, JEU-V1 §9.2) — l'accueil du jeu
//   /jeu/muscles            les sept muscles
//   /jeu/succes             les succès, par catégorie, et les titres
//   /jeu/deblocages         les cadres et les gels
//   /jeu/fil                le fil des séances des personnes suivies (87, SOCIAL-V1)
//   /jeu/amis               trouver des amis, le lien d'invitation, la confidentialité
//   /a/<pseudo>             le profil social d'une personne (lien d'invitation)
//   /connexion              l'écran de connexion
//   /inscription            créer un compte
//
// Progression n'est pas une barre de sous-onglets mais un SOMMAIRE de blocs
// (ECRAN-SAISIE §7 bis.14) : chaque bloc s'ouvre sur une vue complète, qui a
// donc son propre chemin. Un sous-chemin plutôt qu'un segment à part entière —
// « /progression/poids » dit d'où l'on vient, et le retour d'Android remonte
// au sommaire sans qu'on ait à l'écrire.
//
// Les trois onglets reprennent la forme de /connexion : un segment, en clair,
// sans paramètre. Chaque onglet est une VUE du routeur, avec son URL — pas un
// basculement d'affichage : un rechargement direct rouvre le bon onglet.
//
// La semaine est désignée par la DATE de son lundi, pas par un numéro ISO :
// « /semaine/2026-09-07 » se lit sans décoder, se partage tel quel, et évite
// les pièges de la numérotation ISO (années à 53 semaines, semaine 1 à cheval).
// Un chemin qui pointe un autre jour que le lundi est accepté et ramené au
// lundi de sa semaine — un lien approximatif vaut mieux qu'un 404.

(function (racine) {
  'use strict';

  var RACINE = 'racine', SEMAINE = 'semaine', SEANCE = 'seance', CONNEXION = 'connexion';
  var SAISIE = 'saisie', PROGRESSION = 'progression', PROFIL = 'profil';
  // 64B (JEU-V1 §9.2) — l'onglet Jeu et ses trois sous-vues. ⚠️ LE ROUTEUR NE
  // CONNAÎT PAS L'INTERRUPTEUR : il reste pur. Jeu éteint, c'est `app.js` qui
  // traite `/jeu…` comme une route inconnue.
  var JEU = 'jeu', MUSCLES = 'muscles', SUCCES = 'succes', DEBLOCAGES = 'deblocages';
  // 87 (SOCIAL-V1) — le social vit DANS l'onglet Jeu (« Jeu & amis »), mais il ne dépend pas de
  // l'interrupteur du jeu : `estVueDuJeu` ne le compte pas. `/a/<pseudo>` est le lien d'invitation.
  var FIL = 'fil', AMIS = 'amis', AMI = 'ami', COMPARER = 'comparer';
  var RE_PSEUDO = /^[A-Za-z0-9_.-]{1,40}$/;
  var VOLUME = 'volume', POIDS = 'poids';
  // MOTEUR §9.23 (55-1) — le bilan d'un mois et ses records, sous Progression.
  // Le mois est un segment de plus (« /progression/mois/2026-09 ») : tous les
  // mois restent consultables, et un rechargement rouvre le même.
  var MOIS = 'mois', RECORDS = 'records';
  // 75 (ECRAN-SAISIE §7 bis.14 ter) — « Ton parcours », sous Progression : « /progression/parcours ».
  var PARCOURS = 'parcours';
  var RE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;
  // L'inscription est une VUE, pas un repli de la connexion : un rechargement
  // direct la rouvre, et le retour d'Android ramène à la connexion sans qu'on
  // ait à l'écrire. Même règle que partout ailleurs — un écran, une URL.
  var INSCRIPTION = 'inscription';
  // §2.4 bis — la liste de TOUS les exercices vit sous le profil, comme le
  // volume et le poids vivent sous Progression. Chez nous la page d'exercice ne
  // s'atteignait que depuis une séance en cours et depuis Progression : pour
  // voir l'historique de son couché, il fallait démarrer une séance.
  var EXERCICES = 'exercices';
  // 69 (ECRAN-PROFIL §2.4 quater) — « Importer depuis Hevy », sous le profil :
  // « /profil/import ». L'aperçu vit en mémoire : un rechargement rouvre les
  // deux choix, rien n'ayant été écrit avant « Importer ».
  var IMPORT = 'import';
  // L'éditeur de routine est une VUE, avec son URL, sur le modèle de
  // `/seance/<uuid>` : un rechargement direct la rouvre, et le retour d'Android
  // remonte à la bibliothèque sans qu'on ait à l'écrire. `nouvelle` est le
  // même écran sans routine derrière — un mot réservé plutôt qu'un segment de
  // plus, parce que c'est le même formulaire et le même code.
  var ROUTINE = 'routine';
  // §7 quater — une seule page d'exercice, atteinte de partout, et chacun de ses
  // deux sous-onglets est adressable : la règle du routeur vaut pour elle aussi.
  var EXERCICE = 'exercice', EXO_HISTORIQUE = 'historique';
  var RE_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
  var ROUTINE_NEUVE = 'nouvelle';
  // 66B (QUESTIONNAIRE §5 ter.4 bis) — « Le coach relit ta semaine », une vue SOUS Saisie : « /saisie/relecture »
  // (les routines sans dossier) ou « /saisie/relecture/<dossier> » (le nom du dossier, encodé : c'est un texte libre).
  // L'onglet Saisie reste allumé. Le routeur ne sait pas si le dossier existe : `app.js` le vérifie.
  var RELECTURE = 'relecture';

  // Les vues qui vivent SOUS Progression. Le chemin est « /progression/<clé> »
  // et l'onglet allumé reste Progression.
  var SOUS_PROGRESSION = {};
  SOUS_PROGRESSION[VOLUME] = true; SOUS_PROGRESSION[POIDS] = true;
  SOUS_PROGRESSION[MOIS] = true; SOUS_PROGRESSION[RECORDS] = true;
  SOUS_PROGRESSION[PARCOURS] = true;
  // Celles qui portent un mois.
  var AVEC_MOIS = {};
  AVEC_MOIS[MOIS] = true; AVEC_MOIS[RECORDS] = true;

  // Et celles qui vivent SOUS Profil. Le chemin est « /profil/<clé> » et
  // l'onglet allumé reste Profil.
  var SOUS_PROFIL = {};
  SOUS_PROFIL[EXERCICES] = true; SOUS_PROFIL[IMPORT] = true;

  // Et celles qui vivent SOUS Jeu (64B), sur le même patron : « /jeu/<clé> »,
  // l'onglet Jeu reste allumé, le retour d'Android remonte à « /jeu ».
  var SOUS_JEU = {};
  SOUS_JEU[MUSCLES] = true; SOUS_JEU[SUCCES] = true; SOUS_JEU[DEBLOCAGES] = true;
  // 87 — les deux vues sociales sous « /jeu/ » (même onglet, hors interrupteur).
  var SOUS_SOCIAL = {};
  SOUS_SOCIAL[FIL] = true; SOUS_SOCIAL[AMIS] = true;

  // Vues à segment unique, sans paramètre. La racine n'y figure pas : elle est
  // le chemin « / », et c'est l'onglet Séances.
  var SEGMENTS = {};
  SEGMENTS[CONNEXION] = true; SEGMENTS[SAISIE] = true;
  SEGMENTS[PROGRESSION] = true; SEGMENTS[PROFIL] = true; SEGMENTS[JEU] = true;
  SEGMENTS[INSCRIPTION] = true;

  var RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }

  // Date locale -> « AAAA-MM-JJ ». En composantes locales, jamais en ISO/UTC :
  // toISOString() décalerait la date d'un jour selon le fuseau.
  function versDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + deuxChiffres(d.getMonth() + 1) + '-' + deuxChiffres(d.getDate());
  }

  // « AAAA-MM-JJ » -> Date locale à minuit. Rejette ce qui n'existe pas :
  // 2026-13-01 et 2026-02-30 ne sont pas des dates.
  function depuisDate(txt) {
    var m = RE_DATE.exec(String(txt || ''));
    if (!m) return null;
    var an = +m[1], mois = +m[2] - 1, jour = +m[3];
    var d = new Date(an, mois, jour, 0, 0, 0, 0);
    if (d.getFullYear() !== an || d.getMonth() !== mois || d.getDate() !== jour) return null;
    return d;
  }

  // Chemin -> { vue, params }. Une URL inconnue ou malformée retombe sur la
  // racine : l'app s'ouvre, elle ne montre jamais d'erreur de routage.
  function analyser(chemin) {
    var brut = String(chemin || '/').split('?')[0].split('#')[0];
    var bouts = brut.split('/').filter(Boolean);

    if (!bouts.length) return { vue: RACINE, params: {} };

    if (bouts.length === 1 && SEGMENTS[bouts[0]]) return { vue: bouts[0], params: {} };

    if (bouts[0] === PROGRESSION && bouts.length === 2) {
      // Un sous-chemin inconnu retombe sur le sommaire, pas sur la racine :
      // « /progression/nimporte » reste dans Progression, ce qui est le moins
      // surprenant pour un lien qui a vieilli.
      if (!SOUS_PROGRESSION[bouts[1]]) return { vue: PROGRESSION, params: {}, repli: 'sous-vue-inconnue' };
      return { vue: bouts[1], params: {} };
    }

    if (bouts[0] === PROGRESSION && bouts.length === 3 && AVEC_MOIS[bouts[1]]) {
      // Un mois malformé retombe sur la même vue, sans mois : le mois écoulé.
      if (!RE_MOIS.test(bouts[2])) return { vue: bouts[1], params: {}, repli: 'mois-invalide' };
      return { vue: bouts[1], params: { mois: bouts[2] } };
    }

    if (bouts[0] === PROFIL && bouts.length === 2) {
      // Même règle que Progression : un sous-chemin inconnu reste DANS le
      // profil. Un lien qui a vieilli ne renvoie pas à la racine.
      if (!SOUS_PROFIL[bouts[1]]) return { vue: PROFIL, params: {}, repli: 'sous-vue-inconnue' };
      return { vue: bouts[1], params: {} };
    }

    if (bouts[0] === JEU && bouts.length === 2 && SOUS_SOCIAL[bouts[1]]) return { vue: bouts[1], params: {} };

    // 87 — le profil d'une personne : « /a/<pseudo> ». Un pseudo illisible retombe sur le fil.
    // 89 — l'étage 2 : « /a/<pseudo>/comparer » (se comparer sur la période) et « /a/<pseudo>/exercice/<slug> »
    // (son exercice). Un reste illisible retombe sur son profil.
    if (bouts[0] === 'a' && bouts.length >= 2 && bouts.length <= 4) {
      var pseudo = null;
      try { pseudo = decodeURIComponent(bouts[1]); } catch (e) { pseudo = null; }
      if (pseudo === null || !RE_PSEUDO.test(pseudo)) return { vue: FIL, params: {}, repli: 'pseudo-invalide' };
      if (bouts.length === 2) return { vue: AMI, params: { pseudo: pseudo } };
      if (bouts.length === 3 && bouts[2] === COMPARER) return { vue: AMI, params: { pseudo: pseudo, comparer: true } };
      if (bouts.length === 4 && bouts[2] === EXERCICE && RE_SLUG.test(bouts[3])) {
        return { vue: AMI, params: { pseudo: pseudo, slug: bouts[3] } };
      }
      return { vue: AMI, params: { pseudo: pseudo }, repli: 'sous-vue-inconnue' };
    }

    if (bouts[0] === JEU && bouts.length === 2) {
      // Même règle : un sous-chemin inconnu reste dans le jeu.
      if (!SOUS_JEU[bouts[1]]) return { vue: JEU, params: {}, repli: 'sous-vue-inconnue' };
      return { vue: bouts[1], params: {} };
    }

    if (bouts[0] === SAISIE && bouts[1] === RELECTURE && (bouts.length === 2 || bouts.length === 3)) {
      if (bouts.length === 2) return { vue: RELECTURE, params: { dossier: null } };
      var dossier = null;
      try { dossier = decodeURIComponent(bouts[2]); } catch (e) { dossier = null; }
      // Un segment illisible retombe sur la bibliothèque, pas sur la racine (comme un id de routine invalide).
      if (dossier === null || !dossier.trim()) return { vue: SAISIE, params: {}, repli: 'dossier-invalide' };
      return { vue: RELECTURE, params: { dossier: dossier } };
    }

    if (bouts[0] === SEMAINE && bouts.length === 2) {
      var d = depuisDate(bouts[1]);
      if (!d) return { vue: RACINE, params: {}, repli: 'date-invalide' };
      return { vue: SEMAINE, params: { lundi: d } };
    }

    if (bouts[0] === ROUTINE && bouts.length === 2) {
      if (bouts[1] === ROUTINE_NEUVE) return { vue: ROUTINE, params: { neuve: true } };
      if (!RE_UUID.test(bouts[1])) return { vue: SAISIE, params: {}, repli: 'id-invalide' };
      return { vue: ROUTINE, params: { id: bouts[1] } };
    }

    if (bouts[0] === EXERCICE && (bouts.length === 2 || bouts.length === 3)) {
      if (!RE_SLUG.test(bouts[1])) return { vue: RACINE, params: {}, repli: 'slug-invalide' };
      // Un sous-onglet inconnu retombe sur le Résumé, pas sur la racine : un lien
      // qui a vieilli reste dans la page qu'il visait (même règle que Progression).
      if (bouts.length === 3 && bouts[2] !== EXO_HISTORIQUE) {
        return { vue: EXERCICE, params: { slug: bouts[1] }, repli: 'sous-vue-inconnue' };
      }
      return { vue: EXERCICE, params: bouts.length === 3
        ? { slug: bouts[1], onglet: EXO_HISTORIQUE } : { slug: bouts[1] } };
    }

    if (bouts[0] === SEANCE && bouts.length === 2) {
      if (!RE_UUID.test(bouts[1])) return { vue: RACINE, params: {}, repli: 'id-invalide' };
      return { vue: SEANCE, params: { id: bouts[1] } };
    }

    return { vue: RACINE, params: {}, repli: 'inconnu' };
  }

  // { vue, params } -> chemin. L'aller-retour avec analyser est idempotent.
  function construire(vue, params) {
    var p = params || {};
    if (vue === SEMAINE) {
      var d = versDate(p.lundi);
      return d ? '/' + SEMAINE + '/' + d : '/';
    }
    if (vue === SEANCE) return p.id && RE_UUID.test(p.id) ? '/' + SEANCE + '/' + p.id : '/';
    if (vue === EXERCICE) {
      if (!p.slug || !RE_SLUG.test(p.slug)) return '/';
      return '/' + EXERCICE + '/' + p.slug +
        (p.onglet === EXO_HISTORIQUE ? '/' + EXO_HISTORIQUE : '');
    }
    if (vue === ROUTINE) {
      if (p.neuve) return '/' + ROUTINE + '/' + ROUTINE_NEUVE;
      return p.id && RE_UUID.test(p.id) ? '/' + ROUTINE + '/' + p.id : '/' + SAISIE;
    }
    if (vue === RELECTURE) {
      var d2 = p.dossier === null || p.dossier === undefined ? '' : String(p.dossier);
      return '/' + SAISIE + '/' + RELECTURE + (d2.trim() ? '/' + encodeURIComponent(d2) : '');
    }
    if (AVEC_MOIS[vue] && p.mois && RE_MOIS.test(p.mois)) return '/' + PROGRESSION + '/' + vue + '/' + p.mois;
    if (SOUS_PROGRESSION[vue]) return '/' + PROGRESSION + '/' + vue;
    if (SOUS_PROFIL[vue]) return '/' + PROFIL + '/' + vue;
    if (SOUS_JEU[vue]) return '/' + JEU + '/' + vue;
    if (SOUS_SOCIAL[vue]) return '/' + JEU + '/' + vue;
    if (vue === AMI) {
      if (!p.pseudo || !RE_PSEUDO.test(p.pseudo)) return '/' + JEU + '/' + FIL;
      var base = '/a/' + encodeURIComponent(p.pseudo);
      if (p.slug && RE_SLUG.test(p.slug)) return base + '/' + EXERCICE + '/' + p.slug;
      return p.comparer ? base + '/' + COMPARER : base;
    }
    if (SEGMENTS[vue]) return '/' + vue;
    return '/';
  }

  // ── Onglets ─────────────────────────────────────────────────────────────
  //
  // Une semaine et le détail d'une séance sont des vues DE l'onglet Séances :
  // elles l'allument, elles n'en ouvrent pas un autre. La connexion n'allume
  // rien — la barre n'y est pas affichée.
  // 64B — Jeu entre Progression et Profil (JEU-V1 §9.2).
  var ONGLETS = [RACINE, SAISIE, PROGRESSION, JEU, PROFIL];

  function ongletDe(vue) {
    if (vue === SEMAINE || vue === SEANCE || vue === EXERCICE) return RACINE;
    if (vue === ROUTINE || vue === RELECTURE) return SAISIE;
    if (SOUS_PROGRESSION[vue]) return PROGRESSION;
    if (SOUS_PROFIL[vue]) return PROFIL;
    if (SOUS_JEU[vue]) return JEU;
    if (SOUS_SOCIAL[vue] || vue === AMI) return JEU;
    for (var i = 0; i < ONGLETS.length; i++) if (ONGLETS[i] === vue) return vue;
    return null;
  }

  // ── Session et vues authentifiées ────────────────────────────────────────
  //
  // Toutes les vues sauf la connexion montrent les données d'un compte. Sans
  // session, elles ne sont pas rendues : on renvoie à la connexion. Ça ne
  // protège rien — le RLS reste seul juge côté serveur — mais afficher des
  // données à quelqu'un qui vient de se déconnecter est un défaut d'interface.
  // L'inscription non plus : c'est l'écran où l'on n'a, par définition, pas
  // encore de compte. La renvoyer à la connexion faute de session serait une
  // boucle — et c'est exactement le défaut qu'une liste blanche évite.
  function exigeSession(vue) { return vue !== CONNEXION && vue !== INSCRIPTION; }

  // L'envers de la précédente : les deux écrans d'entrée n'ont plus de sens une
  // fois la session ouverte. Un rechargement sur /connexion avec un jeton valide
  // doit rendre l'app, pas un formulaire de connexion.
  function interditAvecSession(vue) { return vue === CONNEXION || vue === INSCRIPTION; }

  // Route demandée -> route réellement affichable. `redirigeDepuis` dit d'où
  // l'on vient, pour que l'appelant puisse corriger l'URL.
  function routeAffichable(route, contexte) {
    var ctx = contexte || {};
    var vue = (route && route.vue) || RACINE;
    if (exigeSession(vue) && !ctx.session) {
      return { vue: CONNEXION, params: {}, redirigeDepuis: vue };
    }
    return route && route.vue ? route : { vue: RACINE, params: {} };
  }

  // ── Le point d'accroche des gardes ───────────────────────────────────────
  //
  // Une garde est une fonction qui rend un objet quand elle refuse la sortie
  // (avec de quoi se présenter), ou rien quand elle laisse passer. C'est ce
  // que l'écran de saisie utilisera pour retenir une séance en cours — avec sa
  // propre confirmation, légitime celle-là : elle protège un travail en cours,
  // elle ne prétend pas fermer l'application, ce qu'aucune page ne peut faire.
  //
  // Ce qui a disparu ici : `decisionRetour`. Le retour ne se décide plus par
  // la vue — il est absorbé au fond de la pile et navigue au-dessus — et cette
  // décision-là vit désormais avec l'historique, dans v2/js/sortie.js.
  function premiereGardeBloquante(gardes) {
    var liste = gardes || [];
    for (var i = 0; i < liste.length; i++) {
      if (typeof liste[i] !== 'function') continue;
      var verdict = liste[i]();
      if (verdict) return verdict;
    }
    return null;
  }

  var api = {
    RACINE: RACINE, SEMAINE: SEMAINE, SEANCE: SEANCE, CONNEXION: CONNEXION,
    SAISIE: SAISIE, PROGRESSION: PROGRESSION, PROFIL: PROFIL,
    INSCRIPTION: INSCRIPTION, EXERCICES: EXERCICES, IMPORT: IMPORT,
    ROUTINE: ROUTINE,
    RELECTURE: RELECTURE,
    EXERCICE: EXERCICE,
    EXO_HISTORIQUE: EXO_HISTORIQUE, ROUTINE_NEUVE: ROUTINE_NEUVE,
    VOLUME: VOLUME, POIDS: POIDS, MOIS: MOIS, RECORDS: RECORDS, PARCOURS: PARCOURS,
    SOUS_PROGRESSION: SOUS_PROGRESSION,
    SOUS_PROFIL: SOUS_PROFIL,
    JEU: JEU, MUSCLES: MUSCLES, SUCCES: SUCCES, DEBLOCAGES: DEBLOCAGES, SOUS_JEU: SOUS_JEU,
    // 64B — une vue du jeu (l'onglet ou une sous-vue) : `app.js` la refuse quand le jeu est éteint.
    estVueDuJeu: function (vue) { return vue === JEU || !!SOUS_JEU[vue]; },
    // 87 — les vues sociales : ouvertes jeu allumé ou éteint.
    FIL: FIL, AMIS: AMIS, AMI: AMI, SOUS_SOCIAL: SOUS_SOCIAL,
    estVueSociale: function (vue) { return !!SOUS_SOCIAL[vue] || vue === AMI; },
    versDate: versDate,
    depuisDate: depuisDate,
    analyser: analyser,
    construire: construire,
    ONGLETS: ONGLETS,
    ongletDe: ongletDe,
    exigeSession: exigeSession,
    interditAvecSession: interditAvecSession,
    routeAffichable: routeAffichable,
    premiereGardeBloquante: premiereGardeBloquante
  };

  racine.THRouteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
