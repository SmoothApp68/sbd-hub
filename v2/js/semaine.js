// v2/js/semaine.js — découpage hebdomadaire et volume par muscle.
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache. Tout ce qui
// décide — où commence la semaine, dans quel jour tombe une séance, combien de
// séries chaque muscle a reçues — vit ici et se teste sans navigateur.
//
// ⚠️ FUSEAU HORAIRE. `sessions.debut` est un `timestamptz` : la base stocke un
// instant, pas une date. Toutes les lectures de calendrier se font en HEURE
// LOCALE (getDay, getDate, getMonth…), jamais en UTC. Une séance du dimanche
// 23 h chez quelqu'un en UTC+2 est stockée le dimanche 21 h UTC ; la lire en
// UTC la laisserait dimanche, mais une séance du dimanche 23 h UTC+0 lue en
// heure locale de Paris deviendrait lundi. Le seul repère qui corresponde au
// vécu de la personne est son heure locale.

(function (racine) {
  'use strict';

  var JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  // Les 18 muscles réellement présents au catalogue (REGLES-DE-COMPTAGE §3).
  // `cou` existe dans la nomenclature et reste vide — c'est voulu.
  // Les DIX-HUIT valeurs présentes en base, relevées sur les 237 exercices du
  // catalogue — c'est la liste exhaustive, pas une sélection. `cou` y figurait
  // et n'existe dans aucun exercice : retiré.
  //
  // `abducteurs` et `adducteurs` sont DEUX muscles, et leurs libellés diffèrent
  // d'une lettre. Ne pas les fusionner, ne pas en déduire une faute de frappe.
  var LIBELLES_MUSCLE = {
    abdominaux: 'Abdominaux', abducteurs: 'Abducteurs', adducteurs: 'Adducteurs',
    avant_bras: 'Avant-bras', bas_du_dos: 'Bas du dos', biceps: 'Biceps',
    deltoide_anterieur: 'Deltoïde antérieur', deltoide_lateral: 'Deltoïde latéral',
    deltoide_posterieur: 'Deltoïde postérieur', fessiers: 'Fessiers',
    grand_dorsal: 'Grand dorsal', haut_du_dos: 'Haut du dos',
    ischio_jambiers: 'Ischio-jambiers', mollets: 'Mollets', pectoraux: 'Pectoraux',
    quadriceps: 'Quadriceps', trapezes: 'Trapèzes', triceps: 'Triceps'
  };

  // Un muscle absent de la table se rend TEL QUEL. Il ne disparaît pas — un
  // muscle escamoté fausse un relevé qu'on croit exact — et il ne prend le nom
  // d'aucun autre : la clé brute en minuscules avec ses tirets bas ne peut se
  // confondre avec aucun libellé de la table, et se voit comme ce qu'elle est,
  // une valeur que le catalogue a gagnée et que l'app ne sait pas encore nommer.
  function libelleMuscle(cle) {
    if (Object.prototype.hasOwnProperty.call(LIBELLES_MUSCLE, cle)) return LIBELLES_MUSCLE[cle];
    return String(cle == null ? '' : cle);
  }

  // Lundi 00:00:00 et dimanche 23:59:59 de la semaine contenant `date`.
  // `new Date(y, m, d)` absorbe les débordements : le 3 janvier moins 6 jours
  // remonte tout seul au 28 décembre de l'année précédente.
  function bornesSemaine(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    var recul = (d.getDay() + 6) % 7;            // getDay : 0 = dimanche
    var lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate() - recul, 0, 0, 0, 0);
    var dimanche = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + 6, 23, 59, 59, 999);
    return { lundi: lundi, dimanche: dimanche };
  }

  function decalerSemaine(lundi, nbSemaines) {
    var l = lundi instanceof Date ? lundi : new Date(lundi);
    return bornesSemaine(new Date(l.getFullYear(), l.getMonth(), l.getDate() + (nbSemaines * 7)));
  }

  function memeSemaine(a, b) {
    var ba = bornesSemaine(a), bb = bornesSemaine(b);
    return !!ba && !!bb && ba.lundi.getTime() === bb.lundi.getTime();
  }

  // Les sept jours, du lundi au dimanche, vides compris. Un jour sans séance
  // est une information : c'est ce qu'une vue hebdomadaire apporte sur une
  // liste. Il s'affiche, il ne se juge pas (CADRAGE-V2 §3.1 bis).
  function repartirParJour(seances, lundi) {
    var bornes = bornesSemaine(lundi);
    if (!bornes) return [];
    var jours = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(bornes.lundi.getFullYear(), bornes.lundi.getMonth(), bornes.lundi.getDate() + i);
      jours.push({ date: d, nom: JOURS[i], seances: [] });
    }
    (seances || []).forEach(function (s) {
      if (!s || !s.debut) return;
      var d = new Date(s.debut);
      if (isNaN(d.getTime())) return;
      if (d < bornes.lundi || d > bornes.dimanche) return;
      jours[(d.getDay() + 6) % 7].seances.push(s);
    });
    jours.forEach(function (j) {
      j.seances.sort(function (a, b) { return String(a.debut).localeCompare(String(b.debut)); });
    });
    return jours;
  }

  // Volume par muscle : la série de travail, pondérée 1 en primaire et 0,5 en
  // secondaire (REGLE-VOLUME-V2 §1). Registre strictement descriptif — aucun
  // seuil, aucune comparaison : la règle de volume exige une fenêtre de trois
  // semaines actives et deux fenêtres de persistance, donc rien ne peut être
  // conclu d'une semaine isolée.
  //
  // Les activités sans charge (randonnée, course, pilates, rameur…) n'ont
  // aucun muscle au catalogue : elles ne contribuent à rien, sans qu'on ait à
  // les exclure par leur nom. La cartographie fait le filtrage elle-même — et
  // c'est mieux qu'un critère séparé, qui retirerait aussi les gainages, dont
  // les muscles sont bien renseignés.
  function volumeParMuscle(series, exercices) {
    var cat = {};
    (exercices || []).forEach(function (e) { if (e && e.slug) cat[e.slug] = e; });

    var total = {};
    function ajouter(muscle, poids) {
      if (!muscle) return;
      total[muscle] = (total[muscle] || 0) + poids;
    }

    (series || []).forEach(function (s) {
      if (!racine.THModele.estTravail(s)) return;
      var exo = cat[s.exercise_slug];
      if (!exo) return;
      (exo.muscles_primaires || []).forEach(function (m) { ajouter(m, 1); });
      (exo.muscles_secondaires || []).forEach(function (m) { ajouter(m, 0.5); });
    });

    return Object.keys(total).map(function (m) {
      return { muscle: m, libelle: libelleMuscle(m), series: Math.round(total[m] * 10) / 10 };
    }).sort(function (a, b) {
      return b.series - a.series || a.libelle.localeCompare(b.libelle);
    });
  }

  // MOTEUR §9.23 (55-1) — LES SÉRIES PAR MUSCLE PRINCIPAL, pour le bilan du
  // mois : une série de travail compte UNE fois pour chacun de ses muscles
  // principaux, rien pour les secondaires (« muscles principaux », §9.23). Le
  // même catalogue et la même série de travail que `volumeParMuscle`, à côté
  // de qui il vit : un nombre entier, qui se lit sans décimale.
  function seriesParMusclePrincipal(series, exercices) {
    var cat = {};
    (exercices || []).forEach(function (e) { if (e && e.slug) cat[e.slug] = e; });
    var total = {};
    (series || []).forEach(function (s) {
      if (!racine.THModele.estTravail(s)) return;
      var exo = cat[s.exercise_slug];
      if (!exo) return;
      (exo.muscles_primaires || []).forEach(function (m) { if (m) total[m] = (total[m] || 0) + 1; });
    });
    return Object.keys(total).map(function (m) {
      return { muscle: m, libelle: libelleMuscle(m), series: total[m] };
    }).sort(function (a, b) {
      return b.series - a.series || a.libelle.localeCompare(b.libelle);
    });
  }

  // MOTEUR §14.6 (49-U16) — LE VOLUME DE CHAQUE SEMAINE, PAR MUSCLE, sur tout
  // l'historique (importées comprises) : l'entrée de la règle de volume. Un
  // seul fil : chaque semaine passe par `volumeParMuscle`, aucun second calcul
  // du volume. Les semaines vont de celle de la première séance à celle qui
  // PRÉCÈDE la semaine de `avant` (la séance qui s'ouvre), vides comprises —
  // une semaine vide est un fait que la règle lit (époques, §11.4).
  // Rend `{ [muscle]: [{ semaine: 'AAAA-MM-JJ' (lundi), active, volume }] }`.
  // Pur. Le jugement (fenêtres, seuil, place) n'est pas ici : il est au moteur.
  function semainesDeVolume(seances, series, exercices, avant) {
    var b = bornesSemaine(avant);
    if (!b) return {};
    var parSeance = {};
    (series || []).forEach(function (s) {
      if (s && s.session_id) (parSeance[s.session_id] || (parSeance[s.session_id] = [])).push(s);
    });
    var cle = function (d) {
      var deux = function (x) { return (x < 10 ? '0' : '') + x; };
      return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
    };
    var semaines = {};   // lundi → { active, series }
    var premier = null;
    (seances || []).forEach(function (s) {
      if (!s || !s.debut) return;
      var bs = bornesSemaine(s.debut);
      if (!bs || bs.lundi.getTime() >= b.lundi.getTime()) return;
      var k = cle(bs.lundi);
      var w = semaines[k] || (semaines[k] = { active: true, series: [] });
      w.series = w.series.concat(parSeance[s.id] || []);
      if (premier === null || bs.lundi.getTime() < premier.getTime()) premier = bs.lundi;
    });
    var sortie = {};
    if (premier === null) return sortie;
    var lignes = [];
    for (var l = premier; l.getTime() < b.lundi.getTime(); l = decalerSemaine(l, 1).lundi) {
      var k2 = cle(l);
      var w2 = semaines[k2];
      var v = {};
      if (w2) volumeParMuscle(w2.series, exercices).forEach(function (m) { v[m.muscle] = m.series; });
      lignes.push({ semaine: k2, active: !!w2, volume: v });
    }
    var muscles = {};
    lignes.forEach(function (x) { Object.keys(x.volume).forEach(function (m) { muscles[m] = true; }); });
    Object.keys(muscles).sort().forEach(function (m) {
      sortie[m] = lignes.map(function (x) {
        return { semaine: x.semaine, active: x.active, volume: x.volume[m] || 0 };
      });
    });
    return sortie;
  }

  // ── Zones (ECRAN-SAISIE §7 bis.10) ──────────────────────────────────────
  //
  // SIX zones, pas dix-huit muscles. Mesuré sur 52 semaines : le premier muscle
  // pèse 11 % du volume, les six premiers 52 %, les douze premiers 86 %. Il n'y
  // a PAS de longue traîne — masquer la moitié basse cacherait 48 % du volume,
  // pas du bruit. On regroupe, on ne tronque pas : la somme des six zones vaut
  // exactement celle des dix-huit muscles, et un test le vérifie.
  var ZONES = [
    { cle: 'jambes', libelle: 'Jambes',
      muscles: ['quadriceps', 'ischio_jambiers', 'fessiers', 'mollets', 'adducteurs', 'abducteurs'] },
    { cle: 'dos', libelle: 'Dos',
      muscles: ['grand_dorsal', 'haut_du_dos', 'trapezes', 'bas_du_dos'] },
    { cle: 'bras', libelle: 'Bras', muscles: ['biceps', 'triceps', 'avant_bras'] },
    { cle: 'epaules', libelle: 'Épaules',
      muscles: ['deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur'] },
    { cle: 'poitrine', libelle: 'Poitrine', muscles: ['pectoraux'] },
    { cle: 'tronc', libelle: 'Tronc', muscles: ['abdominaux'] }
  ];

  // Un muscle hors table ne disparaît pas et n'est rattaché à aucune zone au
  // hasard : il tombe dans une zone À PART, visible. Le rattacher d'office
  // fabriquerait un total faux qu'on croirait exact — c'est le même risque que
  // les libellés, en pire, parce qu'il se cache dans une somme.
  var ZONE_INCONNUE = { cle: 'hors-zone', libelle: 'Hors zone' };

  var ZONE_DE = {};
  ZONES.forEach(function (z) { z.muscles.forEach(function (m) { ZONE_DE[m] = z; }); });

  function zoneDuMuscle(muscle) { return ZONE_DE[muscle] || null; }

  // Volume par zone, à partir du volume par muscle — donc la somme est la même
  // par construction, et le test le prouve plutôt que de le supposer.
  function volumeParZone(series, exercices) {
    var parMuscle = volumeParMuscle(series, exercices);
    var paquets = {}, ordre = [];

    parMuscle.forEach(function (v) {
      var z = zoneDuMuscle(v.muscle) || ZONE_INCONNUE;
      if (!paquets[z.cle]) {
        paquets[z.cle] = { zone: z.cle, libelle: z.libelle, series: 0, muscles: [],
                           horsTable: z === ZONE_INCONNUE };
        ordre.push(paquets[z.cle]);
      }
      paquets[z.cle].series += v.series;
      paquets[z.cle].muscles.push(v);
    });

    return ordre.map(function (z) {
      // Les dixièmes se réintroduisent à l'addition : on arrondit une fois, à
      // la fin, comme volumeParMuscle le fait pour chaque muscle.
      z.series = Math.round(z.series * 10) / 10;
      return z;
    }).sort(function (a, b) {
      return b.series - a.series || a.libelle.localeCompare(b.libelle);
    });
  }

  // D'où vient ce 11,5 : une ligne par couple (exercice, séance), avec le
  // nombre de séries RÉELLES et l'apport. L'écart entre les deux est ce que la
  // fenêtre existe pour montrer — un muscle secondaire vaut un demi-point.
  function apportsParMuscle(muscle, series, exercices, seances) {
    var cat = {};
    (exercices || []).forEach(function (e) { if (e && e.slug) cat[e.slug] = e; });
    var quand = {};
    (seances || []).forEach(function (s) { if (s && s.id) quand[s.id] = s; });

    var paquets = {}, ordre = [];
    (series || []).forEach(function (s) {
      if (!racine.THModele.estTravail(s)) return;
      var exo = cat[s.exercise_slug];
      if (!exo) return;
      var primaire = (exo.muscles_primaires || []).indexOf(muscle) >= 0;
      var secondaire = (exo.muscles_secondaires || []).indexOf(muscle) >= 0;
      if (!primaire && !secondaire) return;

      var cle = s.exercise_slug + '|' + s.session_id;
      if (!paquets[cle]) {
        var seance = quand[s.session_id];
        var d = seance && seance.debut ? new Date(seance.debut) : null;
        paquets[cle] = {
          slug: s.exercise_slug, nom: exo.nom || s.exercise_slug,
          jour: d && !isNaN(d.getTime()) ? d : null,
          seriesReelles: 0, apport: 0, secondaire: !primaire && secondaire
        };
        ordre.push(paquets[cle]);
      }
      paquets[cle].seriesReelles += 1;
      paquets[cle].apport += primaire ? 1 : 0.5;
    });

    return ordre.map(function (a) {
      a.apport = Math.round(a.apport * 10) / 10;
      return a;
    }).sort(function (a, b) {
      return b.apport - a.apport || a.nom.localeCompare(b.nom);
    });
  }

  // Un jour sans séance ne s'affiche pas : sur une semaine à quatre séances,
  // trois lignes vides n'apportent rien et allongent le défilement. La
  // répartition se lit déjà dans les dates des jours pleins.
  //
  // `repartirParJour` continue de rendre les SEPT jours : le modèle décrit la
  // semaine, c'est la vue qui choisit ce qu'elle montre.
  function joursAvecSeances(jours) {
    return (jours || []).filter(function (j) { return j && j.seances && j.seances.length > 0; });
  }

  // Compte brut de la semaine. Descriptif, sans commentaire.
  // ⚠️ UNE SORTIE N'A PAS DE SÉRIES DE TRAVAIL (chantier 39, C2).
  //
  // `bilanSemaine` ne filtrait que `type_serie`, jamais la NATURE de l'exercice.
  // Mesuré : 552 séries sur 467 séances — 38 % du corpus — sur 13 exercices sans
  // muscle primaire : tapis, marche, randonnée, natation, vélo. Et
  // l'incohérence était visible à l'œil nu : la carte d'une sortie REFUSE
  // d'afficher un compte de séries, et la barre juste au-dessus les additionnait.
  // `CADRAGE-V2 §2 ter` l'interdit — les sorties sont hors du périmètre du
  // moteur.
  //
  // ⚠️ LE CRITÈRE EST « PORTE DU VOLUME », PAS `estExerciceSortie`.
  //
  // `THModele.estExerciceSortie` (charge `aucune` ET mesure temporelle) couvre
  // 19 exercices du catalogue ; SIX d'entre eux portent un muscle primaire —
  // poirier, gainage, l-sit, et les trois planches. Les exclure ferait afficher
  // « 0 série de travail » sur une séance de gainage, qui en est pourtant une.
  // Le critère juste est celui que `volumeParMuscle` applique déjà sans le dire :
  // un exercice compte s'il porte du volume, c'est-à-dire s'il a au moins un
  // muscle primaire. Mesuré sur le catalogue : exactement les 13 de l'audit, et
  // aucun exercice sans muscle primaire n'échappe à `estExerciceSortie`.
  //
  // Ce n'est donc pas une seconde définition de « sortie » — c'est la règle du
  // volume, rendue explicite là où elle manquait.
  function porteDuVolume(exo) {
    return !!exo && !!(exo.muscles_primaires || []).length;
  }

  // ⚠️ COMBIEN DE SÉRIES DE TRAVAIL, ET UN SEUL ENDROIT QUI LE SAIT.
  //
  // Le chantier 39 a posé la règle sur la BARRE et l'a laissée hors de la CARTE :
  // la séance du 14/09 affichait 23 en haut et 25 sur sa carte, pour les mêmes
  // séries. Deux lecteurs, deux calculs, deux nombres — c'est très exactement la
  // maladie que `CADRAGE-V2 §2 undecies` nomme.
  //
  // Elle vit donc ici, une fois, et `THModele.resumerSeance` l'appelle pour la
  // carte. Si la carte et la barre pouvaient encore différer, c'est qu'elles
  // calculeraient au lieu de lire.
  function compteSeriesTravail(series, exercices) {
    var cat = {};
    (exercices || []).forEach(function (e) { if (e && e.slug) cat[e.slug] = e; });
    var n = 0;
    (series || []).forEach(function (s) {
      if (!racine.THModele.estTravail(s)) return;
      // ⚠️ ON NE RETRANCHE QUE CE QU'ON CONNAÎT. Un exercice absent du catalogue
      // — cache pas encore chargé, slug inconnu — n'est pas un exercice sans
      // muscle : c'est un exercice dont on ne sait rien. L'écarter ferait
      // afficher « 0 série de travail » au premier démarrage, ce qui serait faux
      // d'une autre manière.
      var exo = cat[s.exercise_slug];
      if (exo && !porteDuVolume(exo)) return;
      n++;
    });
    return n;
  }

  function bilanSemaine(seances, series, exercices) {
    var ids = new Set((seances || []).map(function (s) { return s && s.id; }));
    var dansLaSemaine = (series || []).filter(function (s) {
      return s && ids.has(s.session_id);
    });
    return {
      nbSeances: (seances || []).length,
      nbSeriesTravail: compteSeriesTravail(dansLaSemaine, exercices)
    };
  }

  var api = {
    JOURS: JOURS,
    LIBELLES_MUSCLE: LIBELLES_MUSCLE,
    libelleMuscle: libelleMuscle,
    seriesParMusclePrincipal: seriesParMusclePrincipal,
    ZONES: ZONES,
    zoneDuMuscle: zoneDuMuscle,
    volumeParZone: volumeParZone,
    apportsParMuscle: apportsParMuscle,
    joursAvecSeances: joursAvecSeances,
    bornesSemaine: bornesSemaine,
    decalerSemaine: decalerSemaine,
    memeSemaine: memeSemaine,
    repartirParJour: repartirParJour,
    volumeParMuscle: volumeParMuscle,
    semainesDeVolume: semainesDeVolume,
    porteDuVolume: porteDuVolume,
    compteSeriesTravail: compteSeriesTravail,
    bilanSemaine: bilanSemaine
  };

  racine.THSemaine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // `globalThis` en repli : sous l'environnement node de Jest, `self` n'existe
  // pas et `this` vaut undefined au niveau module. Les tests de fuseau ont
  // besoin de cet environnement — jsdom fige le TZ avant l'exécution du test.
})(typeof self !== 'undefined' ? self : globalThis);
