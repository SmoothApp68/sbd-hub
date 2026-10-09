// v2/js/jeu.js — le jeu V1 (JEU-V1.md) : la série de semaines et ses gels,
// les sept muscles, l'XP et le niveau global, les succès, les titres, les
// cadres, le plus proche.
//
// ⚠️ UN SEUL FIL, SANS BOUCLE (JEU-V1 §1). Les faits (`faits.js`,
// `faitsDuJeu`) nourrissent le coach ET le jeu ; le jeu ne lit jamais le
// coach (ni plan, ni consigne, ni pari) et le coach ne lit jamais le jeu. La
// garde d'architecture le prouve à la lecture du source.
//
// ⚠️ LE JEU NE CALCULE PAS DE NOUVEAU FAIT (§1.2). La série de travail, la
// sortie, le volume d'un exercice, la zone d'un muscle, le lundi d'une séance
// ont chacun leur définition (`modele.js`, `semaine.js`) : ce module les
// APPELLE, il ne les recopie pas.
//
// Tout se recalcule depuis l'historique ; rien n'est stocké — les gels non
// plus, leur règle est une fonction pure des semaines.
//
// Pur : ni horloge (le jour arrive dans `entree.aujourdhui`), ni DOM, ni
// réseau, ni stockage. La référence est `tests/unit/fixtures/jeu_ref.py` ; ses
// tolérances sont reprises à l'identique (`+ 1e-9` dans les arrondis par
// défaut, arrondi à 6 décimales des points et des parts faites).

