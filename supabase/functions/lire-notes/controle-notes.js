// supabase/functions/lire-notes/controle-notes.js — les contrôles de « Lire mes notes » (250, L9).
//
// PUR : aucun Deno, aucun réseau ; testé par Jest (tests/unit/v2-notes-ia-controle.test.js). L'IA ne décide rien : elle rend des
// CODES dans un schéma fermé et un extrait ; ce fichier vérifie, un à un, que chaque code est tenu par les mots de la note et par
// les séries envoyées. Une proposition qui échoue à UN contrôle est jetée, sans appel de remplacement.
//
// Les motifs (tiers, santé incidente, injection, mots d'entraînement) sont les MÊMES CHAÎNES que `v2/js/notes-ia.js` : un test
// prouve l'identité des deux listes. Les contrôles communs (estSante, sansDate, normaliser…) viennent de
// ../demander-coach/controle.js, chargé avant ce fichier (`globalThis.THControle`) ; ce dossier-là ne change pas.
//
// Corps reçu : { exercices: [{ i, nom, series: [{ type, kg, reps }] }], notes: [{ id: 'n1', i: <rang|null>, texte }] }
// Sortie du modèle : { propositions: [{ note, genre, extrait, series, rpe, reserve, type, exercice }] }
(function (racine) {
  'use strict';

  var MAX_EXERCICES = 12;
  var MAX_NOTES = 8;
  var MAX_SIGNES = 500;
  var MAX_NOM = 120;
  var MAX_SERIES = 12;
  var GENRES = ['effort', 'type_serie', 'reglage'];
  var CLES_PROPOSITION = ['note', 'genre', 'extrait', 'series', 'rpe', 'reserve', 'type', 'exercice'];

  // Mêmes chaînes que v2/js/notes-ia.js (test d'identité).
  var MOTIF_TIERS = "\\[quelqu'un\\]|@[a-z_]\\w*|\\b(?:il|elle|sa|son|ses|mon pote|ma pote|mon binome|ma binome|mon partenaire|ma partenaire|mon coach)\\b";
  var MOTIF_SANTE_INCIDENTE = '\\b(?:malade|maladie|grippe|covid|fievre|kine|kinesi\\w*|osteo\\w*|medecin|docteur|medic\\w*|traitement|operation|opere|chirurg\\w*|enceinte|grossesse|migraine|sommeil|insomnie)\\b';
  var MOTIF_INJECTION = '\\b(?:ignore|instruction|prompt|system|consigne|reponds)|[{}<>]|https?://|www\\.';
  var MOTIF_CANDIDAT = '\\b(?:rpe|r p e|rir|reserve|restait|a fond|drop|degressi|echec|fail|left|last set|cran|siege|secu|reglage)|@\\d';
  var RE_IL_DE_SOI = /\bil (?:m'en|m'|me|nous) ?(?:en )?rest\w*|\bil y (?:a|avait|aura)\b|\bil (?:faut|fallait)\b/g;
  var RE_TIERS = new RegExp(MOTIF_TIERS);
  var RE_SANTE_INCIDENTE = new RegExp(MOTIF_SANTE_INCIDENTE);
  var RE_INJECTION = new RegExp(MOTIF_INJECTION);

  // Ce qui prouve un effort dans les mots (C8) : sans l'un d'eux, un nombre qui est aussi une charge ou des reps ne dit rien.
  var RE_MARQUEUR_EFFORT = /\b(?:rpe|r p e|rir|reserve|restait|reste|left|fond|marge)\b|@/;

  var NOMBRES_EN_MOTS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
                          one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10 };
  var RANGS_EN_MOTS = { premiere: 1, premier: 1, deuxieme: 2, seconde: 2, troisieme: 3, quatrieme: 4, cinquieme: 5, sixieme: 6 };
  var MOTS_ZERO = /\b(?:zero|rien|fond|marge|limite|0)\b/;

  function THC() {
    var c = racine.THControle;
    if (!c && typeof require === 'function') c = require('../demander-coach/controle.js');
    return c;
  }
  function norm(t) { return THC().normaliser(t); }
  // La note part nettoyée (`sansDate` retire l'espace avant , . : ;) : on compare à la même aune que le téléphone.
  function lisse(t) { return norm(t).replace(/ +([,.:;])/g, '$1'); }

  function estNombre(v) { return typeof v === 'number' && isFinite(v); }
  function estTexte(v, max) { return typeof v === 'string' && v.length <= max; }
  function cles(o) { return Object.keys(o); }

  // ── Le corps reçu : liste blanche ───────────────────────────────────────────
  function verifierCorps(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, raison: 'corps' };
    if (cles(c).some(function (k) { return k !== 'exercices' && k !== 'notes'; })) return { ok: false, raison: 'cle' };
    if (!Array.isArray(c.exercices) || c.exercices.length > MAX_EXERCICES) return { ok: false, raison: 'exercices' };
    if (!Array.isArray(c.notes) || c.notes.length > MAX_NOTES) return { ok: false, raison: 'notes' };
    var bon = c.exercices.every(function (e, k) {
      if (!e || typeof e !== 'object' || cles(e).some(function (x) { return ['i', 'nom', 'series'].indexOf(x) < 0; })) return false;
      if (e.i !== k || !estTexte(e.nom, MAX_NOM)) return false;
      if (!Array.isArray(e.series) || e.series.length > MAX_SERIES) return false;
      return e.series.every(function (s) {
        return s && typeof s === 'object' && cles(s).length === 3 && typeof s.type === 'string' && s.type.length <= 20 &&
          estNombre(s.kg) && estNombre(s.reps);
      });
    });
    if (!bon) return { ok: false, raison: 'exercice' };
    var ids = {};
    var notesBonnes = c.notes.every(function (n) {
      if (!n || typeof n !== 'object' || cles(n).some(function (x) { return ['id', 'i', 'texte'].indexOf(x) < 0; })) return false;
      if (!/^n\d{1,2}$/.test(n.id) || ids[n.id]) return false;
      ids[n.id] = true;
      if (!(n.i === null || (Number.isInteger(n.i) && n.i >= 0 && n.i < c.exercices.length))) return false;
      return estTexte(n.texte, MAX_SIGNES) && n.texte.trim().length > 0;
    });
    if (!notesBonnes) return { ok: false, raison: 'note' };
    var tout = c.notes.map(function (n) { return n.texte; }).concat(c.exercices.map(function (e) { return e.nom; }));
    var THCx = THC();
    if (tout.some(function (t) { return THCx.contientDate(t) || /https?:\/\/|www\./i.test(t); })) {
      return { ok: false, raison: 'date_ou_lien' };
    }
    return { ok: true };
  }

  // ── Une note a-t-elle le droit de partir ? (côté serveur, en plus du téléphone) ───────────────────────────────────────────
  // Rend la raison du retrait, ou null.
  function raisonDeRetrait(texte) {
    var n = norm(texte);
    if (THC().estSante(texte)) return 'sante';
    if (RE_SANTE_INCIDENTE.test(n)) return 'sante_incidente';
    if (RE_INJECTION.test(n)) return 'injection';
    if (RE_TIERS.test(n.replace(RE_IL_DE_SOI, ' '))) return 'tiers';
    return null;
  }
  // Retire du corps les notes qui ne devaient pas partir (avant l'appel du modèle) : rend { corps, retirees }.
  function purger(c) {
    var retirees = 0;
    var notes = c.notes.filter(function (n) {
      if (raisonDeRetrait(n.texte)) { retirees++; return false; }
      return true;
    });
    return { corps: { exercices: c.exercices, notes: notes }, retirees: retirees };
  }

  // ── Les nombres des mots (C2, C8) ───────────────────────────────────────────
  function nombresDesMots(extrait) {
    var n = norm(extrait);
    var out = THC().nombresDe(n, true);
    n.split(/[^a-z0-9]+/).forEach(function (m) {
      if (Object.prototype.hasOwnProperty.call(NOMBRES_EN_MOTS, m)) out.push(NOMBRES_EN_MOTS[m]);
      if (Object.prototype.hasOwnProperty.call(RANGS_EN_MOTS, m)) out.push(RANGS_EN_MOTS[m]);
    });
    return out;
  }

  function codeDeRang(code) {
    var m = /^s(\d{1,2})$/.exec(String(code));
    return m ? Number(m[1]) : 0;
  }

  // ── Les contrôles, proposition par proposition ──────────────────────────────
  function controlerUne(p, corps, vus) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    if (cles(p).some(function (k) { return CLES_PROPOSITION.indexOf(k) < 0; })) return null;          // C3 : aucun champ inattendu
    if (GENRES.indexOf(p.genre) < 0) return null;
    var note = null;
    corps.notes.forEach(function (n) { if (n.id === p.note) note = n; });
    if (!note || typeof p.extrait !== 'string') return null;

    // C1 — l'extrait est une sous-chaîne de la note citée
    var e = lisse(p.extrait).trim();
    if (e.length < 2 || lisse(note.texte).indexOf(e) < 0) return null;
    // C9 — un tiers dans l'extrait
    if (RE_TIERS.test(e.replace(RE_IL_DE_SOI, ' '))) return null;
    // C7 — la note citée repasse la santé (large + incidente)
    if (raisonDeRetrait(note.texte)) return null;

    // l'exercice : celui de la note, ou celui que le modèle désigne pour une note de séance
    var iExo = note.i;
    if (iExo === null || iExo === undefined) {
      if (!Number.isInteger(p.exercice) || p.exercice < 0 || p.exercice >= corps.exercices.length) return null;
      iExo = p.exercice;
    } else if (p.exercice !== null && p.exercice !== undefined && p.exercice !== iExo) return null;
    var exo = corps.exercices[iExo];
    if (!exo) return null;

    // C5 — une par (exercice, genre)
    var cle = p.genre + ':' + iExo;
    if (vus[cle]) return null;

    var vide = function (v) { return v === null || v === undefined; };
    if (p.genre === 'reglage') {
      // C3 : rien d'autre que l'extrait
      if (!vide(p.series) || !vide(p.rpe) || !vide(p.reserve) || !vide(p.type)) return null;
      vus[cle] = true;
      return { note: p.note, genre: 'reglage', extrait: p.extrait, series: null, rpe: null, reserve: null, type: null, exercice: iExo };
    }

    // les séries désignées (C3 : liste fermée, jamais « toutes » pour une dégressive/échec)
    var codes = ['derniere', 'deux_dernieres'];
    if (p.genre === 'effort') codes.push('toutes');
    var rang = codeDeRang(p.series);
    if (typeof p.series !== 'string' || (codes.indexOf(p.series) < 0 && !rang)) return null;
    var total = exo.series.length;
    var visees;                                                                                      // C4 : la série existe
    if (p.series === 'derniere') visees = total >= 1 ? [total - 1] : [];
    else if (p.series === 'deux_dernieres') visees = total >= 2 ? [total - 2, total - 1] : [];
    else if (p.series === 'toutes') visees = exo.series.map(function (s, k) { return k; });
    else visees = rang >= 1 && rang <= total ? [rang - 1] : [];
    if (!visees.length) return null;
    var travail = visees.filter(function (k) { return exo.series[k].type === 'travail'; });
    if (p.series === 'toutes' ? !travail.length : travail.length !== visees.length) return null;   // C4 : de travail

    var nombres = nombresDesMots(p.extrait);
    // C2 — un rang `sN` figure dans l'extrait
    if (rang && nombres.indexOf(rang) < 0) return null;

    if (p.genre === 'type_serie') {
      if (p.type !== 'echec' && p.type !== 'degressive') return null;
      if (!vide(p.rpe) || !vide(p.reserve)) return null;
      vus[cle] = true;
      return { note: p.note, genre: 'type_serie', extrait: p.extrait, series: p.series, rpe: null, reserve: null, type: p.type, exercice: iExo };
    }

    // effort : un rpe entier de 5 à 10 XOR une réserve de 0 à 3
    if (!vide(p.type)) return null;
    var aRpe = !vide(p.rpe);
    var aReserve = !vide(p.reserve);
    if (aRpe === aReserve) return null;
    var valeur;
    if (aRpe) {
      if (!Number.isInteger(p.rpe) || p.rpe < 5 || p.rpe > 10) return null;
      valeur = p.rpe;
    } else {
      // la réserve est un code texte : '0', '1', '2', '3+' (le schéma est fermé)
      var m = { '0': 0, '1': 1, '2': 2, '3': 3, '3+': 3 };
      if (typeof p.reserve !== 'string' || !Object.prototype.hasOwnProperty.call(m, p.reserve)) return null;
      valeur = m[p.reserve];
    }
    // C2 — le nombre figure dans l'extrait (un zéro se dit aussi « rien », « à fond », « sans marge »)
    var dit = nombres.indexOf(valeur) >= 0 || (aReserve && valeur === 0 && MOTS_ZERO.test(e));
    if (!dit) return null;
    // C8 — un nombre qui est aussi des reps ou une charge de la série visée, sans marqueur d'effort : pas un effort
    if (!RE_MARQUEUR_EFFORT.test(e)) {
      var egal = visees.some(function (k) { return exo.series[k].reps === valeur || exo.series[k].kg === valeur; });
      if (egal) return null;
    }
    vus[cle] = true;
    return { note: p.note, genre: 'effort', extrait: p.extrait, series: p.series, rpe: aRpe ? p.rpe : null, reserve: aReserve ? p.reserve : null, type: null, exercice: iExo };
  }

  // `controler(sortie, corps)` → les propositions gardées (jamais une exception : toute entrée bancale rend []).
  function controler(sortie, corps) {
    try {
      if (!sortie || typeof sortie !== 'object' || !Array.isArray(sortie.propositions)) return [];
      var vus = {};
      var out = [];
      sortie.propositions.forEach(function (p) {
        var r = controlerUne(p, corps, vus);
        if (r) out.push(r);
      });
      return out;
    } catch (_e) { return []; }
  }

  // C6 — la réponse de l'API : `stop_reason` ≠ `end_turn`, JSON invalide, texte vide → null.
  function sortieDeLaReponse(reponse) {
    try {
      if (!reponse || reponse.stop_reason !== 'end_turn') return null;
      var texte = (reponse.content || []).filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text; }).join('');
      if (!texte) return null;
      var j = JSON.parse(texte);
      return j && typeof j === 'object' ? j : null;
    } catch (_e) { return null; }
  }

  var api = {
    verifierCorps: verifierCorps, controler: controler, purger: purger, raisonDeRetrait: raisonDeRetrait, sortieDeLaReponse: sortieDeLaReponse,
    MOTIF_TIERS: MOTIF_TIERS, MOTIF_SANTE_INCIDENTE: MOTIF_SANTE_INCIDENTE, MOTIF_INJECTION: MOTIF_INJECTION, MOTIF_CANDIDAT: MOTIF_CANDIDAT,
    MAX_EXERCICES: MAX_EXERCICES, MAX_NOTES: MAX_NOTES, MAX_SIGNES: MAX_SIGNES, MAX_NOM: MAX_NOM, MAX_SERIES: MAX_SERIES
  };
  racine.THControleNotes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
