// v2/js/importhevy.js — 69 (ECRAN-PROFIL §2.4 quater) : lire ce que Hevy donne.
//
// Module PUR : aucun DOM, aucun réseau, aucune écriture. Il lit le texte que
// Hevy partage (« une séance → Partager → Copier », plusieurs à la suite) et
// l'export CSV (tout l'historique), et les deux rendent LA MÊME FORME de
// séance :
//
//   { titre, note, debut_local, fin_local, ref,
//     exercices: [{ nom, note, groupe_superset,
//                   series: [{ type_serie, charge_kg, reps, duree_s, distance_m, rpe }] }] }
//
// ⚠️ IL REPRODUIT `tests/unit/fixtures/ref69.py` RÈGLE POUR RÈGLE. C'est la
// lecture de l'import v1 (`js/import.js`, `parseHevySetLine` ; `js/engine.js`,
// `parseHevyDate`), constatée sur les vraies séances et comparée série par
// série à ce que la base porte déjà. Le code du v1 n'est pas repris : ses
// règles le sont, et pas une de plus.
//
// ⚠️ UN NOM INTROUVABLE RESTE INTROUVABLE. Le v1 devinait « au plus près » :
// une erreur fausserait les charges que le coach prescrit, sans que rien ne le
// montre. Ici un nom se trouve à l'identique (sans accents ni casse) ou il est
// « à rattacher », et c'est la personne qui choisit.
//
// Ce que le module ne fait PAS : écrire. La séance et ses séries partent par la
// file d'envoi (`app.js`), avec les identifiants tirés du nom
// (`THMoteur.idDImport`) ; `seanceAEcrire` ne fait que leur donner la forme que
// `THSeance.ligneSession` et `THSeance.lignes` savent envoyer.

