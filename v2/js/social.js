// v2/js/social.js — le social, étage 1 (87, SOCIAL-V1) : les règles, sans écran ni réseau.
//
// Module PUR : aucune dépendance au DOM, au réseau, au stockage. Les lectures
// passent par les fonctions de la base (v2_078 : `social_profil`, `social_fil`,
// `social_calendrier`, `social_records_seance`, `social_detail_seance`,
// `social_liens`…) ; elles ne rendent que les colonnes autorisées. Ce module
// dit ce que l'écran en fait : le cercle d'une personne, ce qu'il permet de
// voir, le blason, les teintes du calendrier.
//
// ⚠️ LE SOCIAL NE CALCULE RIEN DU COACH, ET LE COACH NE LIT RIEN DU SOCIAL. Il
// n'est pas dans la liste `GARDEES` ; s'il lit un fait (les médailles d'une
// séance, le détail d'un exercice), il le lit dans `faits.js`.
//
// LES TROIS CERCLES (SOCIAL-V1 §1) :
//   · inconnu — pseudo, blason, niveau du jeu ;
//   · abonné accepté (un sens) — le fil (titre, date, records, tonnage), réagir,
//     le calendrier du profil (jours, résumé au toucher) ;
//   · mutuel — en plus le détail des séances (exercices, séries, charges).
// Jamais : poids de corps, santé, notes, RPE, ressenti, douleur.