(function (racine) {
  'use strict';

  // ── Les constantes de la spec, nommées une fois ─────────────────────────

  // §3 — l'ordre du jeu. Ni celui de `Semaine.ZONES`, ni celui du radar : il
  // fait l'ordre des `muscle-*` dans les succès, celui de `prochains` et le
  // départage du plus proche. Les six premiers sont les clés des zones.
  var ORDRE_DES_MUSCLES = ['poitrine', 'dos', 'epaules', 'bras', 'jambes', 'tronc', 'cardio'];
  var CARDIO = 'cardio';
  var SECONDES_PAR_MINUTE = 60;
  var POINT_PRINCIPAL = 1, POINT_SECONDAIRE = 0.5;

  // §3 — le niveau n d'un muscle coûte 3 n² points, plafond 50 (7 500 points).
  var COUT_NIVEAU = 3, NIVEAU_MAX_MUSCLE = 50, PLAFOND_MUSCLE = 7500;

  // §4 — l'XP et le niveau global.
  var XP_RECORD = 20, XP_SEMAINE = 165, POIDS_XP = 0.5;
  var XP_DU_PLAFOND = 40000;
  var NIVEAU_MAX = 100;
  var PLAFOND = ORDRE_DES_MUSCLES.length * PLAFOND_MUSCLE + POIDS_XP * XP_DU_PLAFOND;  // 72 500
  var K_NIVEAU = PLAFOND / (NIVEAU_MAX * NIVEAU_MAX);                                     // 7,25
  var PAS_OMEGA = PLAFOND / 10;                                                           // 7 250

  // §2 — les gels : à 12, puis tous les 26 semaines actives ; deux au plus.
  var PREMIER_GEL = 12, PAS_GEL = 26, GELS_MAX = 2;

  // §5 — rareté → points, et son rang (pour les cadres).
  var RARETES = {
    commun: { points: 10, rang: 0 },
    rare: { points: 25, rang: 1 },
    exceptionnel: { points: 50, rang: 2 },
    majeur: { points: 100, rang: 3 }
  };
  // Les catégories, dans l'ordre de `succes.ids` et de `prochains`.
  var PALIERS = [
    { cle: 'seances', paliers: [[10, 'commun'], [50, 'commun'], [100, 'rare'], [250, 'rare'], [500, 'exceptionnel'],
      [1000, 'majeur']] },
    { cle: 'serie', paliers: [[4, 'commun'], [12, 'commun'], [26, 'rare'], [52, 'exceptionnel'], [104, 'majeur']] },
    { cle: 'records', paliers: [[10, 'commun'], [50, 'commun'], [100, 'rare'], [250, 'rare'], [500, 'exceptionnel'],
      [1000, 'exceptionnel'], [2500, 'majeur']] },
    { cle: 'rando', paliers: [[50, 'commun'], [100, 'rare'], [250, 'exceptionnel'], [500, 'majeur']] },
    { cle: 'decouverte', paliers: [[10, 'commun'], [25, 'commun'], [50, 'rare'], [100, 'exceptionnel']] }
  ];
  var PALIERS_MUSCLE = [[10, 'commun'], [20, 'commun'], [30, 'rare'], [40, 'exceptionnel'], [50, 'majeur']];
  var PALIERS_TOUS = [[10, 'commun'], [20, 'rare'], [30, 'exceptionnel'], [40, 'exceptionnel'], [50, 'majeur']];
  var RANDONNEE = 'randonnee', METRES_PAR_KM = 1000;
  var SORTIE_M = 20000, SUCCES_SORTIE = 'rando-sortie-20', RARETE_SORTIE = 'rare';
  var CAP_PREMIER = 40, CAP_PAS = 20, RARETE_CAP = 'commun';

  // §6 — les titres (le plus petit des sept niveaux) et les cadres.
  var TITRES = [[10, 'equilibre'], [20, 'polyvalent'], [30, 'athlete'], [40, 'accompli'], [50, 'complet']];
  var COLLECTIONNEUR = 'collectionneur', SUCCES_COLLECTIONNEUR = 50;
  var CADRES = ['vitrine', 'niveau', 'or', 'grave'];          // du plus bas au plus haut
  var SUCCES_VITRINE = 10, TITRE_GRAVE = 'athlete';

  // Les tolérances de la référence.
  var EPS_PLANCHER = 1e-9, EPS_DEPARTAGE = 1e-12;
  function plancher(x) { return Math.floor(x + EPS_PLANCHER); }
  function arrondi6(x) { return Math.round(x * 1e6) / 1e6; }

  function possede(objet, cle) { return !!objet && Object.prototype.hasOwnProperty.call(objet, cle); }

  // « AAAA-MM-JJ » en date LOCALE — jamais `toISOString()` : en UTC, un lundi
  // 00:00 à Paris serait le dimanche.
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function jourLocal(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }

  // ── §2 La série de semaines et les gels ──────────────────────────────────
  //
  // Les semaines avancent de lundi en lundi par `decalerSemaine` (dates
  // locales), jamais de 7 × 24 h : au changement d'heure, le lundi suivant
  // tomberait à 01:00 ou le dimanche à 23:00.
  function semaines(entree, Semaine) {
    var actives = {}, lundis = [];
    (entree.seances || []).forEach(function (s) {
      if (!s || !s.debut) return;                      // une séance sans début lisible est ignorée
      var b = Semaine.bornesSemaine(s.debut);
      if (!b) return;
      var cle = jourLocal(b.lundi);
      if (!possede(actives, cle)) { actives[cle] = true; lundis.push(b.lundi); }
    });
    if (!lundis.length) {
      return { actives: 0, serie: 0, meilleure: 0, reserve: 0, gelsGagnes: 0, gelsUtilises: [], prochainGel: PREMIER_GEL };
    }
    lundis.sort(function (a, b) { return a.getTime() - b.getTime(); });
    var semaineDuJour = Semaine.bornesSemaine(entree.aujourdhui).lundi;
    var derniere = lundis[lundis.length - 1];
    var fin = derniere.getTime() > semaineDuJour.getTime() ? derniere : semaineDuJour;

    var serie = 0, meilleure = 0, reserve = 0, gagnes = 0, utilises = [];
    for (var lundi = lundis[0]; lundi.getTime() <= fin.getTime(); lundi = Semaine.decalerSemaine(lundi, 1).lundi) {
      var cle = jourLocal(lundi);
      if (possede(actives, cle)) {
        serie += 1;
        var gagne = serie === PREMIER_GEL || (serie > PREMIER_GEL && (serie - PREMIER_GEL) % PAS_GEL === 0);
        if (gagne && reserve < GELS_MAX) { reserve += 1; gagnes += 1; }
      } else if (lundi.getTime() < semaineDuJour.getTime()) {
        // Ni la semaine d'aujourd'hui ni les suivantes ne sont manquées.
        if (reserve > 0 && serie > 0) { reserve -= 1; utilises.push(cle); }
        else serie = 0;
      }
      meilleure = Math.max(meilleure, serie);
    }
    var prochain;
    if (reserve >= GELS_MAX) prochain = null;
    else if (serie < PREMIER_GEL) prochain = PREMIER_GEL - serie;
    else prochain = PAS_GEL - (serie - PREMIER_GEL) % PAS_GEL;
    return { actives: lundis.length, serie: serie, meilleure: meilleure, reserve: reserve, gelsGagnes: gagnes,
             gelsUtilises: utilises, prochainGel: prochain };
  }

  // ── §3 Les muscles ───────────────────────────────────────────────────────

  function niveauDuMuscle(points) {
    return Math.min(NIVEAU_MAX_MUSCLE, plancher(Math.sqrt(points / COUT_NIVEAU)));
  }

  function muscles(entree, Modele, Semaine) {
    var catalogue = entree.catalogue || {};
    var points = {};
    ORDRE_DES_MUSCLES.forEach(function (m) { points[m] = 0; });
    (entree.series || []).forEach(function (s) {
      if (!Modele.estTravail(s)) return;
      var exo = possede(catalogue, s.exercise_slug) ? catalogue[s.exercise_slug] : null;
      if (!exo) return;
      // Cardio : une sortie sans muscle principal, à la minute, rien aux zones.
      if (Modele.estExerciceSortie(exo) && !Semaine.porteDuVolume(exo)) {
        points[CARDIO] += (s.duree_s || 0) / SECONDES_PAR_MINUTE;
        return;
      }
      // Une fois par zone, la plus forte contribution — jamais additionnées.
      var parZone = {}, zones = [];
      var noter = function (muscle, valeur) {
        var z = Semaine.zoneDuMuscle(muscle);
        if (!z || possede(parZone, z.cle)) return;
        parZone[z.cle] = valeur;
        zones.push(z.cle);
      };
      (exo.muscles_primaires || []).forEach(function (m) { noter(m, POINT_PRINCIPAL); });
      (exo.muscles_secondaires || []).forEach(function (m) { noter(m, POINT_SECONDAIRE); });
      zones.forEach(function (z) { points[z] += parZone[z]; });
    });
    var out = {};
    ORDRE_DES_MUSCLES.forEach(function (m) {
      var n = niveauDuMuscle(points[m]);
      out[m] = { points: arrondi6(points[m]), niveau: n,
                 prochain: n >= NIVEAU_MAX_MUSCLE ? null : arrondi6(COUT_NIVEAU * (n + 1) * (n + 1) - points[m]) };
    });
    return out;
  }

  // ── §5 Les succès ────────────────────────────────────────────────────────

  function compteurs(entree, sem, Modele) {
    var metres = 0, sortie = false, medailles = {}, records = 0;
    (entree.series || []).forEach(function (s) {
      if (!Modele.estTravail(s) || s.exercise_slug !== RANDONNEE) return;
      metres += s.distance_m || 0;
      if ((s.distance_m || 0) > SORTIE_M) sortie = true;
    });
    // Une série médaillée compte une fois, quel que soit le nombre de types battus.
    (entree.journal || []).forEach(function (l) {
      if (!l || !l.set_id || possede(medailles, l.set_id)) return;
      medailles[l.set_id] = true;
      records += 1;
    });
    return {
      valeurs: { seances: (entree.seances || []).length, serie: sem.meilleure, records: records,
                 rando: metres / METRES_PAR_KM, decouverte: entree.exercicesFaits || 0 },
      sortie: sortie
    };
  }

  function plusPetitNiveau(mus) {
    return Math.min.apply(null, ORDRE_DES_MUSCLES.map(function (m) { return mus[m].niveau; }));
  }

  function succes(entree, sem, mus, comptes) {
    var liste = [];
    var gagner = function (id, rarete) { liste.push({ id: id, rarete: rarete }); };
    PALIERS.forEach(function (cat) {
      cat.paliers.forEach(function (p) {
        if (comptes.valeurs[cat.cle] >= p[0]) gagner(cat.cle + '-' + p[0], p[1]);
      });
    });
    if (comptes.sortie) gagner(SUCCES_SORTIE, RARETE_SORTIE);
    ORDRE_DES_MUSCLES.forEach(function (m) {
      PALIERS_MUSCLE.forEach(function (p) {
        if (mus[m].niveau >= p[0]) gagner('muscle-' + m + '-' + p[0], p[1]);
      });
    });
    var mini = plusPetitNiveau(mus);
    PALIERS_TOUS.forEach(function (p) { if (mini >= p[0]) gagner('tous-' + p[0], p[1]); });
    // Les caps ronds : les maximums reçus, dans leur ordre ; aucune liste de barres ici.
    (entree.maximums || []).forEach(function (x) {
      var charge = (x && x.charge) || 0;
      for (var k = CAP_PREMIER; k <= charge + EPS_PLANCHER; k += CAP_PAS) gagner('cap-' + x.slug + '-' + k, RARETE_CAP);
    });
    return liste;
  }

  // ── §6 Titres et cadres ──────────────────────────────────────────────────

  function titresEtCadres(liste, mus) {
    var mini = plusPetitNiveau(mus);
    var titres = TITRES.filter(function (t) { return mini >= t[0]; }).map(function (t) { return t[1]; });
    var titre = titres.length ? titres[titres.length - 1] : null;
    if (liste.length >= SUCCES_COLLECTIONNEUR) {
      titres.push(COLLECTIONNEUR);
      if (titre === null) titre = COLLECTIONNEUR;
    }
    var rangMax = liste.reduce(function (r, s) { return Math.max(r, RARETES[s.rarete].rang); }, -1);
    var cadres = [];
    if (liste.length >= SUCCES_VITRINE) cadres.push('vitrine');
    if (rangMax >= RARETES.rare.rang) cadres.push('niveau');
    if (rangMax >= RARETES.exceptionnel.rang) cadres.push('or');
    if (titres.indexOf(TITRE_GRAVE) >= 0) cadres.push('grave');
    var cadre = cadres.reduce(function (haut, c) {
      return haut === null || CADRES.indexOf(c) > CADRES.indexOf(haut) ? c : haut;
    }, null);
    return { titres: titres, titre: titre, cadres: cadres, cadre: cadre };
  }

  // ── §7 Le plus proche ────────────────────────────────────────────────────

  function prochains(mus, comptes, sem) {
    var out = [];
    ORDRE_DES_MUSCLES.forEach(function (m) {
      var n = mus[m].niveau;
      if (n >= NIVEAU_MAX_MUSCLE) return;
      var bas = COUT_NIVEAU * n * n, haut = COUT_NIVEAU * (n + 1) * (n + 1), p = mus[m].points;
      out.push({ type: 'muscle', cle: m, cible: n + 1, reste: arrondi6(haut - p),
                 fait: arrondi6(Math.max(0, (p - bas) / (haut - bas))) });
    });
    PALIERS.forEach(function (cat) {
      var valeur = comptes.valeurs[cat.cle], precedent = 0, cible = null;
      for (var i = 0; i < cat.paliers.length; i++) {
        if (valeur >= cat.paliers[i][0]) precedent = cat.paliers[i][0];
        else { cible = cat.paliers[i][0]; break; }
      }
      if (cible === null) return;
      // La série : le palier au-dessus de la MEILLEURE, compté sur la série EN COURS.
      var courant = cat.cle === 'serie' ? sem.serie : valeur;
      out.push({ type: 'categorie', cle: cat.cle, cible: cible, reste: arrondi6(cible - courant),
                 fait: arrondi6(Math.max(0, (courant - precedent) / (cible - precedent))) });
    });
    var meilleur = null;
    out.forEach(function (x) {
      if (meilleur === null || x.fait > meilleur.fait + EPS_DEPARTAGE) meilleur = x;
    });
    return { liste: out, plusProche: meilleur };
  }

  // ── L'état du jeu (§8) ───────────────────────────────────────────────────

  function etatDuJeu(entree) {
    var Modele = racine.THModele, Semaine = racine.THSemaine;
    var sem = semaines(entree, Semaine);
    var mus = muscles(entree, Modele, Semaine);
    var comptes = compteurs(entree, sem, Modele);
    var liste = succes(entree, sem, mus, comptes);

    var ptsSucces = liste.reduce(function (t, s) { return t + RARETES[s.rarete].points; }, 0);
    var xpRecords = XP_RECORD * comptes.valeurs.records;
    var xpSemaines = XP_SEMAINE * sem.actives;
    var xp = xpRecords + xpSemaines + ptsSucces;

    var reserve = 0;
    ORDRE_DES_MUSCLES.forEach(function (m) { reserve += Math.min(mus[m].points, PLAFOND_MUSCLE); });
    reserve += POIDS_XP * xp;
    var niveau = Math.min(NIVEAU_MAX, plancher(Math.sqrt(reserve / K_NIVEAU)));
    var omega = null, prochain;
    if (niveau >= NIVEAU_MAX) {
      omega = plancher((reserve - PLAFOND) / PAS_OMEGA);
      prochain = PLAFOND + (omega + 1) * PAS_OMEGA - reserve;
    } else {
      prochain = K_NIVEAU * (niveau + 1) * (niveau + 1) - reserve;
    }

    var tc = titresEtCadres(liste, mus);
    var pro = prochains(mus, comptes, sem);
    return {
      semaines: sem,
      muscles: mus,
      xp: { records: xpRecords, semaines: xpSemaines, succes: ptsSucces, total: xp },
      niveau: { reserve: arrondi6(reserve), niveau: niveau, omega: omega, prochain: arrondi6(prochain) },
      succes: { nombre: liste.length, points: ptsSucces, ids: liste.map(function (s) { return s.id; }) },
      titres: tc.titres, titre: tc.titre, cadres: tc.cadres, cadre: tc.cadre,
      prochains: pro.liste, plusProche: pro.plusProche
    };
  }

  var api = {
    etatDuJeu: etatDuJeu,
    ORDRE_DES_MUSCLES: ORDRE_DES_MUSCLES
  };

  racine.THJeu = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