(function (racine) {
  'use strict';

  // ── Les mots ────────────────────────────────────────────────────────────
  var MOIS = {
    janv: 1, janvier: 1, fevr: 2, fevrier: 2, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6,
    juil: 7, juillet: 7, aout: 8, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11,
    novembre: 11, dec: 12, decembre: 12,
    // 118 (audit du 16/10, 03 #12) — les mois d'un export réglé en ANGLAIS (« 16 Jun 2026, 10:24 »,
    // « Oct 2, 2026, 5:54 PM ») : seule la date du CSV change de langue, ses colonnes et ses types de série non.
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9, october: 10, november: 11, december: 12
  };
  // Les mots qui ne sont QUE de l'anglais (« oct », « nov », « dec », « sept » valent dans les deux langues ; « am »
  // et « pm » aussi : le Hevy français les écrit) : une date illisible qui en porte un vient d'un Hevy réglé en
  // anglais, et l'écran le dit (`enAnglais`).
  var MOTS_ANGLAIS = /(^|[^a-z])(jan|january|feb|february|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|october|november|december|at)([^a-z]|$)/;
  function erreurDate(texte) {
    var e = new Error('date illisible : ' + texte);
    if (MOTS_ANGLAIS.test(norme(texte))) e.enAnglais = true;
    return e;
  }
  // Les mois AFFICHÉS sont ceux du formateur unique (`modele.js`, registre des
  // notions) ; ceux d'au-dessus ne servent qu'à LIRE la date de Hevy.
  function Mo() { return racine.THModele; }

  // ⚠️ LA NORMALISATION DE LA BASE, À LA LETTRE. La colonne générée
  // `alias_exercice.alias_norme` vaut
  // `translate(lower(btrim(alias)), 'àâäéèêëîïôöùûüçœ', 'aaaeeeeiioouuuco')` :
  // un nom rattaché ici doit se retrouver là, sinon le rattachement d'hier ne
  // vaudrait pas pour l'import d'aujourd'hui.
  var AVEC = 'àâäéèêëîïôöùûüçœ', SANS = 'aaaeeeeiioouuuco';
  function norme(s) {
    var t = String(s === null || s === undefined ? '' : s).trim().toLowerCase();
    var out = '';
    for (var i = 0; i < t.length; i++) {
      var k = AVEC.indexOf(t[i]);
      out += k >= 0 ? SANS[k] : t[i];
    }
    return out;
  }

  // Un nombre lu dans ce que Hevy écrit — virgule ou point décimal — par LA
  // lecture des nombres de l'app (`THModele.lireNombre`, registre des notions).
  // ⚠️ Illisible, c'est une ERREUR (« 1.2.3 » n'est pas 1.2) : Python `float`
  // refuse, et une série à moitié lue fausserait la séance sans le dire.
  function nombreLu(x) {
    var v = Mo().lireNombre(x);
    if (v === null) throw new Error('nombre illisible : ' + x);
    return v;
  }
  // Un nombre tel que la base le rend (`trim_scale`) : 52, 31.5, 24.8.
  function nombre(x) {
    if (x === null || x === undefined) return null;
    return Math.round(nombreLu(x) * 1000) / 1000;
  }
  function entier(x) {
    var v = nombreLu(x);
    if (Math.floor(v) !== v || /[.eE]/.test(String(x))) throw new Error('entier illisible : ' + x);
    return v;
  }
  function dixieme(x) { return Math.round(x * 10) / 10; }
  var LIVRE = 0.45359237;
  function deux(n) { return (n < 10 ? '0' : '') + n; }

  // ── Le texte partagé ────────────────────────────────────────────────────
  var RE_DATE = /^le\s+[\p{L}\p{N}_]+,\s+([a-z]+)\.?\s+(\d{1,2}),\s+(\d{4})\s+a\s+(\d{1,2}):(\d{2})\s*(am|pm)$/u;
  var RE_SERIE = /^s[eé]rie\s+\d+\s*:\s*(.+)$/i;
  var RE_LIEN = /^https?:\/\/hevy\.com\/workout\/([A-Za-z0-9]+)/;
  // [Échauffement] → échauffement ; [Abandon] → DÉGRESSIVE (relevé 5 fois sur
  // 5 : une série plus légère juste après la dernière ; l'import du 19 au 25/09
  // les a rangées ainsi) ; [Échec] → échec ; tout autre crochet → travail.
  var TYPES_TEXTE = {
    echauffement: 'echauffement', abandon: 'degressive', degressive: 'degressive',
    drop: 'degressive', 'drop set': 'degressive', echec: 'echec'
  };

  function moisDe(mot) {
    if (!Object.prototype.hasOwnProperty.call(MOIS, mot)) throw new Error('mois illisible : ' + mot);
    return MOIS[mot];
  }
  // L'heure sur 24 h : « 5:54 pm » → 17 ; « 12:10 am » → 0 ; sans am/pm, telle quelle.
  function heure24(h, ap) {
    var n = Number(h);
    if (ap === 'pm' && n < 12) n += 12;
    if (ap === 'am' && n === 12) n = 0;
    return n;
  }

  // « Le mardi, sept. 22, 2026 à 5:12pm » → « 2026-09-22T17:12 » ; null sinon.
  function dateTexte(ligne) {
    var m = RE_DATE.exec(norme(ligne));
    if (!m) return null;
    var h = Number(m[4]);
    if (m[6] === 'pm' && h < 12) h += 12;
    if (m[6] === 'am' && h === 12) h = 0;
    return m[3] + '-' + deux(moisDe(m[1])) + '-' + deux(Number(m[2])) + 'T' + deux(h) + ':' + m[5];
  }

  // « 30s », « 5min 0s », « 5h 25min 5s » → secondes ; 0 → null.
  function duree(s) {
    var t = 0, re = /(\d+)\s*(h|min|s)\b/g, m;
    var unite = { h: 3600, min: 60, s: 1 };
    while ((m = re.exec(s)) !== null) t += Number(m[1]) * unite[m[2]];
    return t || null;
  }

  function serieTexte(brut) {
    var d = brut;
    var s = { type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null, rpe: null };
    var m = /\[([^\]]+)\]/.exec(d);
    if (m) {
      var t = norme(m[1]);
      s.type_serie = Object.prototype.hasOwnProperty.call(TYPES_TEXTE, t) ? TYPES_TEXTE[t] : 'travail';
      d = d.slice(0, m.index) + d.slice(m.index + m[0].length);
    }
    m = /@\s*([\d.,]+)\s*rpe/i.exec(d);
    if (m) {
      s.rpe = nombre(m[1]);
      d = d.slice(0, m.index) + d.slice(m.index + m[0].length);
    }
    d = d.trim();
    m = /^([\d.,]+)\s*km\s*-\s*(.+)$/.exec(d);
    if (m) {
      s.distance_m = nombre(nombreLu(m[1]) * 1000);
      s.duree_s = duree(m[2]);
      return s;
    }
    // ⚠️ 118 (audit du 16/10, 03 #4) — UN SIGNE DEVANT LA CHARGE se lit tel qu'il est écrit : « +10 kg x 8 » (un
    // lest) vaut 10 kg, « -20 kg x 8 » (une aide) vaut −20 kg — l'aide est rangée en NÉGATIF en base (MOTEUR
    // §9.17). Sans signe, rien ne change. Le signe ne se DEVINE jamais (le type d'exercice ne le pose pas) : il est lu.
    // Avant, un seul signe faisait refuser tout le texte collé.
    m = /^([+-]?)\s*([\d.,]+)\s*(kg|lbs)\s*[x×]\s*(\d+)$/i.exec(d);
    if (m) {
      var kg = nombreLu(m[2]);
      if (m[3].toLowerCase() === 'lbs') kg = dixieme(kg * LIVRE);
      if (m[1] === '-') kg = -kg;
      s.charge_kg = nombre(kg);
      s.reps = Number(m[4]);
      return s;
    }
    m = /^(\d+)\s*r[eé]p[eé]titions?$/i.exec(d);
    if (m) { s.reps = Number(m[1]); return s; }
    if (/^(\d+\s*(h|min|s)\s*)+$/.test(d)) { s.duree_s = duree(d); return s; }
    throw new Error('série illisible : ' + d);
  }

  // ⚠️ UNE LIGNE ILLISIBLE EST UNE ERREUR, JAMAIS UNE SÉANCE À MOITIÉ LUE.
  // Une série qu'on sauterait en silence fausserait le volume et les records
  // de la séance, et la personne ne le verrait pas.
  function lireTexte(texte) {
    var seances = [], cur = null, exo = null, attendDate = false;
    String(texte || '').split('\n').forEach(function (brut) {
      var l = brut.trim();
      if (!l) return;
      if (l.toLowerCase() === '@hevyapp') return;
      var m = RE_LIEN.exec(l);
      if (m) {
        if (cur) cur.ref = 'hevy:' + m[1];
        cur = null; exo = null;
        return;
      }
      if (cur === null) {
        cur = { titre: l, debut_local: null, fin_local: null, note: null, ref: null, exercices: [] };
        seances.push(cur); exo = null; attendDate = true;
        return;
      }
      if (attendDate) {
        cur.debut_local = dateTexte(l);
        // 118 — un texte partagé depuis un Hevy en ANGLAIS (« Thursday, Oct 2, 2026 at 5:54pm », « Set 1: … ») n'est
        // pas lu : ses mots de série (échauffement, dégressive…) n'ont jamais été relevés, et les deviner rangerait
        // une chauffe en série de travail. L'erreur le dit (`enAnglais`), l'écran demande un Hevy en français.
        if (!cur.debut_local) throw erreurDate(l);
        attendDate = false;
        return;
      }
      m = RE_SERIE.exec(l);
      if (m) {
        if (!exo) throw new Error('série sans exercice : ' + l);
        exo.series.push(serieTexte(m[1]));
        return;
      }
      if (l.charAt(0) === '"' && l.charAt(l.length - 1) === '"' && exo !== null && !exo.series.length) {
        exo.note = l.slice(1, -1);
        return;
      }
      exo = { nom: l, note: null, groupe_superset: null, series: [] };
      cur.exercices.push(exo);
    });
    return seances;
  }

  // ── Le fichier CSV ──────────────────────────────────────────────────────
  var TYPES_CSV = { normal: 'travail', warmup: 'echauffement', dropset: 'degressive', failure: 'echec' };
  // Les colonnes d'un export de séances Hevy (§2.4 quater). La charge vient de
  // `weight_kg`, ou de `weight_lbs` sur un compte en livres.
  var COLONNES_CSV = ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id',
                      'exercise_notes', 'set_index', 'set_type', 'reps', 'distance_km', 'duration_seconds', 'rpe'];

  // Le découpage d'un CSV (RFC 4180, comme le module `csv` de Python) :
  // guillemets doublés, virgules et sauts de ligne dans un champ entre
  // guillemets ; une ligne entièrement vide est sautée.
  function lignesCsv(texte) {
    var lignes = [], ligne = [], champ = '', dans = false, i = 0, n = texte.length;
    var finChamp = function () { ligne.push(champ); champ = ''; };
    var finLigne = function () {
      finChamp();
      if (!(ligne.length === 1 && ligne[0] === '')) lignes.push(ligne);
      ligne = [];
    };
    while (i < n) {
      var c = texte[i];
      if (dans) {
        if (c === '"') {
          if (texte[i + 1] === '"') { champ += '"'; i += 2; continue; }
          dans = false; i++; continue;
        }
        champ += c; i++; continue;
      }
      if (c === '"' && champ === '') { dans = true; i++; continue; }
      if (c === ',') { finChamp(); i++; continue; }
      if (c === '\r') { finLigne(); i += texte[i + 1] === '\n' ? 2 : 1; continue; }
      if (c === '\n') { finLigne(); i++; continue; }
      champ += c; i++;
    }
    if (champ !== '' || ligne.length) finLigne();
    return lignes;
  }

  // « 16 juin 2026, 10:24 » → « 2026-06-16T10:24 ». 118 (audit du 16/10, 03 #12) — et l'export d'un Hevy en
  // anglais : « 16 Jun 2026, 10:24 » (la forme relevée par l'audit) ou « Oct 2, 2026, 5:54 PM ». Une date que rien
  // ne lit, ou un mois inconnu, est une erreur — `enAnglais` si elle porte un mot anglais.
  var RE_CSV_JMA = /^(\d{1,2})\s+([^\s]+?)\.?\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(am|pm)?$/;
  var RE_CSV_MJA = /^([a-z]+)\.?\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(am|pm)?$/;
  function dateCsv(s) {
    var t = norme(s), m = RE_CSV_JMA.exec(t), j, mo, a, h, mi, ap;
    if (m) { j = m[1]; mo = m[2]; a = m[3]; h = m[4]; mi = m[5]; ap = m[6]; }
    else if ((m = RE_CSV_MJA.exec(t))) { mo = m[1]; j = m[2]; a = m[3]; h = m[4]; mi = m[5]; ap = m[6]; }
    else throw erreurDate(s);
    if (!Object.prototype.hasOwnProperty.call(MOIS, mo)) throw erreurDate(s);
    return a + '-' + deux(MOIS[mo]) + '-' + deux(Number(j)) + 'T' + deux(heure24(h, ap)) + ':' + mi;
  }

  function vide(x) {
    return x === null || x === undefined || String(x).trim() === '' ? null : String(x).trim();
  }

  // ⚠️ LE MESSAGE DE L'ÉCRAN DÉPEND DE L'ERREUR : un fichier qui n'est pas un
  // export de séances (`pasUnExport`) ne se dit pas comme un texte illisible.
  function erreurExport(message) {
    var e = new Error(message);
    e.pasUnExport = true;
    return e;
  }

  function lireCsv(texte) {
    var brutes = lignesCsv(String(texte || '').replace(/^﻿/, ''));
    if (!brutes.length) throw erreurExport('fichier vide');
    var entete = brutes[0];
    var manquantes = COLONNES_CSV.filter(function (c) { return entete.indexOf(c) < 0; });
    if (manquantes.length || (entete.indexOf('weight_kg') < 0 && entete.indexOf('weight_lbs') < 0)) {
      throw erreurExport('colonnes absentes : ' + manquantes.join(', '));
    }
    var seances = [], index = {};
    brutes.slice(1).forEach(function (valeurs) {
      // Une ligne plus courte que l'en-tête laisse ses dernières colonnes
      // vides (le `restval` de Python) ; une plus longue garde ses colonnes nommées.
      var x = {};
      entete.forEach(function (c, k) { x[c] = k < valeurs.length ? valeurs[k] : null; });
      var cle = JSON.stringify([x.title, x.start_time]);
      if (!Object.prototype.hasOwnProperty.call(index, cle)) {
        var s0 = {
          titre: String(x.title === null ? '' : x.title).trim(),
          debut_local: dateCsv(x.start_time),
          fin_local: vide(x.end_time) ? dateCsv(x.end_time) : null,
          note: vide(x.description), ref: null, exercices: []
        };
        s0.ref = 'hevy:' + s0.debut_local + ':00';
        index[cle] = s0; seances.push(s0);
      }
      var s = index[cle];
      var ss = vide(x.superset_id);
      var exo = s.exercices.length ? s.exercices[s.exercices.length - 1] : null;
      if (exo === null || exo.nom !== x.exercise_title || x.set_index === '0') {
        exo = { nom: x.exercise_title, note: vide(x.exercise_notes),
                groupe_superset: ss !== null ? entier(ss) : null, series: [] };
        s.exercices.push(exo);
      }
      var kg = vide(x.weight_kg);
      if (kg === null && vide(x.weight_lbs)) kg = dixieme(nombreLu(x.weight_lbs) * LIVRE);
      var dist = vide(x.distance_km), dur = vide(x.duration_seconds);
      if (!Object.prototype.hasOwnProperty.call(TYPES_CSV, x.set_type)) {
        throw erreurExport('type de série inconnu : ' + x.set_type);
      }
      exo.series.push({
        type_serie: TYPES_CSV[x.set_type],
        charge_kg: nombre(kg),
        reps: vide(x.reps) ? entier(x.reps) : null,
        // Une distance ou une durée à 0 est VIDE (§2.4 quater).
        duree_s: dur && nombreLu(dur) > 0 ? Math.trunc(nombreLu(dur)) : null,
        distance_m: dist && nombreLu(dist) > 0 ? nombre(nombreLu(dist) * 1000) : null,
        rpe: nombre(vide(x.rpe))
      });
    });
    // Un superset d'un seul exercice n'en est pas un (ECRAN-SAISIE §5.9 ;
    // `v2_041`, « supersets orphelins »).
    seances.forEach(function (s) {
      var noms = {};
      s.exercices.forEach(function (e) {
        if (e.groupe_superset === null) return;
        (noms[e.groupe_superset] = noms[e.groupe_superset] || {})[e.nom] = true;
      });
      s.exercices.forEach(function (e) {
        if (e.groupe_superset !== null && Object.keys(noms[e.groupe_superset]).length < 2) e.groupe_superset = null;
      });
    });
    return seances;
  }

  // ── L'heure ─────────────────────────────────────────────────────────────
  //
  // Hevy écrit l'heure LOCALE, sans fuseau. Elle se lit dans le fuseau du
  // téléphone et part en base en heure UNIVERSELLE. (L'import CSV d'août
  // l'avait écrite telle quelle : 1 221 séances décalées de 1 à 2 h, corrigées
  // par `v2_075`.)
  var formats = {};
  function formatDe(fuseau) {
    if (!formats[fuseau]) {
      formats[fuseau] = new Intl.DateTimeFormat('en-US', {
        timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return formats[fuseau];
  }
  // Le décalage du fuseau à l'instant `t` (ms), en ms : heure locale − heure universelle.
  function decalage(t, fuseau) {
    var p = {};
    formatDe(fuseau).formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
    var h = Number(p.hour) % 24;
    var local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute), Number(p.second));
    return local - Math.floor(t / 1000) * 1000;
  }

  function fuseauDuTelephone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch (e) { return 'UTC'; }
  }

  // « 2026-09-22T17:12 » (heure locale de `fuseau`) → « 2026-09-22T15:12:00Z ».
  //
  // ⚠️ LES DEUX CHANGEMENTS D'HEURE, comme `zoneinfo` (`fold=0`) :
  //   · l'heure qui revient (octobre, 2 h 30 vécue deux fois) : la PREMIÈRE ;
  //   · l'heure qui manque (mars, 2 h 30 n'existe pas) : lue avec le décalage
  //     d'AVANT le saut.
  // Une séance n'y commence pratiquement jamais ; la règle est écrite pour que
  // la même heure donne toujours le même instant — l'anti-doublon en dépend.
  function versUTC(local, fuseau) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(local || ''));
    if (!m) throw new Error('heure illisible : ' + local);
    var naif = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
    var f = fuseau || fuseauDuTelephone();
    var avant = decalage(naif - 86400000, f), apres = decalage(naif + 86400000, f);
    var c1 = naif - avant, c2 = naif - apres;
    var t = c1;
    if (avant !== apres && decalage(c1, f) !== avant && decalage(c2, f) === apres) t = c2;
    return new Date(t).toISOString().replace(/\.000Z$/, 'Z');
  }

  // ── Les noms ────────────────────────────────────────────────────────────
  //
  // Un nom se cherche, sans accents ni casse, dans le catalogue
  // (`exercises.nom`), puis dans les rattachements de la personne
  // (`alias_exercice`), puis dans les noms communs (`exercise_alias`). Le
  // premier trouvé fait foi. 137 (audit du 16/10, 03 #13) : ce que la personne
  // a rattachée elle-même passe avant un nom commun — un nom commun ne défait
  // jamais un choix de la personne.
  //   `sources` : { catalogue: [{ slug, nom }], communs: [{ alias, slug }],
  //                 miens: [{ alias, exercise_slug }] }
  function indexDesNoms(sources) {
    var s = sources || {}, index = {};
    var poser = function (nom, slug) {
      var k = norme(nom);
      if (!k || !slug || Object.prototype.hasOwnProperty.call(index, k)) return;
      index[k] = slug;
    };
    (s.catalogue || []).forEach(function (e) { if (e) poser(e.nom, e.slug); });
    (s.miens || []).forEach(function (a) { if (a) poser(a.alias, a.exercise_slug); });
    (s.communs || []).forEach(function (a) { if (a) poser(a.alias, a.slug); });
    return index;
  }

  function slugDuNom(index, nom) {
    var k = norme(nom);
    return Object.prototype.hasOwnProperty.call(index || {}, k) ? index[k] : null;
  }

  // La séance lue, avec son heure universelle et ses exercices résolus
  // (`exercise_slug` null : à rattacher).
  function preparer(lue, index, fuseau) {
    return Object.assign({}, lue, {
      debut: versUTC(lue.debut_local, fuseau),
      fin: lue.fin_local ? versUTC(lue.fin_local, fuseau) : null,
      exercices: lue.exercices.map(function (e) {
        return Object.assign({}, e, { exercise_slug: slugDuNom(index, e.nom) });
      })
    });
  }

  // ── L'anti-doublon ──────────────────────────────────────────────────────
  //
  // Contre TOUTES les séances de la personne (`base` : `{ source_ref, debut,
  // fin, slugs }`) :
  //   · `deja_la` : même référence d'import, OU même minute de début, quelle
  //     que soit l'origine — grisée, jamais écrite ;
  //   · `meme_seance` : elle CHEVAUCHE une séance de la personne — chacune
  //     commence avant que l'autre finisse ; fin inconnue, d'un côté ou de
  //     l'autre : 3 h au plus, MOTEUR §12.2 bis — ET partage au moins un
  //     exercice avec elle — décochée. (81, 12/10/2026 : « commence pendant »
  //     laissait passer la séance démarrée dans Hevy avant l'app.) ;
  //   · `nouvelle` sinon. Deux activités qui se suivent ne se chevauchent pas.
  var TROIS_HEURES = 3 * 3600 * 1000;
  function minute(iso) { var t = Date.parse(iso); return isNaN(t) ? null : Math.floor(t / 60000); }

  // Rend `{ verdict, avec }` : `avec`, la séance de la personne qui l'a décidé.
  function verdictDetaille(seance, base) {
    var d = minute(seance.debut);
    var slugs = {};
    (seance.exercices || []).forEach(function (e) { if (e.exercise_slug) slugs[e.exercise_slug] = true; });
    var liste = base || [];
    for (var i = 0; i < liste.length; i++) {
      var b = liste[i];
      if (!b) continue;
      if ((b.source_ref && b.source_ref === seance.ref) || (d !== null && minute(b.debut) === d)) {
        return { verdict: 'deja_la', avec: b };
      }
    }
    var t = d === null ? null : d * 60000;
    var fi = seance.fin ? Date.parse(seance.fin) : NaN;
    if (t !== null && isNaN(fi)) fi = t + TROIS_HEURES;
    for (var j = 0; j < liste.length; j++) {
      var x = liste[j];
      if (!x || t === null) continue;
      var db = Date.parse(x.debut);
      var fb = x.fin ? Date.parse(x.fin) : db + TROIS_HEURES;
      if (isNaN(db) || !(t < fb && db < fi)) continue;
      if ((x.slugs || []).some(function (s) { return !!s && slugs[s]; })) return { verdict: 'meme_seance', avec: x };
    }
    return { verdict: 'nouvelle', avec: null };
  }

  function verdict(seance, base) { return verdictDetaille(seance, base).verdict; }

  // ── L'aperçu ────────────────────────────────────────────────────────────
  //
  // Les séances lues, préparées, avec leur verdict ; la case : cochée pour une
  // nouvelle, décochée pour « sans doute la même », absente pour « déjà là ».
  function apercu(lues, contexte) {
    var c = contexte || {};
    var index = indexDesNoms(c.sources);
    return lues.map(function (lue) {
      var s = preparer(lue, index, c.fuseau);
      var v = verdictDetaille(s, c.base);
      return {
        seance: s, verdict: v.verdict, avec: v.avec,
        coche: v.verdict === 'nouvelle',
        exercices: s.exercices.length,
        series: s.exercices.reduce(function (n, e) { return n + e.series.length; }, 0)
      };
    });
  }

  // ⚠️ 118 (audit du 16/10, 03 #2) — L'APERÇU SE RECALCULE APRÈS CHAQUE RATTACHEMENT. Un nom pas encore rattaché
  // n'a pas d'exercice : la séance faite dans l'app ET dans Hevy ne partageait donc aucun exercice avec celle de
  // l'app, ressortait « nouvelle », cochée — et, une fois le nom rattaché, partait en double. Ici, chaque ligne
  // reprend ses exercices avec l'index d'aujourd'hui et son verdict contre `base`. Un verdict qui CHANGE prend la
  // case de son nouveau verdict (« sans doute la même » : décochée) ; un verdict qui ne change pas garde la case
  // telle que la personne l'a laissée. Rien n'est muté.
  function recalculer(lignes, contexte) {
    var c = contexte || {};
    var index = indexDesNoms(c.sources);
    return (lignes || []).map(function (l) {
      var s = Object.assign({}, l.seance, {
        exercices: l.seance.exercices.map(function (e) {
          return Object.assign({}, e, { exercise_slug: slugDuNom(index, e.nom) });
        })
      });
      var v = verdictDetaille(s, c.base);
      return Object.assign({}, l, {
        seance: s, verdict: v.verdict, avec: v.avec,
        coche: v.verdict === l.verdict ? l.coche : v.verdict === 'nouvelle'
      });
    });
  }

  // Les noms à rattacher dans les séances COCHÉES, dans l'ordre où ils
  // apparaissent : `{ nom, series, seances }`. Un nom déjà rattaché (index) ou
  // laissé de côté n'y est plus ; `ignores` : `{ nom: true }`.
  function nomsARattacher(lignes, index, ignores) {
    var par = {}, ordre = [];
    (lignes || []).forEach(function (l) {
      if (!l.coche || l.verdict === 'deja_la') return;
      var vus = {};
      l.seance.exercices.forEach(function (e) {
        if (slugDuNom(index, e.nom)) return;
        if (!par[e.nom]) { par[e.nom] = { nom: e.nom, series: 0, seances: 0, ignore: !!(ignores && ignores[e.nom]) }; ordre.push(e.nom); }
        par[e.nom].series += e.series.length;
        if (!vus[e.nom]) { par[e.nom].seances++; vus[e.nom] = true; }
      });
    });
    return ordre.map(function (n) { return par[n]; });
  }

  // « Importer » attend que chaque nom soit rattaché ou laissé de côté.
  function pretAImporter(lignes, index, ignores) {
    var n = (lignes || []).filter(function (l) { return l.coche && l.verdict !== 'deja_la'; }).length;
    return n > 0 && nomsARattacher(lignes, index, ignores).every(function (x) { return x.ignore; });
  }

  // ── Ce qui s'écrit ──────────────────────────────────────────────────────
  //
  // La séance sous la forme du modèle de l'app, prête pour
  // `THSeance.ligneSession` et `THSeance.lignes` — les deux seules portes vers
  // les colonnes (`verifierColonnes`). Les séries d'un exercice laissé de côté
  // (ou encore sans nom) ne partent pas ; les autres sont numérotées dans
  // l'ordre de lecture (`rang`, 1…n).
  //   `ids` : `{ seance, serie(rang) }` — les identifiants tirés du nom
  //   (`THMoteur.idDImport`), calculés par l'appelant.
  //   `index` : les noms résolus au moment d'écrire.
  // Rend null si aucune série ne part : une séance vide n'est pas importée.
  function seanceAEcrire(s, ids, index, userId) {
    var rang = 0;
    var exercices = [];
    s.exercices.forEach(function (e) {
      var slug = slugDuNom(index, e.nom);
      if (!slug || !e.series.length) return;
      exercices.push({
        exercise_slug: slug, note: e.note, groupe_superset: e.groupe_superset,
        series: e.series.map(function (x) {
          rang++;
          // Prompt 131 — Hevy n'exporte ni D+ ni étages : toutes les colonnes de mesure partent à
          // `null` (la table des champs, `colonnesDeSerie`), puis celles que Hevy porte.
          var vides = {};
          Mo().colonnesDeSerie().forEach(function (c) { vides[c] = null; });
          return Object.assign(vides, {
            id: ids.serie(rang), source: 'hevy', type_serie: x.type_serie,
            charge_kg: x.charge_kg, reps: x.reps, duree_s: x.duree_s, distance_m: x.distance_m,
            // `sets_rpe_ok` : 0 < rpe ≤ 10. Hors de là, la ligne serait refusée
            // (23514, définitif) et bloquerait la file : le RPE ne part pas.
            rpe: typeof x.rpe === 'number' && x.rpe > 0 && x.rpe <= 10 ? x.rpe : null,
            ressenti: null, note: null, validee_a: null, repos_s: null,
            rang_origine: rang
          });
        })
      });
    });
    if (!rang) return null;
    return {
      id: ids.seance, user_id: userId, debut: s.debut, fin: s.fin || null,
      titre: s.titre || null, note: s.note || null, salle: null, routine_id: null,
      source: 'hevy', source_ref: s.ref, statut: 'terminee',
      exercices: exercices
    };
  }

  // ⚠️ LES RECORDS D'UN IMPORT : seulement pour une séance PLUS RÉCENTE QUE
  // LA DERNIÈRE SÉANCE DÉJÀ LÀ de la personne (`base`, relevée avant d'écrire),
  // dans l'ordre des dates. Plus ancienne, aucun : le journal ne se réécrit
  // pas, et un record inscrit après coup dans le passé serait faux pour tout ce
  // qui a suivi. Rend les séances retenues, de la plus ancienne à la plus récente.
  function avecRecords(seances, base) {
    var derniere = -Infinity;
    (base || []).forEach(function (b) {
      var t = b ? Date.parse(b.debut) : NaN;
      if (!isNaN(t) && t > derniere) derniere = t;
    });
    return (seances || []).filter(function (s) { return s && Date.parse(s.debut) > derniere; })
      .sort(function (a, b) { return Date.parse(a.debut) - Date.parse(b.debut); });
  }

  // Le nombre de séries qui partiront (pour la file et la progression).
  function seriesAEcrire(s, index) {
    return s.exercices.reduce(function (n, e) { return n + (slugDuNom(index, e.nom) ? e.series.length : 0); }, 0);
  }

  // ── Les mots de l'écran (au mot près, K1 et la maquette) ─────────────────
  function lireLocal(local) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ''));
    if (!m) return null;
    return { a: Number(m[1]), mo: Number(m[2]), j: Number(m[3]), h: Number(m[4]), mi: Number(m[5]),
             js: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() };
  }
  function heureDite(h, mi) { return h + ' h ' + deux(mi); }

  // « samedi 19 sept. · 19 h 31 » (l'année si elle n'est pas `anneeRef`).
  function jourEtHeure(local, anneeRef) {
    var d = lireLocal(local);
    if (!d) return '';
    return Mo().JOURS[d.js] + ' ' + d.j + ' ' + Mo().MOIS_COURTS[d.mo - 1] + (d.a !== anneeRef ? ' ' + d.a : '') +
      ' · ' + heureDite(d.h, d.mi);
  }

  // « Du samedi 19 au vendredi 25 septembre » ; une seule date : « Le samedi 19 septembre ».
  function periode(lignes, anneeRef) {
    var locs = (lignes || []).map(function (l) { return l.seance.debut_local; }).filter(Boolean).sort();
    if (!locs.length) return '';
    var a = lireLocal(locs[0]), b = lireLocal(locs[locs.length - 1]);
    var jour = function (d) { return Mo().JOURS[d.js] + ' ' + d.j; };
    var annee = function (d) { return d.a !== anneeRef ? ' ' + d.a : ''; };
    if (locs[0].slice(0, 10) === locs[locs.length - 1].slice(0, 10)) {
      return 'Le ' + jour(a) + ' ' + Mo().MOIS_LONGS[a.mo - 1] + annee(a);
    }
    if (a.a === b.a && a.mo === b.mo) return 'Du ' + jour(a) + ' au ' + jour(b) + ' ' + Mo().MOIS_LONGS[b.mo - 1] + annee(b);
    if (a.a === b.a) return 'Du ' + jour(a) + ' ' + Mo().MOIS_LONGS[a.mo - 1] + ' au ' + jour(b) + ' ' + Mo().MOIS_LONGS[b.mo - 1] + annee(b);
    return 'Du ' + jour(a) + ' ' + Mo().MOIS_LONGS[a.mo - 1] + ' ' + a.a + ' au ' + jour(b) + ' ' + Mo().MOIS_LONGS[b.mo - 1] + ' ' + b.a;
  }

  function pluriel(n, un, plusieurs) { return n + ' ' + (n > 1 ? plusieurs : un); }

  // L'heure d'un instant dans le fuseau du téléphone : « 17 h 40 ».
  function heureDansFuseau(iso, fuseau) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var p = {};
    formatDe(fuseau || fuseauDuTelephone()).formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
    return heureDite(Number(p.hour) % 24, Number(p.minute));
  }

  // La sous-ligne d'une séance de l'aperçu : ses exercices, ou son verdict.
  // « sans doute la même » dit l'heure de la séance de la personne, dans le
  // fuseau du téléphone.
  function sousLigne(l, fuseau) {
    if (l.verdict === 'deja_la') return 'Déjà dans l’app — laissée telle quelle';
    if (l.verdict === 'meme_seance') {
      return 'Une séance de l’app commence à ' + heureDansFuseau(l.avec.debut, fuseau) + ' ce jour-là : sans doute la même.';
    }
    return pluriel(l.exercices, 'exercice', 'exercices') + ' · ' + pluriel(l.series, 'série', 'séries');
  }

  // Les deux phrases de la fin. « 1 était déjà dans l'app, 1 laissée de côté. »
  function phrasesDeFin(r) {
    var n = r.importees, k = r.dejaLa, j = r.deCote;
    var morceaux = [];
    if (k) morceaux.push(k + (k > 1 ? ' étaient' : ' était') + ' déjà dans l’app');
    if (j) morceaux.push(j + (j > 1 ? ' laissées' : ' laissée') + ' de côté');
    return {
      titre: n + (n > 1 ? ' séances importées.' : ' séance importée.'),
      detail: morceaux.length ? morceaux.join(', ') + '.' : null,
      suite: n > 1 ? 'Elles comptent dès maintenant pour ton coach et ta progression.'
        : n === 1 ? 'Elle compte dès maintenant pour ton coach et ta progression.' : null
    };
  }

  var MESSAGES = {
    texte: 'Je ne reconnais pas ce texte. Copie-le depuis Hevy : une séance → Partager → Copier.',
    fichier: 'Ce fichier n’est pas un export de séances Hevy.',
    // 118 (audit du 16/10, 03 #12) — un Hevy réglé en anglais : ce n'est pas « pas un export ».
    fichierAnglais: 'Export en anglais : change la langue de Hevy en français et réexporte.',
    texteAnglais: 'Texte en anglais : change la langue de Hevy en français et copie-le de nouveau.',
    connexion: 'L’import demande une connexion.',
    attend: 'Le bouton attend que chaque exercice soit rattaché ou laissé de côté.',
    souvenir: 'Je m’en souviendrai pour tes prochains imports.',
    nePasImporter: 'Ne pas importer cet exercice'
  };

  // Le titre de la feuille de rattachement : « « Good Morning (Barre) » chez Hevy, c'est… ».
  function titreRattacher(nom) { return '« ' + nom + ' » chez Hevy, c’est…'; }
  // 126 (ECRAN-SAISIE §7 quindecies.11) — la recherche n'est plus pré-remplie avec le nom Hevy : le champ s'ouvre vide,
  // et « Les plus proches » (`Routines.plusProches`) disent pourquoi.

  var api = {
    norme: norme,
    lireTexte: lireTexte,
    lireCsv: lireCsv,
    lignesCsv: lignesCsv,
    versUTC: versUTC,
    fuseauDuTelephone: fuseauDuTelephone,
    indexDesNoms: indexDesNoms,
    slugDuNom: slugDuNom,
    preparer: preparer,
    verdict: verdict,
    verdictDetaille: verdictDetaille,
    apercu: apercu,
    recalculer: recalculer,
    nomsARattacher: nomsARattacher,
    pretAImporter: pretAImporter,
    seanceAEcrire: seanceAEcrire,
    avecRecords: avecRecords,
    seriesAEcrire: seriesAEcrire,
    jourEtHeure: jourEtHeure,
    periode: periode,
    sousLigne: sousLigne,
    heureDansFuseau: heureDansFuseau,
    phrasesDeFin: phrasesDeFin,
    titreRattacher: titreRattacher,
    MESSAGES: MESSAGES
  };

  racine.THImportHevy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
