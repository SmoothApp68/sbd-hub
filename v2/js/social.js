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

  // 121 (audit du 16/10/2026, 05 #10) — PLUS DE « Inviter dans un groupe » SUR LE PROFIL. Le bouton de l'étage 1
  // (inactif, « Bientôt ») annonçait l'étage 3 ; le groupe se lance depuis la séance en cours (« S'entraîner
  // ensemble », SOCIAL §7.1) et la guilde invite depuis ses Membres (§6.2). Il restait figé à « Bientôt », et disait
  // sur MON profil qu'il fallait m'abonner à moi-même.

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
  // précisé ou sans pesée : `null` — on n'apparaît pas. ⚠️ LE POIDS NE QUITTE JAMAIS LE TÉLÉPHONE : seul le score part,
  // calculé sur le poids FLOUTÉ (`poidsFloute`, ci-dessous), jamais sur la pesée.
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

  // ── LE POIDS FLOUTÉ (audit du 16/10/2026, prompt 114) ──
  //
  // Un score DOTS exact, à côté d'une charge que le mutuel voit dans mes séances, redonne mon poids au centième
  // (`polynôme(poids) = charge × 500 ÷ score`). Décision d'Aurélien : « aucun mutuel ne peut déduire le poids de corps
  // à mieux que ±5 kg ». Le score se calcule donc sur un poids ROND : la pesée plus un DÉCALAGE SECRET (tiré une fois
  // sur l'appareil, entre −5 et +5 kg, jamais publié), arrondie à la dizaine. Le mutuel peut retrouver ce poids rond
  // (90, 100…) ; il n'en tire que « la pesée est à moins de 10 kg de 90 ». Le décalage étant secret, il ne sait pas
  // non plus où passent les bornes : voir le poids rond changer ne lui dit pas « elle vient de passer 95 kg » — la
  // borne franchie est quelque part dans une dizaine qu'il ne connaît pas. Une borne fixe (95, 105…) le lui dirait.
  // Le prix : à moins de 10 kg d'écart, l'ordre « à poids de corps égal » est approché (égalité, ou l'inverse).
  var PAS_DU_FLOU = 10;
  function decalageValide(d) {
    if (d === null || d === undefined || d === '' || typeof d === 'boolean') return false;
    var x = Number(d);
    return isFinite(x) && x >= -PAS_DU_FLOU / 2 && x < PAS_DU_FLOU / 2;
  }
  // Un tirage uniforme dans [0, 1) → le décalage, dans [−5, +5).
  function decalageDepuis(u) {
    var x = Number(u);
    if (!isFinite(x) || x < 0 || x >= 1) return null;
    return x * PAS_DU_FLOU - PAS_DU_FLOU / 2;
  }
  // La pesée + le décalage, arrondie à la dizaine : le seul poids qui entre dans un score publié. `null` sans pesée ou
  // sans décalage valide (on ne publie pas).
  function poidsFloute(poids, decalage) {
    var p = Number(poids);
    if (poids === null || poids === undefined || !(p > 0) || !isFinite(p) || !decalageValide(decalage)) return null;
    var r = PAS_DU_FLOU * Math.floor((p + Number(decalage)) / PAS_DU_FLOU + 0.5);
    return r > 0 ? r : null;
  }

  // Ce que je publie : un score par exercice à la barre, calculé sur le poids flouté — ni le poids, ni la charge
  // (v2_091 : la base refuse la charge). `null` sans sexe précisé, sans pesée ou sans décalage (on n'apparaît pas :
  // l'app retire alors ses scores). `estALaBarre(slug)` : lu dans le catalogue par l'app.
  function scoresAPublier(charges, poids, sexe, estALaBarre, decalage) {
    if (!DOTS[sexe] || !(Number(poids) > 0)) return null;
    var rond = poidsFloute(poids, decalage);
    if (rond === null) return null;
    return Object.keys(charges || {}).sort().filter(function (slug) { return estALaBarre(slug); }).map(function (slug) {
      return { exercise_slug: slug, score: scoreDots(charges[slug], rond, sexe) };
    }).filter(function (s) { return s.score !== null; });
  }
  // Ce qui a changé depuis la dernière publication (`deja` : `{ slug: { score } }`).
  function scoresChanges(scores, deja) {
    return (scores || []).filter(function (s) {
      var d = deja && deja[s.exercise_slug];
      return !d || d.score !== s.score;
    });
  }

  // ── « 12 MOIS » (audit du 16/10/2026, prompt 114) : la meilleure charge du score DOTS et des kilos d'« Entre amis »
  // — la même fenêtre que `social_meilleures_charges` (v2_091) : du lendemain du même jour il y a un an, à aujourd'hui
  // (jours civils, inclus). Pas la meilleure charge de toute une vie, à côté d'une pesée d'aujourd'hui.
  function bornesDouzeMois(maintenant) {
    var m = maintenant || new Date();
    return { de: jourIso(new Date(m.getFullYear() - 1, m.getMonth(), m.getDate() + 1)), a: jourIso(m) };
  }

  // « Entre amis » : les lignes de `social_scores_force` (le score, jamais affiché ; plus aucune charge depuis v2_091),
  // triées à poids de corps égal, avec les vrais kilos — ceux de mes mutuels lus dans leurs séances visibles
  // (`social_meilleures_charges`, 12 mois : `chargesDesAutres`, ses lignes `{ user_id, charge_max }`), le mien sur
  // l'appareil (`maCharge`, la même fenêtre). `chargesDesAutres` nul (la fonction n'existe pas encore, avant v2_091) :
  // rien. Une personne sans kilos à montrer n'entre pas. Rien sous deux personnes (moi compris).
  function classementEntreAmis(lignes, chargesDesAutres, maCharge) {
    if (!Array.isArray(chargesDesAutres)) return null;
    var charges = {};
    chargesDesAutres.forEach(function (c) { if (c && c.user_id) charges[c.user_id] = Number(c.charge_max); });
    var l = (lignes || []).filter(function (x) { return x && Number(x.score) > 0; }).map(function (x) {
      return { pseudo: x.pseudo, score: Number(x.score), moi: !!x.moi, charge_kg: x.moi ? Number(maCharge) : charges[x.user_id] };
    }).filter(function (x) { return x.charge_kg > 0; });
    if (l.length < 2) return null;
    return l.sort(function (a, b) {
      return (b.score - a.score) || (b.charge_kg - a.charge_kg) || String(a.pseudo).localeCompare(String(b.pseudo));
    }).map(function (x, i) { return { rang: i + 1, pseudo: x.pseudo, charge_kg: x.charge_kg, moi: x.moi }; });
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
  // 120 (D3, décision du 16/10/2026, audit 06 #9) — LE DÉFI PAR DÉFAUT devient « les séries de travail de la guilde
  // dans la semaine, objectif = sa moyenne des 4 dernières semaines » (au lieu de « séances sur prévues », qui mesure
  // l'assiduité). Le premier de la liste : celui qui part seul sans choix (la base le dit aussi, `guilde_semaine`,
  // v2_093). Avant v2_093, la base rend encore « seances » par défaut : l'écran affiche ce qu'elle dit.
  var DEFIS = [
    { cle: 'series', libelle: 'Vos séries de travail, autant que vos 4 dernières semaines', choix: null },
    { cle: 'seances', libelle: 'Chacun fait ses séances prévues', choix: null },
    { cle: 'records', libelle: 'Des records sans dépasser la charge proposée', choix: [2, 3, 5, 8, 10] },
    { cle: 'variete', libelle: 'Des exercices différents, à tous', choix: [5, 8, 10, 12, 15] }
  ];
  var COULEURS_GUILDE = ['#b39ad1', '#8fb08a', '#6fa3d8', '#d9b45a', '#d98f6f', '#7fc4c0', '#c98fb4', '#a3a9b3'];

  function defiDe(cle) { return DEFIS.filter(function (d) { return d.cle === cle; })[0] || null; }
  // Un défi qu'on peut choisir : un type de la liste ; un nombre pour les records et la variété (1 à 100), aucun pour
  // les séances ni les séries (leur objectif se calcule : les prévues, la moyenne des 4 semaines).
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
  // ⚠️ 121 (audit du 16/10/2026, 05 #6) — UN MEMBRE BLOQUÉ (par moi, ou qui m'a bloqué) : la base ne rend ni son pseudo,
  // ni son rang, ni son titre (`guilde_liste_membres`, v2_094). L'écran dit « un membre », sans lien vers un profil.
  var MEMBRE_ANONYME = 'un membre';
  function ligneMembre(m, titres) {
    if (!m || !m.pseudo) return MEMBRE_ANONYME;
    var t = m && m.titre && titres && titres[m.titre] ? ' · ' + titres[m.titre] : '';
    return String(m.pseudo) + ' · ' + (rangValide(m.rang) ? m.rang : RANG_PAR_DEFAUT) + t;
  }
  // ⚠️ 121 (D5, décision d'Aurélien du 16/10/2026) — « Voir la séance » d'une séance du fil de la guilde : seulement si je
  // suis abonné (accepté) à son auteur — sinon son profil ne montre pas ses séances (« Abonne-toi pour voir ses
  // séances. »), et un compte privé ne se voit pas du tout hors de ses abonnés (`guilde_fil`, v2_094).
  function suisAbonne(liens, userId) {
    return !!(liens && userId && (liens.abonnements || []).some(function (l) { return l && l.user_id === userId; }));
  }

  var NOMBRES = ['', '', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
  function aVous(n) { return n <= 1 ? '' : ', à vous ' + (NOMBRES[n] || String(n)); }

  // 137 (audit du 16/10, 05 #15 ; SOCIAL §6.2, D10) — UN SEUL NOMBRE DE RECORDS POUR LA SEMAINE DE LA GUILDE : la
  // colonne `records_semaine` de `guilde_semaine` (les séries médaillées sans dépasser la charge proposée), celle de la
  // jauge du défi ET de la carte « La guilde cette semaine ». `medailles` (toutes les séries médaillées) n'est plus lu.
  function recordsDeLaSemaine(s) { return Number(s && s.records_semaine) || 0; }

  // La jauge commune du défi, depuis une ligne de `guilde_semaine`. `membres` : combien ils sont.
  function jaugeDuDefi(s, membres) {
    if (!s) return null;
    var d = defiDe(s.defi) || DEFIS[0], fait, cible, phrase;
    if (d.cle === 'series') {
      // La cible : la somme des moyennes publiées (`series_cible`). Sans historique (personne n'a de semaine d'avant),
      // pas de cible : le compte seul, la jauge vide — on ne fixe pas un objectif inventé.
      fait = Number(s.series_faites) || 0; cible = Number(s.series_cible) || 0;
      phrase = fait + ' série' + (fait > 1 ? 's' : '') + ' de travail' + (cible > 0 ? ' sur ' + cible : '') + aVous(membres);
    } else if (d.cle === 'seances') {
      fait = Number(s.seances_faites) || 0; cible = Number(s.seances_prevues) || 0;
      phrase = fait + ' séance' + (fait > 1 ? 's' : '') + ' sur ' + cible + ' prévue' + (cible > 1 ? 's' : '') + aVous(membres);
    } else if (d.cle === 'records') {
      fait = recordsDeLaSemaine(s); cible = Number(s.n) || 0;
      phrase = fait + ' record' + (fait > 1 ? 's' : '') + ' sur ' + cible + aVous(membres);
    } else {
      fait = Number(s.exercices) || 0; cible = Number(s.n) || 0;
      phrase = fait + ' exercice' + (fait > 1 ? 's' : '') + ' différent' + (fait > 1 ? 's' : '') + ' sur ' + cible + aVous(membres);
    }
    var titre = d.cle === 'series'
      ? (cible > 0 ? cible + ' séries de travail, votre moyenne' : 'Vos séries de travail de la semaine')
      : d.cle === 'seances' ? d.libelle : d.cle === 'records'
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
  // 120 (D3, v2_093) — `series_semaine`, `series_moyenne` : le défi des séries de travail.
  // 124 (audit du 16/10/2026, 06 #16) — LES COLONNES DE `guilde_scores`, UNE FOIS : la publication (`donnees.js`,
  // `publierScoresGuilde`) et la détection de changement les lisent ici. Les facultatives : celles de v2_093.
  var COLONNES_GUILDE_FACULTATIVES = ['series_semaine', 'series_moyenne'];
  var COLONNES_GUILDE = ['semaine', 'seances', 'prevues', 'records_semaine', 'mois', 'exercices', 'exercices_record']
    .concat(COLONNES_GUILDE_FACULTATIVES);
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
  // 106 — LIBRE POUR UN AUTRE GROUPE (décision d'Aurélien du 15/10/2026) : chacun peut lancer ou rejoindre un autre
  // groupe dès que SA séance est finie, sans attendre les autres. Sans place dans un groupe : libre. Ma séance du groupe
  // est celle que j'ai en cours (`seanceId`) : pas libre — même immobile, j'y suis. Une AUTRE séance en cours : celle du
  // groupe est finie (une seule séance à la fois). Sans séance en cours : la règle de la séance vivante (`membreTermine`).
  // La base garde la même règle (`groupe_liberer`, v2_087) : l'app ne fait que la montrer.
  function libreDuGroupe(membres, seanceId, maintenantIso) {
    var moi = (membres || []).filter(function (m) { return m && m.moi; })[0];
    if (!moi) return true;
    if (seanceId) return moi.session_id !== seanceId;
    return membreTermine(moi, maintenantIso);
  }
  // 177 (28/10/2026, décision d'Aurélien) — SEUL DANS MON GROUPE : personne d'autre n'y est encore en séance. La base laisse
  // alors partir (`groupe_liberer`, v2_114) même séance en cours : une invitation reçue se voit et se rejoint. Avec un autre
  // membre actif, le refus `groupe_deja_dans_un` reste. Sans place dans un groupe : pas « seul dans mon groupe ».
  function seulDansMonGroupe(membres, maintenantIso) {
    var l = membres || [];
    if (!l.some(function (m) { return m && m.moi; })) return false;
    return !l.some(function (m) { return m && !m.moi && !membreTermine(m, maintenantIso); });
  }
  // 106 — LES MESSAGES GARDÉS HORS LIGNE (décision d'Aurélien du 15/10/2026) : une entrée par message — son identifiant
  // (fabriqué par l'app : renvoyé, il ne se double pas), le groupe où il a été écrit (il ne part jamais dans un autre),
  // le texte. Relue du cache au démarrage : seulement des entrées complètes ; un cache abîmé ne casse rien.
  //
  // 136 (audit du 16/10/2026, 06 #14) — LA MÊME FILE PORTE LES DEUX GESTES DE FIN DU GROUPE (`geste`) : mon XP de fin
  // de séance (`publier`, ses exercices et son XP, nul jeu éteint) et mon départ à l'abandon (`quitter`). Ils partaient
  // une fois, sans retour : hors ligne, l'XP manquait au récap du groupe, et le départ n'arrivait jamais. Ils
  // attendent désormais ici, comme un message — gardés sur l'appareil, relus au démarrage, comptés par « Quitter ».
  var GESTES_DU_GROUPE = ['publier', 'quitter'];
  function gesteDuGroupeValide(m) {
    if (GESTES_DU_GROUPE.indexOf(m.geste) < 0) return false;
    if (m.geste === 'quitter') return true;
    var exOk = m.exercices === null || (Array.isArray(m.exercices) && m.exercices.every(function (x) { return typeof x === 'string' && !!x; }));
    var xpOk = m.xp === null || (typeof m.xp === 'number' && isFinite(m.xp) && m.xp >= 0 && Math.round(m.xp) === m.xp);
    return exOk && xpOk;
  }
  function fileDeMessages(valeur) {
    return (Array.isArray(valeur) ? valeur : []).filter(function (m) {
      if (!m || typeof m.id !== 'string' || !m.id || typeof m.groupe_id !== 'string' || !m.groupe_id) return false;
      if (m.geste !== undefined) return gesteDuGroupeValide(m);
      return messageValide(m.texte) === m.texte;
    });
  }
  // 121 (05 #12) — les traces « Faite en groupe avec … » gardées sur l'appareil : `{ <séance> : { recap: { membres }, le } }`.
  // Un cache abîmé ne casse rien : seules les entrées bien formées restent (une liste de membres, chacun un objet).
  function tracesDuGroupe(valeur) {
    var out = {};
    if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return out;
    Object.keys(valeur).forEach(function (k) {
      var t = valeur[k];
      var membres = t && t.recap && t.recap.membres;
      if (!k || !Array.isArray(membres) || !membres.every(function (m) { return !!m && typeof m === 'object'; })) return;
      out[k] = { recap: { membres: membres }, le: typeof t.le === 'string' ? t.le : null };
    });
    return out;
  }
  // « 1 message partira au retour du réseau. » — ceux de CE groupe seulement.
  function texteEnAttente(file, groupeId) {
    // 136 — les messages seulement : un geste de fin (l'XP, le départ) n'est pas un message qu'on a écrit.
    var n = (file || []).filter(function (m) { return m && m.groupe_id === groupeId && m.geste === undefined; }).length;
    if (!n) return null;
    return (n > 1 ? n + ' messages partiront' : '1 message partira') + ' au retour du réseau.';
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
  // 144-4 — le direct montre TOUT, avec une étiquette : un ami ne lit plus « 60 kg × 5 » sans savoir si c'est une
  // chauffe. Aucun calcul : le `type_serie` que `groupe_direct` rend déjà. Le travail n'a pas d'étiquette. Le récap de
  // fin, lui, ne compte que le travail (inchangé).
  var ETIQUETTES_DU_DIRECT = { echauffement: 'Chauffe', degressive: 'Dégressive', echec: 'manquée' };

  function lignesDuDirect(direct, maintenantIso, nomDe, mesure) {
    return (direct || []).filter(function (d) { return d && d.validee_a; }).slice()
      .sort(function (a, b) { return String(b.validee_a).localeCompare(String(a.validee_a)); })
      .map(function (d) {
        return { pseudo: d.pseudo, texte: d.pseudo + ' · ' + (nomDe ? nomDe(d.exercise_slug) : d.exercise_slug) + ' ' + (mesure ? mesure(d) : ''),
                 etiquette: (racine.THModele && d.type_serie === 'echec' ? racine.THModele.motDEchec(d) : null) || ETIQUETTES_DU_DIRECT[d.type_serie] || null,
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
  // ⚠️ 118 (D7, décision d'Aurélien du 16/10/2026 : « Faite en groupe avec un ancien membre », chiffres gardés) — un
  // compte supprimé sort des récaps figés des autres par son pseudo (v2_092 : `pseudo` vide, `ancien`), ses chiffres
  // restent : il se dit « un ancien membre ».
  var ANCIEN_MEMBRE = 'un ancien membre';
  function pseudoDuRecap(x) { return x && typeof x.pseudo === 'string' && x.pseudo ? x.pseudo : ANCIEN_MEMBRE; }
  function recapDuGroupe(membres) {
    var l = (membres || []).filter(Boolean).map(function (x) {
      return { pseudo: pseudoDuRecap(x), moi: !!x.moi, tonnage_kg: Number(x.tonnage_kg) || 0, series: Number(x.series) || 0,
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
  // 118 (D7) — les anciens membres, après les pseudos : « Faite en groupe avec jordan, un ancien membre » ;
  // « 2 anciens membres » s'ils sont plusieurs.
  function faiteEnGroupeAvec(membres) {
    var noms = [], anciens = 0;
    (membres || []).filter(function (x) { return x && !x.moi; }).forEach(function (x) {
      if (typeof x.pseudo === 'string' && x.pseudo) noms.push(x.pseudo); else anciens++;
    });
    if (anciens) noms.push(anciens > 1 ? anciens + ' anciens membres' : ANCIEN_MEMBRE);
    return noms.length ? 'Faite en groupe avec ' + noms.join(', ') : null;
  }
  // « 14,2 t · 41 séries · 2 records » — `tonnes(kg)` : `Bilan.tonnesDuRecap`.
  function partDe(x, tonnes) {
    return tonnes(x.tonnage_kg) + ' · ' + x.series + ' série' + (x.series > 1 ? 's' : '') + ' · ' +
      x.records + ' record' + (x.records > 1 ? 's' : '');
  }

  // ══ 182 — LE RÉCAP DE GROUPE RACONTE LA SÉANCE (maquette « Proposé » du 28/10/2026) ═══════════════════════════════
  //
  // Chaque membre du récap porte `detail` (v2_115) : `{ debut, fin, exercices: [{ slug, series, charge_kg, reps, duree_s,
  // distance_m }] dans l'ordre de sa séance (la meilleure série : la plus lourde, puis le plus de reps), records: [{ slug,
  // type, valeur, reps, charge, unite }] }`. Un récap figé AVANT v2_115 n'en a pas : `recapDetaille` rend alors `null`,
  // l'écran garde l'ancien affichage (`recapDuGroupe`), sans rien inventer.
  //
  // ⚠️ AUCUN CLASSEMENT. L'ordre des exercices est celui de MA séance (puis ceux que je n'ai pas faits, dans l'ordre
  // d'arrivée des autres) ; sur chaque exercice, « toi » d'abord, puis les autres dans l'ordre d'arrivée. Jamais d'ordre,
  // de gras ni de couleur selon « le plus fort ». Un exercice qu'un membre n'a pas fait n'a pas de ligne pour lui.
  // Une seule phrase du coach, un fait : « les N mêmes exercices », ou « N exercices en commun », sinon rien.
  function detailDuMembre(x) {
    var d = x && x.detail;
    return d && typeof d === 'object' && Array.isArray(d.exercices) ? d : null;
  }
  function slugsDuMembre(d) {
    var out = [];
    d.exercices.forEach(function (e) { if (e && e.slug && out.indexOf(e.slug) < 0) out.push(e.slug); });
    return out;
  }
  // Les exercices des membres : l'ordre de MA séance, puis les autres (dans l'ordre d'arrivée). `membres` : au moins un
  // détail. Rend `[{ slug, parts: [{ index, moi, serie }] }]` — `parts` : « toi » d'abord, puis les autres dans l'ordre.
  function exercicesDuGroupe(membres) {
    var ordreDesMembres = membres.map(function (m, i) { return i; })
      .sort(function (a, b) { return (membres[b].moi ? 1 : 0) - (membres[a].moi ? 1 : 0) || a - b; });
    var slugs = [];
    ordreDesMembres.forEach(function (i) {
      slugsDuMembre(detailDuMembre(membres[i])).forEach(function (s) { if (slugs.indexOf(s) < 0) slugs.push(s); });
    });
    return slugs.map(function (slug) {
      var parts = [];
      ordreDesMembres.forEach(function (i) {
        var e = detailDuMembre(membres[i]).exercices.filter(function (x) { return x && x.slug === slug; })[0];
        if (e) parts.push({ index: i, moi: !!membres[i].moi, serie: e });
      });
      return { slug: slug, parts: parts };
    });
  }
  // La phrase du coach : « Vous avez fait les 6 mêmes exercices. » (tous ont le même ensemble), sinon « 2 exercices en
  // commun. » (au moins un), sinon rien. Un fait, jamais un « bravo » ni une comparaison.
  function phraseDesExercicesCommuns(ensembles) {
    if (ensembles.length < 2) return null;
    var communs = ensembles[0].filter(function (s) {
      return ensembles.every(function (e) { return e.indexOf(s) >= 0; });
    });
    var memes = ensembles.every(function (e) { return e.length === communs.length; });
    if (!communs.length) return null;
    if (memes) return communs.length === 1 ? 'Vous avez fait le même exercice.' : 'Vous avez fait les ' + communs.length + ' mêmes exercices.';
    return communs.length + ' exercice' + (communs.length > 1 ? 's' : '') + ' en commun.';
  }
  // Le temps où au moins DEUX séances se recouvrent, en secondes (balayage des débuts et des fins). Une séance sans
  // début ou sans fin lisible ne compte pas. `0` : pas de recouvrement.
  function secondesEnsemble(plages) {
    var evts = [];
    plages.forEach(function (p) {
      var d = Date.parse(p.debut), f = Date.parse(p.fin);
      if (isNaN(d) || isNaN(f) || f <= d) return;
      evts.push([d, 1]); evts.push([f, -1]);
    });
    evts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var actifs = 0, depuis = 0, total = 0;
    evts.forEach(function (e) {
      if (actifs >= 2) total += e[0] - depuis;
      actifs += e[1];
      depuis = e[0];
    });
    return Math.round(total / 1000);
  }
  // `outils` (lus par l'app, qui garde le catalogue et les formateurs) : `nomDe(slug)`, `mesure(serie)` (le formateur de
  // l'app : « 135 kg × 2 »), `record(r)` → `{ nom, phrase }` (la phrase de la médaille), `tonnes(kg)`, `duree(s)`,
  // `nombre(n)`, `jour(iso)`, `heure(iso)`.
  function recapDetaille(membres, outils) {
    var l = (membres || []).filter(Boolean);
    if (l.length < 2 || !l.every(detailDuMembre)) return null;
    var o = outils || {};
    var base = recapDuGroupe(l);
    var nom = function (m) { return m.moi ? 'toi' : pseudoDuRecap(m); };
    var debuts = l.map(function (m) { return detailDuMembre(m).debut; }).filter(function (x) { return !isNaN(Date.parse(x)); });
    var fins = l.map(function (m) { return detailDuMembre(m).fin; }).filter(function (x) { return !isNaN(Date.parse(x)); });
    var debut = debuts.length ? debuts.reduce(function (a, b) { return Date.parse(b) < Date.parse(a) ? b : a; }) : null;
    var fin = fins.length ? fins.reduce(function (a, b) { return Date.parse(b) > Date.parse(a) ? b : a; }) : null;
    var autres = l.filter(function (m) { return !m.moi; }).map(pseudoDuRecap);
    var exercices = exercicesDuGroupe(l);
    var ensemble = secondesEnsemble(l.map(function (m) { var d = detailDuMembre(m); return { debut: d.debut, fin: d.fin }; }));
    var tuiles = [
      { cle: 'volume', valeur: o.tonnes(base.tonnage_kg), libelle: 'volume' },
      { cle: 'series', valeur: String(base.series), libelle: 'séries' },
      { cle: 'exercices', valeur: String(exercices.length), libelle: 'exercices' }
    ];
    if (ensemble >= 60) tuiles.push({ cle: 'ensemble', valeur: o.duree(Math.round(ensemble / 60) * 60), libelle: 'ensemble' });
    var records = [];
    l.forEach(function (m) {
      detailDuMembre(m).records && detailDuMembre(m).records.forEach(function (r) {
        var dit = r ? o.record(r) : null;
        if (dit && dit.phrase) records.push({ pseudo: nom(m), moi: !!m.moi, texte: dit.nom + ' \u00b7 ' + dit.phrase });
      });
    });
    return {
      titre: 'Séance en groupe',
      qui: ['avec ' + autres.join(', '), debut ? o.jour(debut) : null,
            debut ? o.heure(debut) + (fin ? ' \u2013 ' + o.heure(fin) : '') : null].filter(Boolean).join(' \u00b7 '),
      tuiles: tuiles,
      phrase: phraseDesExercicesCommuns(l.map(function (m) { return slugsDuMembre(detailDuMembre(m)); })),
      exercices: exercices.map(function (e) {
        return { slug: e.slug, nom: o.nomDe(e.slug), lignes: e.parts.map(function (p) {
          return { pseudo: p.moi ? 'toi' : pseudoDuRecap(l[p.index]), moi: p.moi,
                   texte: o.mesure(p.serie) + ' \u00b7 ' + p.serie.series + ' série' + (Number(p.serie.series) > 1 ? 's' : '') };
        }) };
      }),
      records: records,
      chacun: base.membres.map(function (m) {
        return { pseudo: m.moi ? 'toi' : m.pseudo, moi: m.moi,
                 texte: o.tonnes(m.tonnage_kg) + ' \u00b7 ' + m.series + ' série' + (m.series > 1 ? 's' : ''),
                 xp: m.xp === null ? null : '+' + o.nombre(m.xp) + ' XP' };
      })
    };
  }

  // ══ 107 — UN GESTE SOCIAL FAIT HORS LIGNE N'EST PLUS PERDU (SOCIAL-V1 §8, décision d'Aurélien du 15/10/2026) ══════
  //
  // « Un geste social fait hors ligne est gardé sur le téléphone et part au retour du réseau, comme les séances ; il
  // n'est jamais perdu en silence. Si la base le refuse au retour (le compte est devenu privé, un blocage entre-temps…),
  // l'app le dit en une phrase. »
  //
  // Un geste = UNE ENTRÉE DE LA FILE (`attente.js`, table `social`), dans l'ordre où les gestes ont été faits.
  // `donnees` dit le geste du point de vue de celui qui le fait : `{ geste, moi, autre, pseudo, … }`.
  //
  // ⚠️ UN GESTE QUI ANNULE LE PRÉCÉDENT N'ENVOIE QUE L'ÉTAT FINAL (`cleDuGeste`). Les gestes qui fixent un ÉTAT — mon
  // abonnement à lea, son abonnement à moi, ma réaction à une séance, mon rang, le défi, le nom de la guilde — portent
  // une clé STABLE : le suivant remplace le précédent, en fin de file. S'abonner puis se désabonner hors ligne
  // n'envoie que le retrait (idempotent : rien à retirer, rien ne change). Les autres (bloquer, qui efface les liens ;
  // créer, inviter, répondre, retirer, transmettre, partir) ont chacun leur entrée.
  //
  // ⚠️ L'ÉCRAN = CE QUE LA BASE A RENDU + LES GESTES QUI N'Y SONT PAS ENCORE. Les fonctions `…AvecGestes` posent
  // chaque geste sur une lecture : elles fixent un ÉTAT (« abonné », « a réagi »), jamais une bascule — un geste déjà
  // dans la lecture, reposé, ne change rien.
  var GESTES = {
    SABONNER: 'sabonner', RETIRER_ABONNEMENT: 'retirer_abonnement', RETIRER_ABONNE: 'retirer_abonne', ACCEPTER: 'accepter',
    BLOQUER: 'bloquer', DEBLOQUER: 'debloquer', REAGIR: 'reagir', RETIRER_REACTION: 'retirer_reaction', GUILDE: 'guilde',
    // 121 (audit du 16/10/2026, 05 #5) — mes nombres de guilde, publiés PAR LA FILE (fin de séance, démarrage) : un état,
    // le dernier calcul gagne ; la vidange ne les écrit que si je suis membre (`guilde_moi`). Pas un geste de l'écran :
    // ni « en attente du réseau », ni phrase de refus.
    SCORES_GUILDE: 'scores_guilde'
  };
  // Les gestes de guilde qui écrivent : les seules fonctions de la base qu'une entrée de la file peut appeler.
  var GESTES_DE_GUILDE = ['guilde_creer', 'guilde_modifier', 'guilde_inviter', 'guilde_repondre', 'guilde_quitter',
    'guilde_retirer_membre', 'guilde_transmettre', 'guilde_choisir_defi', 'guilde_choisir_rang'];
  var EN_ATTENTE = 'en attente du réseau';

  // La clé d'un geste dans la file : la même pour deux gestes sur le même état (le dernier gagne, en fin de file), `null`
  // pour un geste qui a son entrée à lui (un identifiant neuf). La personne se désigne par son pseudo — la recherche
  // ne rend que lui —, sinon par son identifiant.
  function cleDuGeste(d) {
    if (!d || !d.moi) return null;
    var qui = d.pseudo || d.autre || '';
    switch (d.geste) {
      case GESTES.SABONNER: case GESTES.RETIRER_ABONNEMENT: return 'abonnement|' + d.moi + '|' + qui;
      case GESTES.ACCEPTER: case GESTES.RETIRER_ABONNE: return 'abonne|' + d.moi + '|' + qui;
      case GESTES.REAGIR: case GESTES.RETIRER_REACTION: return 'reaction|' + d.moi + '|' + d.session;
      case GESTES.SCORES_GUILDE: return 'scores_guilde|' + d.moi;
      case GESTES.GUILDE:
        if (d.fn === 'guilde_choisir_rang' || d.fn === 'guilde_choisir_defi' || d.fn === 'guilde_modifier') return d.fn + '|' + d.moi;
        return null;
      default: return null;
    }
  }

  function gesteValide(d) {
    if (!d || !d.moi) return false;
    var connu = Object.keys(GESTES).some(function (k) { return GESTES[k] === d.geste; });
    if (!connu) return false;
    if (d.geste === GESTES.GUILDE) return GESTES_DE_GUILDE.indexOf(d.fn) >= 0;
    if (d.geste === GESTES.SCORES_GUILDE) {
      return !!d.scores && typeof d.scores === 'object' && COLONNES_GUILDE.every(function (k) { return d.scores[k] !== undefined; });
    }
    if (d.geste === GESTES.REAGIR || d.geste === GESTES.RETIRER_REACTION) return !!d.session;
    if (d.geste === GESTES.SABONNER) return !!(d.autre || d.pseudo);
    return !!d.autre;
  }
  // Ce geste vise-t-il cette personne ? Par l'identifiant ; sans identifiant (un abonnement depuis la recherche, qui ne
  // rend que le pseudo), par le pseudo.
  function vise(d, id, pseudo) {
    if (d.autre && id) return d.autre === id;
    return !!d.pseudo && d.pseudo === pseudo;
  }
  function avec(o, champs) { return Object.assign({}, o, champs); }

  // Les lignes de `social_liens` (avant `liensRanges`).
  function liensAvecGestes(lignes, gestes) {
    var out = (lignes || []).slice();
    (gestes || []).forEach(function (d) {
      if (!d) return;
      var lui = function (l) { return vise(d, l.user_id, l.pseudo); };
      var sans = function (liens) { out = out.filter(function (l) { return !(lui(l) && liens.indexOf(l.lien) >= 0); }); };
      var ajouter = function (lien) {
        out.push({ user_id: d.autre || null, pseudo: d.pseudo, niveau: d.niveau === undefined ? null : d.niveau, lien: lien });
      };
      if (d.geste === GESTES.SABONNER) {
        // Un compte public accepte d'office ; privé (ou inconnu), c'est une demande.
        sans(['abonnement', 'demande_envoyee']);
        ajouter(d.prive === false ? 'abonnement' : 'demande_envoyee');
      } else if (d.geste === GESTES.RETIRER_ABONNEMENT) sans(['abonnement', 'demande_envoyee']);
      else if (d.geste === GESTES.RETIRER_ABONNE) sans(['abonne', 'demande_recue']);
      else if (d.geste === GESTES.ACCEPTER) {
        out = out.map(function (l) { return lui(l) && l.lien === 'demande_recue' ? avec(l, { lien: 'abonne' }) : l; });
      } else if (d.geste === GESTES.BLOQUER) {
        out = out.filter(function (l) { return !lui(l); });
        ajouter('bloque');
      } else if (d.geste === GESTES.DEBLOQUER) sans(['bloque']);
    });
    return out;
  }

  // Une ligne de `social_profil`. Bloquée, elle n'est plus visible (la base ne la rendrait plus) : `null`.
  function profilAvecGestes(p, gestes) {
    var out = p || null;
    (gestes || []).forEach(function (d) {
      if (!out || !d || !vise(d, out.id, out.pseudo)) return;
      if (d.geste === GESTES.SABONNER) out = avec(out, { je_suis: out.compte_prive === false ? 'accepte' : 'demande' });
      else if (d.geste === GESTES.RETIRER_ABONNEMENT) out = avec(out, { je_suis: null });
      else if (d.geste === GESTES.RETIRER_ABONNE) out = avec(out, { me_suit: false });
      else if (d.geste === GESTES.ACCEPTER) out = avec(out, { me_suit: true });
      else if (d.geste === GESTES.BLOQUER) out = null;
    });
    return out;
  }

  // Les lignes d'un fil (`social_fil`, `guilde_fil`). `options.guilde` : le fil de la guilde ne dépend pas des
  // abonnements (seul le blocage en retire quelqu'un).
  function filAvecGestes(lignes, gestes, options) {
    var guilde = !!(options && options.guilde);
    var out = (lignes || []).slice();
    (gestes || []).forEach(function (d) {
      if (!d) return;
      if (d.geste === GESTES.REAGIR || d.geste === GESTES.RETIRER_REACTION) {
        out = out.map(function (l) {
          return l.session_id === d.session ? avec(l, { j_ai_reagi: d.geste === GESTES.REAGIR }) : l;
        });
      } else if (d.geste === GESTES.BLOQUER || (!guilde && d.geste === GESTES.RETIRER_ABONNEMENT)) {
        out = out.filter(function (l) { return !vise(d, l.user_id, l.pseudo); });
      }
    });
    return out;
  }

  // Ce que l'écran de la guilde a lu : `{ g, membres, semaine, invitations, fil }` (`g` : `guilde_moi`). Rend la même
  // forme, et `invites` : les personnes dont l'invitation est partie (ou attend le réseau).
  function guildeAvecGestes(e, gestes, moiId) {
    var x = e || {};
    var o = { g: x.g || null, membres: (x.membres || []).slice(), semaine: x.semaine || null,
              invitations: (x.invitations || []).slice(), fil: x.fil ? filAvecGestes(x.fil, gestes, { guilde: true }) : (x.fil || null),
              progression: x.progression || [], invites: {} };
    var moi = function (d) {
      return { user_id: moiId, pseudo: d.monPseudo || '', rang: RANG_PAR_DEFAUT, titre: null, moi: true };
    };
    (gestes || []).forEach(function (d) {
      // 121 (05 #6) — bloquer quelqu'un : il devient « un membre » dans la liste, et sort de la Progression (comme la
      // base le rendra à la relecture, v2_094) ; le fil l'a déjà retiré (`filAvecGestes`).
      if (d && d.geste === GESTES.BLOQUER) {
        o.membres = o.membres.map(function (m) {
          return vise(d, m.user_id, m.pseudo) && !m.moi ? avec(m, { pseudo: null, rang: null, titre: null }) : m;
        });
        o.progression = (o.progression || []).filter(function (x) { return x.moi || !d.pseudo || x.pseudo !== d.pseudo; });
        return;
      }
      if (!d || d.geste !== GESTES.GUILDE) return;
      var a = d.args || {};
      if (d.fn === 'guilde_creer') {
        if (o.g) return;
        o.g = { nom: a.p_nom, couleur: a.p_couleur, blason: 'bouclier', admin: true, membres: 1 };
        o.membres = [moi(d)]; o.semaine = null; o.invitations = []; o.fil = []; o.progression = [];
      } else if (d.fn === 'guilde_modifier') {
        if (o.g) o.g = avec(o.g, { nom: a.p_nom, couleur: a.p_couleur });
      } else if (d.fn === 'guilde_inviter') {
        o.invites[a.p_user] = true;
      } else if (d.fn === 'guilde_repondre') {
        if (!a.p_rejoindre) { o.invitations = o.invitations.filter(function (i) { return i.guilde_id !== a.p_guilde; }); return; }
        if (!o.g) {
          o.g = { nom: d.nom, couleur: d.couleur, blason: 'bouclier', admin: false, membres: (Number(d.membres) || 0) + 1 };
          o.membres = [moi(d)]; o.semaine = null; o.fil = []; o.progression = [];
        }
        o.invitations = [];
      } else if (d.fn === 'guilde_quitter') {
        o.g = null; o.membres = []; o.semaine = null; o.fil = null; o.progression = [];
      } else if (d.fn === 'guilde_retirer_membre') {
        var avant = o.membres.length;
        o.membres = o.membres.filter(function (m) { return m.user_id !== a.p_user; });
        if (o.g && o.membres.length < avant) o.g = avec(o.g, { membres: Math.max(1, (Number(o.g.membres) || 1) - 1) });
      } else if (d.fn === 'guilde_transmettre') {
        if (o.g) o.g = avec(o.g, { admin: false });
      } else if (d.fn === 'guilde_choisir_defi') {
        if (o.semaine) o.semaine = avec(o.semaine, { defi: a.p_type, n: a.p_n === undefined ? null : a.p_n });
      } else if (d.fn === 'guilde_choisir_rang') {
        o.membres = o.membres.map(function (m) { return m.moi ? avec(m, { rang: a.p_rang }) : m; });
      }
    });
    return o;
  }

  // ── Au retour du réseau : ce que devient un envoi qui échoue ──
  //
  // `reessayer` : le réseau (aucun code), une connexion, un jeton expiré — l'entrée reste, la vidange s'arrête comme
  // pour une séance. `fait` : la base dit que c'est DÉJÀ ainsi — un abonnement, un blocage ou une réaction déjà là
  // (`23505`), une invitation déjà refusée ; et, quand l'envoi est REJOUÉ (un essai précédent a pu passer sans que la
  // réponse revienne), ce que le premier envoi a déjà fait. `refus` : tout autre refus de la base — l'entrée quitte la
  // file, l'écran le dit en une phrase et revient à l'état réel. Jamais un refus ne bloque la file.
  var CODES_PASSAGERS = /^(08|53|57|PGRST0|PGRST3)/;
  function erreurPassagere(e) {
    var c = String((e && e.code) || '');
    return !c || CODES_PASSAGERS.test(c) || c === '40001' || c === '40P01';
  }
  // 121 (05 #3) — `guilde_inviter` : rejouée après que l'invité a rejoint, l'invitation dit « déjà membre » ; c'est fait.
  var DEJA_FAIT_AU_REJEU = {
    guilde_creer: /guilde_deja_dans_une|guilde_membres_pkey/,
    guilde_inviter: /guilde_deja_membre/,
    guilde_repondre: /guilde_sans_invitation|guilde_deja_dans_une|guilde_membres_pkey/,
    guilde_retirer_membre: /guilde_pas_admin/,
    guilde_transmettre: /guilde_pas_admin/
  };
  function issueDuGeste(d, erreur, rejoue) {
    if (erreurPassagere(erreur)) return 'reessayer';
    var code = String(erreur.code), texte = String(erreur.message || '') + ' ' + String(erreur.details || '');
    var g = d && d.geste;
    if (code === '23505' && (g === GESTES.SABONNER || g === GESTES.BLOQUER || g === GESTES.REAGIR)) return 'fait';
    if (g === GESTES.GUILDE) {
      var a = d.args || {};
      if (d.fn === 'guilde_repondre' && !a.p_rejoindre && /guilde_sans_invitation/.test(texte)) return 'fait';
      if (rejoue && DEJA_FAIT_AU_REJEU[d.fn] && DEJA_FAIT_AU_REJEU[d.fn].test(texte)) return 'fait';
    }
    return 'refus';
  }

  // La phrase d'un refus de guilde, avec les mots de la base ; `null` si elle n'en a pas.
  function phraseDeGuilde(e) {
    var m = String((e && (e.message || e.details)) || '');
    if (/guildes_nom_cle_uniq/.test(m)) return 'Ce nom est déjà pris.';
    if (/guildes_nom_longueur/.test(m)) return 'Le nom fait de 3 à 24 caractères.';
    if (/guilde_pleine/.test(m)) return 'La guilde est complète : 30 membres.';
    if (/guilde_invite_non_mutuel/.test(m)) return 'On n’invite qu’un abonné mutuel.';
    if (/guilde_deja_dans_une|guilde_membres_pkey/.test(m)) return 'Tu es déjà dans une guilde.';
    if (/guilde_defi_fige/.test(m)) return PHRASE_DEFI_FIGE;
    return null;
  }
  function libelleDuGeste(d) {
    var p = (d && d.pseudo) || '', a = (d && d.args) || {};
    switch (d && d.geste) {
      case GESTES.SABONNER: return 'S’abonner à ' + p;
      case GESTES.RETIRER_ABONNEMENT: return 'Retirer l’abonnement à ' + p;
      case GESTES.RETIRER_ABONNE: return (d.refuser ? 'Refuser ' : 'Retirer l’abonné ') + p;
      case GESTES.ACCEPTER: return 'Accepter ' + p;
      case GESTES.BLOQUER: return 'Bloquer ' + p;
      case GESTES.DEBLOQUER: return 'Débloquer ' + p;
      case GESTES.REAGIR: return 'Réagir à la séance de ' + p;
      case GESTES.RETIRER_REACTION: return 'Retirer ta réaction';
      case GESTES.GUILDE:
        if (d.fn === 'guilde_creer') return 'Créer la guilde ' + (a.p_nom || '');
        if (d.fn === 'guilde_modifier') return 'Modifier la guilde';
        if (d.fn === 'guilde_inviter') return 'Inviter ' + p;
        if (d.fn === 'guilde_repondre') return (a.p_rejoindre ? 'Rejoindre ' : 'Refuser l’invitation de ') + (d.nom || 'la guilde');
        if (d.fn === 'guilde_quitter') return 'Quitter la guilde';
        if (d.fn === 'guilde_retirer_membre') return 'Retirer ' + p;
        if (d.fn === 'guilde_transmettre') return 'Transmettre à ' + p;
        if (d.fn === 'guilde_choisir_defi') return 'Choisir le défi';
        if (d.fn === 'guilde_choisir_rang') return 'Choisir le rang ' + (a.p_rang || '');
        return 'Ce geste de guilde';
      default: return 'Ce geste';
    }
  }
  // Une phrase, un fait : ce qui n'a pas pu se faire.
  function phraseDuRefus(d, erreur) {
    if (d && d.geste === GESTES.GUILDE) { var m = phraseDeGuilde(erreur); if (m) return m; }
    return '« ' + libelleDuGeste(d).trim() + ' » n’a pas pu se faire.';
  }

  // « Le compte est devenu privé » (la décision du 15/10/2026) : un abonnement fait hors ligne à un compte PUBLIC (l'écran
  // a dit « tu le suis ») que la base a reçu en DEMANDE, parce que le compte est passé en privé entre-temps. Ce n'est
  // pas un refus de la base, mais l'écran avait dit autre chose : une phrase. `gestes` : les abonnements confirmés ;
  // `lignes` : `social_liens` relu APRÈS eux. `null` si rien n'a changé.
  function phraseDevenuPrive(gestes, lignes) {
    var demandes = {};
    (lignes || []).forEach(function (l) { if (l && l.lien === 'demande_envoyee') { demandes[l.user_id] = true; demandes['@' + l.pseudo] = true; } });
    var d = (gestes || []).filter(function (x) {
      return x && x.geste === GESTES.SABONNER && x.prive === false && ((x.autre && demandes[x.autre]) || demandes['@' + x.pseudo]);
    })[0];
    return d ? 'Le compte de ' + d.pseudo + ' est devenu privé : ta demande attend son accord.' : null;
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
    PAS_DU_FLOU: PAS_DU_FLOU,
    decalageValide: decalageValide,
    decalageDepuis: decalageDepuis,
    poidsFloute: poidsFloute,
    aLaBarre: aLaBarre,
    meilleuresCharges: meilleuresCharges,
    scoresAPublier: scoresAPublier,
    scoresChanges: scoresChanges,
    bornesDouzeMois: bornesDouzeMois,
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
    COLONNES_GUILDE_FACULTATIVES: COLONNES_GUILDE_FACULTATIVES,
    defiDe: defiDe,
    defiValide: defiValide,
    defiModifiable: defiModifiable,
    PHRASE_DEFI_FIGE: PHRASE_DEFI_FIGE,
    nomDeGuilde: nomDeGuilde,
    rangValide: rangValide,
    invitables: invitables,
    ligneMembre: ligneMembre,
    MEMBRE_ANONYME: MEMBRE_ANONYME,
    suisAbonne: suisAbonne,
    jaugeDuDefi: jaugeDuDefi, recordsDeLaSemaine: recordsDeLaSemaine,
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
    // 106 — la fin du groupe, et les messages gardés hors ligne
    libreDuGroupe: libreDuGroupe,
    seulDansMonGroupe: seulDansMonGroupe,
    fileDeMessages: fileDeMessages,
    GESTES_DU_GROUPE: GESTES_DU_GROUPE,
    tracesDuGroupe: tracesDuGroupe,
    texteEnAttente: texteEnAttente,
    encoreEnSeance: encoreEnSeance,
    ilYA: ilYA,
    pastillesDuGroupe: pastillesDuGroupe,
    lignesDuDirect: lignesDuDirect,
    ETIQUETTES_DU_DIRECT: ETIQUETTES_DU_DIRECT,
    exercicesAjoutes: exercicesAjoutes,
    invitablesDuGroupe: invitablesDuGroupe,
    recapDuGroupe: recapDuGroupe,
    faiteEnGroupeAvec: faiteEnGroupeAvec,
    partDe: partDe,
    recapDetaille: recapDetaille,
    exercicesDuGroupe: exercicesDuGroupe,
    secondesEnsemble: secondesEnsemble,
    phraseDesExercicesCommuns: phraseDesExercicesCommuns,
    // 107 — les gestes hors ligne
    GESTES: GESTES,
    GESTES_DE_GUILDE: GESTES_DE_GUILDE,
    EN_ATTENTE: EN_ATTENTE,
    gesteValide: gesteValide,
    cleDuGeste: cleDuGeste,
    liensAvecGestes: liensAvecGestes,
    profilAvecGestes: profilAvecGestes,
    filAvecGestes: filAvecGestes,
    guildeAvecGestes: guildeAvecGestes,
    erreurPassagere: erreurPassagere,
    issueDuGeste: issueDuGeste,
    phraseDeGuilde: phraseDeGuilde,
    libelleDuGeste: libelleDuGeste,
    phraseDuRefus: phraseDuRefus,
    phraseDevenuPrive: phraseDevenuPrive
  };

  racine.THSocial = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
