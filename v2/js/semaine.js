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
  var LIBELLES_MUSCLE = {
    abdominaux: 'Abdominaux', abducteurs: 'Abducteurs', adducteurs: 'Adducteurs',
    avant_bras: 'Avant-bras', bas_du_dos: 'Bas du dos', biceps: 'Biceps', cou: 'Cou',
    deltoide_anterieur: 'Deltoïde antérieur', deltoide_lateral: 'Deltoïde latéral',
    deltoide_posterieur: 'Deltoïde postérieur', fessiers: 'Fessiers',
    grand_dorsal: 'Grand dorsal', haut_du_dos: 'Haut du dos',
    ischio_jambiers: 'Ischio-jambiers', mollets: 'Mollets', pectoraux: 'Pectoraux',
    quadriceps: 'Quadriceps', trapezes: 'Trapèzes', triceps: 'Triceps'
  };

  function libelleMuscle(cle) { return LIBELLES_MUSCLE[cle] || cle; }

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
      if (!s || s.type_serie !== 'travail') return;
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

  // Compte brut de la semaine. Descriptif, sans commentaire.
  function bilanSemaine(seances, series) {
    var ids = new Set((seances || []).map(function (s) { return s && s.id; }));
    var travail = 0;
    (series || []).forEach(function (s) {
      if (s && s.type_serie === 'travail' && ids.has(s.session_id)) travail++;
    });
    return { nbSeances: (seances || []).length, nbSeriesTravail: travail };
  }

  var api = {
    JOURS: JOURS,
    LIBELLES_MUSCLE: LIBELLES_MUSCLE,
    libelleMuscle: libelleMuscle,
    bornesSemaine: bornesSemaine,
    decalerSemaine: decalerSemaine,
    memeSemaine: memeSemaine,
    repartirParJour: repartirParJour,
    volumeParMuscle: volumeParMuscle,
    bilanSemaine: bilanSemaine
  };

  racine.THSemaine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // `globalThis` en repli : sous l'environnement node de Jest, `self` n'existe
  // pas et `this` vaut undefined au niveau module. Les tests de fuseau ont
  // besoin de cet environnement — jsdom fige le TZ avant l'exécution du test.
})(typeof self !== 'undefined' ? self : globalThis);