(function (racine) {
  'use strict';

  var MOI = 'moi', INCONNU = 'inconnu', DEMANDE = 'demande', SUIVI = 'suivi', MUTUEL = 'mutuel';

  // Ce que la base ne rend JAMAIS à un autre que l'auteur (SOCIAL-V1 §1, « Jamais »).
  var CHAMPS_INTERDITS = ['poids_corps_kg', 'note', 'rpe', 'ressenti', 'douleur'];

  // Le cercle, depuis une ligne de `social_profil` (`je_suis` : `demande`, `accepte` ou null ;
  // `me_suit` : il me suit, accepté).
  function cercleDe(p, moiId) {
    if (!p) return null;
    if (moiId && p.id === moiId) return MOI;
    if (p.je_suis === 'accepte') return p.me_suit ? MUTUEL : SUIVI;
    if (p.je_suis === 'demande') return DEMANDE;
    return INCONNU;
  }
  function voitLeCalendrier(cercle) { return cercle === SUIVI || cercle === MUTUEL; }
  function voitLeDetail(cercle) { return cercle === MUTUEL; }

  // L'état sous le pseudo. Des faits : qui suit qui.
  function etatDe(p, cercle) {
    if (cercle === MUTUEL) return 'Vous vous suivez';
    if (cercle === SUIVI) return 'Tu suis ' + p.pseudo;
    if (cercle === DEMANDE) return 'Demande envoyée';
    if (p && p.me_suit) return p.pseudo + ' te suit';
    return null;
  }

  // Le bouton principal d'un profil : s'abonner, suivre en retour — rien une fois abonné.
  function boutonDe(p, cercle) {
    if (cercle === INCONNU) return p && p.me_suit ? 'Suivre en retour' : 'S’abonner';
    return null;
  }

  // « Inviter dans un groupe » (étage 3) : le bouton seulement, inactif même en mutuel.
  function invitation(cercle) {
    if (cercle === MUTUEL) return { actif: false, sous: 'Bientôt' };
    return { actif: false, sous: 'Abonnez-vous l’un à l’autre pour l’inviter.' };
  }

  // Le niveau et le titre publiés (`jeu_niveau`, `jeu_titre`), nuls si le jeu est éteint chez la personne.
  // `titres` : la table des libellés du jeu (`rendu.js`). Sans niveau, rien.
  function ligneDuJeu(niveau, titre, titres) {
    if (niveau === null || niveau === undefined || !isFinite(Number(niveau))) return null;
    var t = titre && titres && titres[titre] ? ' · ' + titres[titre] : '';
    return 'Niveau ' + Number(niveau) + t;
  }

  // Le blason : le gabarit de la maquette, d'une couleur tirée du pseudo (FNV-1a → teinte).
  function couleurDuBlason(pseudo) {
    var h = 0x811c9dc5, s = String(pseudo || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'hsl(' + (h % 360) + ', 32%, 64%)';
  }

  // Les liens de `social_liens`, rangés.
  function liensRanges(liens) {
    var out = { demandesRecues: [], demandesEnvoyees: [], abonnes: [], abonnements: [], bloques: [] };
    var cles = { demande_recue: 'demandesRecues', demande_envoyee: 'demandesEnvoyees', abonne: 'abonnes',
                 abonnement: 'abonnements', bloque: 'bloques' };
    (liens || []).forEach(function (l) { if (l && cles[l.lien]) out[cles[l.lien]].push(l); });
    Object.keys(out).forEach(function (k) {
      out[k].sort(function (a, b) { return String(a.pseudo).localeCompare(String(b.pseudo)); });
    });
    // « Il te suit » : un abonné que je ne suis pas (ni demandé).
    var suivis = {};
    out.abonnements.concat(out.demandesEnvoyees).forEach(function (l) { suivis[l.user_id] = true; });
    out.aSuivreEnRetour = out.abonnes.filter(function (l) { return !suivis[l.user_id]; });
    return out;
  }

  // Le fil : les séances rendues par `social_fil`, de la plus récente à la plus ancienne. La base filtre
  // déjà (terminées, non privées, 30 jours, personnes suivies) ; ici, l'ordre seulement, et rien d'en cours.
  function filRange(lignes) {
    return (lignes || []).filter(function (l) { return l && l.session_id && l.debut; })
      .slice().sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); });
  }

  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function jourIso(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }

  // Les bornes d'un mois pour `social_calendrier` (au plus 62 jours : un mois en a 31).
  function bornesDuMois(annee, mois) {
    return { de: jourIso(new Date(annee, mois, 1)), a: jourIso(new Date(annee, mois + 1, 0)) };
  }

  // Le calendrier d'un profil : la grille du mois (`calendrier.js`), chaque jour avec ses séances et sa
  // teinte (1 à 3), par tiers du plus gros tonnage d'un jour du mois. Un jour sans séance : 0. Aucun
  // commentaire sur les jours vides.
  function calendrierSocial(annee, mois, seances) {
    var grille = racine.THCalendrier.grilleMois(annee, mois, seances || []);
    if (!grille) return null;
    var parJour = {};
    (seances || []).forEach(function (s) {
      var d = new Date(s.debut);
      if (isNaN(d.getTime())) return;
      var cle = jourIso(d);
      (parJour[cle] = parJour[cle] || []).push(s);
    });
    var max = 0;
    Object.keys(parJour).forEach(function (k) {
      var t = parJour[k].reduce(function (x, s) { return x + (Number(s.tonnage_kg) || 0); }, 0);
      parJour[k].tonnage = t;
      if (t > max) max = t;
    });
    grille.lignes.forEach(function (l) {
      l.jours.forEach(function (j) {
        var cle = jourIso(j.date), ls = j.horsMois ? null : parJour[cle];
        j.cle = cle;
        j.seances = ls ? ls.slice() : [];
        j.teinte = !ls ? 0 : max <= 0 ? 1 : Math.max(1, Math.ceil(3 * ls.tonnage / max));
      });
    });
    return grille;
  }

  // Le détail d'une séance (`social_detail_seance`), regroupé par exercice dans l'ordre des séries.
  function detailParExercice(series) {
    var ordre = [], par = {};
    (series || []).slice().sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); }).forEach(function (s) {
      if (!s || !s.exercise_slug) return;
      if (!par[s.exercise_slug]) { par[s.exercise_slug] = []; ordre.push(s.exercise_slug); }
      par[s.exercise_slug].push(s);
    });
    return ordre.map(function (slug) { return { slug: slug, series: par[slug] }; });
  }

  // Le lien d'invitation : « https://…/a/<pseudo> ».
  function lienInvitation(origine, pseudo) {
    return String(origine || '').replace(/\/+$/, '') + '/a/' + encodeURIComponent(String(pseudo || ''));
  }

  // La garde « aucune donnée interdite » : une réponse qui en porte une (à n'importe quelle profondeur).
  function champsInterditsDans(x) {
    var trouves = [];
    (function voir(v) {
      if (Array.isArray(v)) return v.forEach(voir);
      if (v && typeof v === 'object') {
        Object.keys(v).forEach(function (k) {
          if (CHAMPS_INTERDITS.indexOf(k) >= 0 && trouves.indexOf(k) < 0) trouves.push(k);
          voir(v[k]);
        });
      }
    })(x);
    return trouves;
  }

  var api = {
    MOI: MOI, INCONNU: INCONNU, DEMANDE: DEMANDE, SUIVI: SUIVI, MUTUEL: MUTUEL,
    CHAMPS_INTERDITS: CHAMPS_INTERDITS,
    JOURS_DU_FIL: 30,
    cercleDe: cercleDe,
    voitLeCalendrier: voitLeCalendrier,
    voitLeDetail: voitLeDetail,
    etatDe: etatDe,
    boutonDe: boutonDe,
    invitation: invitation,
    ligneDuJeu: ligneDuJeu,
    couleurDuBlason: couleurDuBlason,
    liensRanges: liensRanges,
    filRange: filRange,
    bornesDuMois: bornesDuMois,
    calendrierSocial: calendrierSocial,
    detailParExercice: detailParExercice,
    lienInvitation: lienInvitation,
    champsInterditsDans: champsInterditsDans
  };

  racine.THSocial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
