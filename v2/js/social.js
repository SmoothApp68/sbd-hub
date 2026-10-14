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

  // ══ ÉTAGE 2 (89, SOCIAL-V1 « Étage 2 », décisions du 14/10/2026) ══════════════════════════════
  //
  // Tout ici est réservé aux MUTUELS (la base le garde : `social_mutuel`). Jamais de vainqueur, de couronne ni de
  // rouge. Le coach et les bilans n'en lisent rien.
  //
  // « UNE SÉRIE COMPTÉE » : une série `travail`, charge > 0, reps > 0 — la règle de `Bilan.volumeKg`, celle des
  // fonctions de la base (v2_078, v2_079). Mes séries viennent de `faits.seriesComptees`, celles d'un ami de la base :
  // les mêmes lignes `{ session_id, debut, exercise_slug, charge_kg, reps }`, lues par les mêmes fonctions ci-dessous.

  // ── LE SCORE DOTS (la seule fonction DOTS de l'app, registre NOTIONS) ──
  //
  // « À poids de corps égal » : la charge × 500 ÷ le polynôme du poids de corps, par sexe (formule DOTS, IPF 2019).
  // Le poids est borné comme la formule le prévoit (40 à 210 kg pour un homme, 40 à 150 pour une femme). Sans sexe
  // précisé ou sans pesée : `null` — on n'apparaît pas. ⚠️ LE POIDS NE QUITTE JAMAIS LE TÉLÉPHONE : seul le score part.
  var DOTS = {
    homme: { c: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076], min: 40, max: 210 },
    femme: { c: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288], min: 40, max: 150 }
  };
  function scoreDots(charge, poids, sexe) {
    var f = DOTS[sexe], c = Number(charge), p = Number(poids);
    if (!f || !(c > 0) || !(p > 0) || !isFinite(c) || !isFinite(p)) return null;
    var x = Math.min(f.max, Math.max(f.min, p));
    var d = f.c[0] * Math.pow(x, 4) + f.c[1] * Math.pow(x, 3) + f.c[2] * x * x + f.c[3] * x + f.c[4];
    if (!(d > 0)) return null;
    return Math.round(c * 500 / d * 100) / 100;
  }

  // Un exercice « à la barre » (seul classé à poids de corps égal) : l'équipement du catalogue.
  function aLaBarre(exo) { return !!exo && exo.equipement === 'barre' && (exo.mesure || 'charge_reps') === 'charge_reps'; }

  // La meilleure charge de chaque exercice, sur des séries comptées.
  function meilleuresCharges(lignes) {
    var out = {};
    (lignes || []).forEach(function (l) {
      var c = Number(l && l.charge_kg);
      if (!l || !l.exercise_slug || !(c > 0) || !(Number(l.reps) > 0)) return;
      if (!out[l.exercise_slug] || c > out[l.exercise_slug]) out[l.exercise_slug] = c;
    });
    return out;
  }

  // Ce que je publie : un score par exercice à la barre, avec sa charge. `null` sans sexe précisé ou sans pesée
  // (on n'apparaît pas : l'app retire alors ses scores). `estALaBarre(slug)` : lu dans le catalogue par l'app.
  function scoresAPublier(charges, poids, sexe, estALaBarre) {
    if (!DOTS[sexe] || !(Number(poids) > 0)) return null;
    return Object.keys(charges || {}).sort().filter(function (slug) { return estALaBarre(slug); }).map(function (slug) {
      return { exercise_slug: slug, score: scoreDots(charges[slug], poids, sexe), charge_kg: charges[slug] };
    }).filter(function (s) { return s.score !== null; });
  }
  // Ce qui a changé depuis la dernière publication (`deja` : `{ slug: { score, charge_kg } }`).
  function scoresChanges(scores, deja) {
    return (scores || []).filter(function (s) {
      var d = deja && deja[s.exercise_slug];
      return !d || d.score !== s.score || d.charge_kg !== s.charge_kg;
    });
  }

  // « Entre amis » : les lignes de `social_scores_force`, triées à poids de corps égal (le score, jamais affiché),
  // avec les vrais kilos. Rien sous deux personnes avec un score (moi compris).
  function classementEntreAmis(lignes) {
    var l = (lignes || []).filter(function (x) { return x && Number(x.score) > 0 && Number(x.charge_kg) > 0; });
    if (l.length < 2) return null;
    return l.slice().sort(function (a, b) {
      return (Number(b.score) - Number(a.score)) || (Number(b.charge_kg) - Number(a.charge_kg)) ||
        String(a.pseudo).localeCompare(String(b.pseudo));
    }).map(function (x, i) { return { rang: i + 1, pseudo: x.pseudo, charge_kg: Number(x.charge_kg), moi: !!x.moi }; });
  }

  // ── « 6 MOIS » : le mois en cours et les 5 d'avant (la même fenêtre que la base) ──
  function debutSixMois(maintenant) {
    var m = maintenant || new Date();
    return new Date(m.getFullYear(), m.getMonth() - 5, 1);
  }
  function cleMois(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1); }

  // La page d'un exercice (d'un ami, ou la mienne pour « Se comparer ») : meilleure charge, meilleure série (le plus
  // gros charge × reps, la plus lourde à égalité), séances, et la meilleure charge de chaque mois. `null` sans série.
  function resumeExercice(lignes, maintenant) {
    var m = maintenant || new Date(), depuis = debutSixMois(m);
    var l = (lignes || []).filter(function (x) {
      var d = new Date(x && x.debut);
      return x && !isNaN(d.getTime()) && d >= depuis && d <= m && Number(x.charge_kg) > 0 && Number(x.reps) > 0;
    });
    if (!l.length) return null;
    var seances = {}, parMois = {}, charge = 0, serie = null;
    l.forEach(function (x) {
      var c = Number(x.charge_kg), r = Number(x.reps), k = cleMois(new Date(x.debut));
      seances[x.session_id] = true;
      if (c > charge) charge = c;
      if (!parMois[k] || c > parMois[k]) parMois[k] = c;
      if (!serie || c * r > serie.charge * serie.reps || (c * r === serie.charge * serie.reps && c > serie.charge)) {
        serie = { charge: c, reps: r };
      }
    });
    var mois = [];
    for (var i = 0; i < 6; i++) {
      var d = new Date(depuis.getFullYear(), depuis.getMonth() + i, 1), k2 = cleMois(d);
      mois.push({ cle: k2, charge: parMois[k2] || null });
    }
    return { meilleureCharge: charge, meilleureSerie: serie, seances: Object.keys(seances).length, mois: mois };
  }

  // ── « SE COMPARER SUR LA PÉRIODE » : ce mois, 3 mois, l'année ──
  var PERIODES = [
    { cle: 'mois', libelle: 'Ce mois' },
    { cle: '3mois', libelle: '3 mois' },
    { cle: 'annee', libelle: 'L’année' }
  ];
  // Les bornes (jours civils, inclus) : du 1er du mois, d'il y a 3 mois, du 1er janvier — à aujourd'hui.
  function bornesDePeriode(cle, maintenant) {
    var m = maintenant || new Date(), de;
    if (cle === 'annee') de = new Date(m.getFullYear(), 0, 1);
    else if (cle === '3mois') de = new Date(m.getFullYear(), m.getMonth() - 3, m.getDate() + 1);
    else de = new Date(m.getFullYear(), m.getMonth(), 1);
    return { de: jourIso(de), a: jourIso(m) };
  }
  // Mes séries comptées → la forme de `social_periode` (total : séances avec au moins une série comptée, séries,
  // reps, tonnage au centième ; par exercice, plus la meilleure charge).
  function periodeDesLignes(lignes) {
    var total = { s: {}, series: 0, reps: 0, t: 0 }, ex = {};
    (lignes || []).forEach(function (x) {
      var c = Number(x.charge_kg), r = Number(x.reps);
      if (!(c > 0) || !(r > 0)) return;
      var e = ex[x.exercise_slug] = ex[x.exercise_slug] || { s: {}, series: 0, reps: 0, t: 0, charge_max: 0 };
      [total, e].forEach(function (o) { o.s[x.session_id] = true; o.series++; o.reps += r; o.t += c * r; });
      if (c > e.charge_max) e.charge_max = c;
    });
    function fin(o) {
      var r = { seances: Object.keys(o.s).length, series: o.series, reps: o.reps, tonnage_kg: Math.round(o.t * 100) / 100 };
      if (o.charge_max !== undefined) r.charge_max = o.charge_max;
      return r;
    }
    var exercices = {};
    Object.keys(ex).forEach(function (k) { exercices[k] = fin(ex[k]); });
    return { total: fin(total), exercices: exercices };
  }
  // Les lignes de `social_periode` → la même forme (la ligne sans exercice est le total).
  function periodeDeLaBase(rows) {
    var out = { total: { seances: 0, series: 0, reps: 0, tonnage_kg: 0 }, exercices: {} };
    (rows || []).forEach(function (r) {
      var v = { seances: Number(r.seances) || 0, series: Number(r.series) || 0, reps: Number(r.reps) || 0,
                tonnage_kg: Number(r.tonnage_kg) || 0 };
      if (r.exercise_slug === null || r.exercise_slug === undefined) out.total = v;
      else { v.charge_max = Number(r.charge_max) || 0; out.exercices[r.exercise_slug] = v; }
    });
    return out;
  }
  // La comparaison : les quatre totaux côte à côte, puis les exercices en commun avec la meilleure charge de chacun.
  // Les exercices à la barre d'abord, et dans chacun les deux personnes « à poids de corps égal » (les scores publiés,
  // `scores[slug] = { moi, lui }`) — le score n'est jamais affiché ; sans les deux scores, toi d'abord.
  function comparaisonPeriode(moi, lui, options) {
    var o = options || {}, estALaBarre = o.estALaBarre || function () { return false; }, scores = o.scores || {};
    var communs = Object.keys(moi.exercices).filter(function (k) { return lui.exercices[k]; }).map(function (slug) {
      var barre = !!estALaBarre(slug), s = scores[slug] || {};
      var luiDevant = barre && Number(s.moi) > 0 && Number(s.lui) > 0 && Number(s.lui) > Number(s.moi);
      return { slug: slug, barre: barre, moi: moi.exercices[slug].charge_max, lui: lui.exercices[slug].charge_max,
               ordre: luiDevant ? ['lui', 'moi'] : ['moi', 'lui'] };
    });
    var nom = o.nomDe || function (s) { return s; };
    communs.sort(function (a, b) { return (b.barre - a.barre) || String(nom(a.slug)).localeCompare(String(nom(b.slug))); });
    return { totaux: { moi: moi.total, lui: lui.total }, communs: communs };
  }

  // ══ LA GUILDE (90, SOCIAL-V1 « Guilde », décisions du 14/10/2026) ═══════════════════════════════════════════
  //
  // Une guilde permanente, jusqu'à 30 membres, une par personne ; on n'invite qu'un de SES abonnés mutuels. Pas de chef
  // affiché ; des rangs sans aucun pouvoir ; un défi coopératif à la fois, jamais sur la charge ni le tonnage ; pas de
  // messagerie, des réactions seulement. La base garde chacune de ces règles (v2_080) : ici, ce que l'écran en montre.
  // Le coach et les bilans ne lisent rien de la guilde.
  var MEMBRES_MAX = 30;
  var RANGS = ['Squatteur', 'Bencheur', 'Terreur', 'Pousseur', 'Tireur', 'Chargeur', 'Gymbro', 'Motiveur', 'Novice'];
  var RANG_PAR_DEFAUT = 'Novice';
  // Les défis SÛRS — et eux seuls : la base refuse tout autre type (`guilde_defis_type`).
  var DEFIS = [
    { cle: 'seances', libelle: 'Chacun fait ses séances prévues', choix: null },
    { cle: 'records', libelle: 'Des records sans dépasser la charge proposée', choix: [2, 3, 5, 8, 10] },
    { cle: 'variete', libelle: 'Des exercices différents, à tous', choix: [5, 8, 10, 12, 15] }
  ];
  var COULEURS_GUILDE = ['#b39ad1', '#8fb08a', '#6fa3d8', '#d9b45a', '#d98f6f', '#7fc4c0', '#c98fb4', '#a3a9b3'];

  function defiDe(cle) { return DEFIS.filter(function (d) { return d.cle === cle; })[0] || null; }
  // Un défi qu'on peut choisir : un type de la liste ; un nombre pour les records et la variété (1 à 100), aucun pour
  // les séances.
  function defiValide(type, n) {
    var d = defiDe(type);
    if (!d) return false;
    if (!d.choix) return n === null || n === undefined;
    return Number.isInteger(n) && n >= 1 && n <= 100;
  }
  // LE DÉFI EST FIGÉ une fois la semaine lancée : modifiable tant qu'aucun membre n'a terminé de séance cette semaine
  // (`defi_modifiable` de `guilde_semaine`, la règle de la base).
  function defiModifiable(s) { return !!s && s.defi_modifiable === true; }
  // 92 — ce que l'administrateur lit quand le choix lui est retiré.
  var PHRASE_DEFI_FIGE = 'Défi figé : la semaine a commencé. Tu en choisiras un lundi.';
  // Le nom : 3 à 24 caractères (espaces de bord retirés). Rend le nom propre, ou null.
  function nomDeGuilde(nom) {
    var n = String(nom === null || nom === undefined ? '' : nom).trim();
    return n.length >= 3 && n.length <= 24 ? n : null;
  }
  function rangValide(r) { return RANGS.indexOf(r) >= 0; }

  // Qui je peux inviter : mes abonnés MUTUELS (je le suis, il me suit), pas déjà membres de ma guilde.
  function invitables(liens, membres) {
    var r = liens && liens.abonnes ? liens : liensRanges(liens || []);
    var abonnes = {}, dedans = {};
    r.abonnes.forEach(function (l) { abonnes[l.user_id] = true; });
    (membres || []).forEach(function (m) { if (m) dedans[m.user_id] = true; });
    return r.abonnements.filter(function (l) { return abonnes[l.user_id] && !dedans[l.user_id]; })
      .sort(function (a, b) { return String(a.pseudo).localeCompare(String(b.pseudo)); });
  }

  // « jordan · Squatteur · Forgeron » — le titre du jeu seulement s'il est publié (nul jeu éteint).
  function ligneMembre(m, titres) {
    var t = m && m.titre && titres && titres[m.titre] ? ' · ' + titres[m.titre] : '';
    return String(m.pseudo) + ' · ' + (rangValide(m.rang) ? m.rang : RANG_PAR_DEFAUT) + t;
  }

  var NOMBRES = ['', '', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
  function aVous(n) { return n <= 1 ? '' : ', à vous ' + (NOMBRES[n] || String(n)); }

  // La jauge commune du défi, depuis une ligne de `guilde_semaine`. `membres` : combien ils sont.
  function jaugeDuDefi(s, membres) {
    if (!s) return null;
    var d = defiDe(s.defi) || DEFIS[0], fait, cible, phrase;
    if (d.cle === 'seances') {
      fait = Number(s.seances_faites) || 0; cible = Number(s.seances_prevues) || 0;
      phrase = fait + ' séance' + (fait > 1 ? 's' : '') + ' sur ' + cible + ' prévue' + (cible > 1 ? 's' : '') + aVous(membres);
    } else if (d.cle === 'records') {
      fait = Number(s.records_semaine) || 0; cible = Number(s.n) || 0;
      phrase = fait + ' record' + (fait > 1 ? 's' : '') + ' sur ' + cible + aVous(membres);
    } else {
      fait = Number(s.exercices) || 0; cible = Number(s.n) || 0;
      phrase = fait + ' exercice' + (fait > 1 ? 's' : '') + ' différent' + (fait > 1 ? 's' : '') + ' sur ' + cible + aVous(membres);
    }
    var titre = d.cle === 'seances' ? d.libelle : d.cle === 'records'
      ? cible + ' record' + (cible > 1 ? 's' : '') + ' sans dépasser la charge proposée'
      : cible + ' exercices différents, à tous';
    return { cle: d.cle, titre: titre, fait: fait, cible: cible, part: cible > 0 ? Math.min(1, fait / cible) : 0, phrase: phrase };
  }
  // « encore 4 jours » jusqu'au dimanche ; le dimanche, « dernier jour ».
  function joursRestants(maintenant) {
    var j = (7 - (maintenant || new Date()).getDay()) % 7;
    return j === 0 ? 'dernier jour' : 'encore ' + j + ' jour' + (j > 1 ? 's' : '');
  }

  // La progression du mois (`guilde_progression`) : la part des exercices avec au moins un record sans dépasser la
  // charge proposée. Un score, sans vainqueur ni rouge ; sans exercice compté, en bas, sans score.
  function progressionRangee(lignes) {
    var part = function (x) { return x.exercices > 0 ? x.exercices_record / x.exercices : -1; };
    return (lignes || []).filter(Boolean).map(function (x) {
      return { pseudo: x.pseudo, moi: !!x.moi, exercices: Number(x.exercices) || 0, exercices_record: Number(x.exercices_record) || 0 };
    }).sort(function (a, b) {
      return (part(b) - part(a)) || (b.exercices - a.exercices) || String(a.pseudo).localeCompare(String(b.pseudo));
    }).map(function (x, i) {
      return { rang: i + 1, pseudo: x.pseudo, moi: x.moi, texte: x.exercices > 0 ? x.exercices_record + ' sur ' + x.exercices : '—' };
    });
  }

  // Ce que je publie (`guilde_scores`) — seulement ce qui a changé depuis la dernière publication.
  var COLONNES_GUILDE = ['semaine', 'seances', 'prevues', 'records_semaine', 'mois', 'exercices', 'exercices_record'];
  function scoresGuildeChanges(s, deja) {
    if (!s) return false;
    return !deja || COLONNES_GUILDE.some(function (k) { return s[k] !== deja[k]; });
  }

  // ══ LE GROUPE DE SÉANCE (91, SOCIAL-V1 « Groupe », décisions du 14/10/2026) ═══════════════════════════════════
  //
  // Éphémère, le temps d'une séance : 2 à 6 personnes, abonnés mutuels seulement, un groupe à la fois. Chacun garde SA
  // séance ; le direct et les messages sont réservés aux membres ; le récap du « combat » compte tout ce que chacun a
  // fait dans sa séance, sans classement ni vainqueur. La base garde chacune de ces règles (v2_082) : ici, ce que
  // l'écran en montre. Le coach et les bilans ne lisent rien du groupe ; le plan de séance n'est jamais modifié par lui.
  var GROUPE_MAX = 6;
  var MESSAGE_MAX = 140;
  var MESSAGES_RAPIDES = ['On y va ?', 'Je commence', 'Dernière série !'];
  var EMOJIS_GROUPE = ['🔥', '💪'];
  var RAFRAICHIR_GROUPE_MS = 20000;       // le direct se relit environ toutes les 20 s (pas de temps réel)
  var ACTIF_MS = 3 * 60 * 1000;           // point vert : une série validée il y a moins de 3 min
  var LIGNES_DU_DIRECT = 2;               // la carte garde sa hauteur : les 2 dernières séries, « Tout voir » pour le reste

  // Un message : 1 à 140 caractères (espaces de bord retirés). Rend le texte propre, ou null.
  function messageValide(texte) {
    var t = String(texte === null || texte === undefined ? '' : texte).trim();
    var n = Array.from(t).length;
    return n >= 1 && n <= MESSAGE_MAX ? t : null;
  }

  var instantDe = function (iso) { var t = Date.parse(iso); return isNaN(t) ? null : t; };

  // « TERMINÉ » : une séance terminée, ou plus VIVANTE — la règle de la séance vivante (`Seance.estVivante`, 45 min sans
  // série validée), réutilisée telle quelle. Une séance pas encore arrivée en base vaut « commencée à l'entrée ».
  function membreTermine(m, maintenantIso) {
    if (!m) return true;
    if (m.statut === 'terminee') return true;
    var ligne = { statut: 'en_cours', debut: m.statut === 'en_cours' ? m.debut : m.entre_le };
    return !racine.THSeance.estVivante(ligne, m.derniere ? [{ validee_a: m.derniere }] : [], maintenantIso);
  }
  // Le récap du « combat » s'ouvre quand TOUTES les séances du groupe sont terminées.
  function groupeFini(membres, maintenantIso) {
    return !!(membres && membres.length) && membres.every(function (m) { return membreTermine(m, maintenantIso); });
  }
  // Ceux qui s'entraînent encore (les autres que moi).
  function encoreEnSeance(membres, maintenantIso) {
    return (membres || []).filter(function (m) { return !m.moi && !membreTermine(m, maintenantIso); })
      .map(function (m) { return m.pseudo; });
  }

  // « à l'instant », « il y a 3 min », « il y a 1 h ».
  function ilYA(iso, maintenantIso) {
    var t = instantDe(iso), m = instantDe(maintenantIso);
    if (t === null || m === null) return '';
    var min = Math.floor(Math.max(0, m - t) / 60000);
    if (min < 1) return 'à l’instant';
    if (min < 60) return 'il y a ' + min + ' min';
    return 'il y a ' + Math.floor(min / 60) + ' h';
  }

  // Les pastilles : une par membre (les autres, puis moi), point vert si une série validée il y a moins de 3 min.
  // `maDerniere` : ma dernière série validée, lue sur l'appareil (la base peut l'attendre).
  function pastillesDuGroupe(membres, maintenantIso, maDerniere) {
    var m = instantDe(maintenantIso);
    var actif = function (iso) { var t = instantDe(iso); return t !== null && m !== null && m - t < ACTIF_MS; };
    var autres = (membres || []).filter(function (x) { return !x.moi; });
    var moi = (membres || []).filter(function (x) { return x.moi; })[0];
    var out = autres.map(function (x) {
      return { pseudo: x.pseudo, initiale: String(x.pseudo || '?').charAt(0).toUpperCase(), couleur: couleurDuBlason(x.pseudo),
               actif: actif(x.derniere), moi: false };
    });
    if (moi) {
      out.push({ pseudo: moi.pseudo, initiale: String(moi.pseudo || '?').charAt(0).toUpperCase(), couleur: '#d9b45a',
                 actif: actif(maDerniere || moi.derniere), moi: true });
    }
    return out;
  }

  // Les lignes du direct : « jordan · Squat (Barre) 180 kg × 3 » et « il y a 1 min », les plus récentes d'abord.
  // `nomDe(slug)` et `mesure(serie)` : lus par l'app (le catalogue, `Modele.formatMesure`).
  function lignesDuDirect(direct, maintenantIso, nomDe, mesure) {
    return (direct || []).filter(function (d) { return d && d.validee_a; }).slice()
      .sort(function (a, b) { return String(b.validee_a).localeCompare(String(a.validee_a)); })
      .map(function (d) {
        return { pseudo: d.pseudo, texte: d.pseudo + ' · ' + (nomDe ? nomDe(d.exercise_slug) : d.exercise_slug) + ' ' + (mesure ? mesure(d) : ''),
                 quand: ilYA(d.validee_a, maintenantIso) };
      });
  }

  // « Suivre la séance de X » : les exercices que X a ajoutés DEPUIS que j'ai rejoint (la copie), sans ceux déjà
  // proposés (ajoutés ou refusés). Dans l'ordre de sa séance.
  function exercicesAjoutes(copie, actuels, vus) {
    var deja = {};
    (copie || []).concat(vus || []).forEach(function (s) { deja[s] = true; });
    var out = [];
    (actuels || []).forEach(function (s) { if (s && !deja[s] && out.indexOf(s) < 0) out.push(s); });
    return out;
  }

  // Qui je peux inviter dans le groupe : mes abonnés MUTUELS, pas déjà membres ; `envoyees` : les invitations en attente.
  function invitablesDuGroupe(liens, membres, envoyees) {
    var attente = {};
    (envoyees || []).forEach(function (e) { if (e) attente[e.user_id] = true; });
    return invitables(liens, membres).map(function (l) {
      return { user_id: l.user_id, pseudo: l.pseudo, invite: !!attente[l.user_id] };
    });
  }

  // Le récap du « combat » : le score collectif (tonnage, séries, records ; XP si publiée) et la part de chacun EN FAITS,
  // dans l'ordre d'arrivée — sans classement ni vainqueur.
  function recapDuGroupe(membres) {
    var l = (membres || []).filter(Boolean).map(function (x) {
      return { pseudo: x.pseudo, moi: !!x.moi, tonnage_kg: Number(x.tonnage_kg) || 0, series: Number(x.series) || 0,
               records: Number(x.records) || 0, xp: x.xp === null || x.xp === undefined ? null : Number(x.xp) };
    });
    var avecXp = l.filter(function (x) { return x.xp !== null; });
    return {
      membres: l,
      tonnage_kg: Math.round(l.reduce(function (t, x) { return t + x.tonnage_kg; }, 0) * 100) / 100,
      series: l.reduce(function (t, x) { return t + x.series; }, 0),
      records: l.reduce(function (t, x) { return t + x.records; }, 0),
      xp: avecXp.length ? avecXp.reduce(function (t, x) { return t + x.xp; }, 0) : null
    };
  }
  // « Faite en groupe avec jordan, lea » — les autres, dans l'ordre d'arrivée.
  function faiteEnGroupeAvec(membres) {
    var autres = (membres || []).filter(function (x) { return x && !x.moi; }).map(function (x) { return x.pseudo; });
    return autres.length ? 'Faite en groupe avec ' + autres.join(', ') : null;
  }
  // « 14,2 t · 41 séries · 2 records » — `tonnes(kg)` : `Bilan.tonnesDuRecap`.
  function partDe(x, tonnes) {
    return tonnes(x.tonnage_kg) + ' · ' + x.series + ' série' + (x.series > 1 ? 's' : '') + ' · ' +
      x.records + ' record' + (x.records > 1 ? 's' : '');
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
    champsInterditsDans: champsInterditsDans,
    // 89 — étage 2
    PERIODES: PERIODES,
    scoreDots: scoreDots,
    aLaBarre: aLaBarre,
    meilleuresCharges: meilleuresCharges,
    scoresAPublier: scoresAPublier,
    scoresChanges: scoresChanges,
    classementEntreAmis: classementEntreAmis,
    debutSixMois: debutSixMois,
    resumeExercice: resumeExercice,
    bornesDePeriode: bornesDePeriode,
    periodeDesLignes: periodeDesLignes,
    periodeDeLaBase: periodeDeLaBase,
    comparaisonPeriode: comparaisonPeriode,
    // 90 — la guilde
    MEMBRES_MAX: MEMBRES_MAX,
    RANGS: RANGS,
    RANG_PAR_DEFAUT: RANG_PAR_DEFAUT,
    DEFIS: DEFIS,
    COULEURS_GUILDE: COULEURS_GUILDE,
    COLONNES_GUILDE: COLONNES_GUILDE,
    defiDe: defiDe,
    defiValide: defiValide,
    defiModifiable: defiModifiable,
    PHRASE_DEFI_FIGE: PHRASE_DEFI_FIGE,
    nomDeGuilde: nomDeGuilde,
    rangValide: rangValide,
    invitables: invitables,
    ligneMembre: ligneMembre,
    jaugeDuDefi: jaugeDuDefi,
    joursRestants: joursRestants,
    progressionRangee: progressionRangee,
    scoresGuildeChanges: scoresGuildeChanges,
    // 91 — le groupe de séance
    GROUPE_MAX: GROUPE_MAX,
    MESSAGE_MAX: MESSAGE_MAX,
    MESSAGES_RAPIDES: MESSAGES_RAPIDES,
    EMOJIS_GROUPE: EMOJIS_GROUPE,
    RAFRAICHIR_GROUPE_MS: RAFRAICHIR_GROUPE_MS,
    ACTIF_MS: ACTIF_MS,
    LIGNES_DU_DIRECT: LIGNES_DU_DIRECT,
    messageValide: messageValide,
    membreTermine: membreTermine,
    groupeFini: groupeFini,
    encoreEnSeance: encoreEnSeance,
    ilYA: ilYA,
    pastillesDuGroupe: pastillesDuGroupe,
    lignesDuDirect: lignesDuDirect,
    exercicesAjoutes: exercicesAjoutes,
    invitablesDuGroupe: invitablesDuGroupe,
    recapDuGroupe: recapDuGroupe,
    faiteEnGroupeAvec: faiteEnGroupeAvec,
    partDe: partDe
  };

  racine.THSocial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
