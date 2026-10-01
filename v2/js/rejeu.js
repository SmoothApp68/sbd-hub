// v2/js/rejeu.js — l'outil de rejeu d'une séance (développement seulement).
//
// « Les phrases ne sont pas enregistrées, mais `planDeSeance` est pure : sur
// les mêmes entrées, elle rend les mêmes phrases. » (diagnostic du 01/10/2026)
//
// `…/saisie?rejouer=<id de séance>`, LÀ OÙ LA GARDE DU COACH EST ACTIVE
// (`localhost`, une prévisualisation `*.pages.dev`, `?garde=1`) — JAMAIS en
// production. L'app (`app.js`, `rejouerSeance`) reconstruit les entrées du
// plan telles qu'elle les avait à l'ouverture de la séance, puis après chaque
// série validée, dans l'ordre réel de `validee_a`, et passe chaque plan à ce
// module, qui n'en fait que du TEXTE.
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache ; il n'écrit
// rien. Il lit THModele (le formateur des nombres) à l'appel. Il ne calcule
// AUCUNE décision du coach : il recopie ce que le plan dit.

(function (racine) {
  'use strict';

  function Modele() { return racine.THModele; }

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // L'identifiant demandé par l'adresse, ou `null`. `gardeActive` : la garde
  // du coach (`THPlan.gardeActive`) — sans elle, jamais rien : c'est ce qui
  // rend l'outil inactif en production.
  function demande(location, gardeActive) {
    if (!gardeActive) return null;
    var m = /[?&]rejouer=([^&#]*)/.exec(String((location && location.search) || ''));
    if (!m) return null;
    var id = decodeURIComponent(m[1] || '').trim();
    return UUID.test(id) ? id.toLowerCase() : null;
  }

  function typeDe(s) { return (s && s.type_serie) || 'travail'; }

  // ── CE QUI EXISTAIT À L'OUVERTURE ────────────────────────────────────────
  //
  // La base ne garde que les séries VALIDÉES : une ligne jamais validée n'y est
  // pas, et l'instant où une ligne a été ajoutée n'est écrit nulle part. On
  // s'appuie donc sur la routine (sa structure ACTUELLE), comme la séance au
  // démarrage (`Seance.creer`) : chaque ligne programmée existait à
  // l'ouverture — la k-ième ligne d'un type ↔ la k-ième série de ce type en
  // base ; une ligne programmée qu'aucune série ne remplit (jamais validée) est
  // RECONSTRUITE, vide ; un exercice de la routine absent de la base aussi.
  // Les séries en base qu'aucune ligne programmée n'explique ont été ajoutées en
  // cours de séance (« + Série », chauffes acceptées, ligne de plus, exercice
  // ajouté) : elles n'apparaissent qu'à leur validation. Sans routine, toutes
  // les séries en base sont présentes dès l'ouverture, et rien n'est
  // reconstruit.
  //
  // `exercices` : `[{ exercise_slug, series: [{ id, type_serie }] }]` (la
  // séance, dans l'ordre de la base) ; `routine` : `{ exercices: [{
  // exercise_slug, series: [{ type_serie, reps, charge_kg }] }] }` ou `null`.
  // Rend `[{ iExo, exercise_slug, lignes: [{ id, ouverture, reconstruite,
  // type_serie, reps_visees, charge_cible_kg }] }]` — `iExo` : l'exercice en
  // base, `null` pour un exercice reconstruit, placé derrière celui qui le
  // précède dans la routine.
  function structure(exercices, routine) {
    var deRoutine = (routine && routine.exercices) || [];
    var prise = deRoutine.map(function () { return false; });
    var intention = function (p) {
      return {
        reps_visees: p && p.reps !== undefined && p.reps !== null ? p.reps : null,
        charge_cible_kg: p && p.charge_kg !== undefined && p.charge_kg !== null ? p.charge_kg : null
      };
    };
    var lignesDeRoutine = function (r, enBase, cle) {
      var lignes = [];
      var parType = {};
      (enBase || []).forEach(function (s) { (parType[typeDe(s)] || (parType[typeDe(s)] = [])).push(s); });
      var vus = {};
      var progs = r && (r.series || []).length ? r.series : [{}];
      var n = 0;
      progs.forEach(function (p) {
        var t = typeDe(p);
        var k = vus[t] || 0;
        vus[t] = k + 1;
        var s = (parType[t] || [])[k];
        lignes.push(Object.assign({ id: s ? s.id : 'rejeu-' + cle + '-' + (++n), ouverture: true,
                                    reconstruite: !s, type_serie: t }, intention(p)));
      });
      return lignes;
    };
    var sortie = [];
    var rangRoutine = [];   // la position dans la routine de chaque exercice de `sortie`
    (exercices || []).forEach(function (exo, iExo) {
      var slug = exo && exo.exercise_slug;
      var j = -1;
      for (var q = 0; q < deRoutine.length && j < 0; q++) {
        if (!prise[q] && deRoutine[q] && deRoutine[q].exercise_slug === slug) j = q;
      }
      if (j >= 0) prise[j] = true;
      var enBase = ((exo && exo.series) || []).filter(function (s) { return s && s.id; });
      var lignes = j >= 0 ? lignesDeRoutine(deRoutine[j], enBase, iExo) : [];
      var prises = {};
      lignes.forEach(function (l) { prises[l.id] = true; });
      enBase.forEach(function (s) {
        if (prises[s.id]) return;
        lignes.push({ id: s.id, ouverture: !routine, reconstruite: false, type_serie: typeDe(s),
                      reps_visees: null, charge_cible_kg: null });
      });
      sortie.push({ iExo: iExo, exercise_slug: slug, lignes: lignes });
      rangRoutine.push(j);
    });
    // Les exercices de la routine que la base n'a pas : reconstruits, derrière
    // l'exercice qui les précède dans la routine.
    deRoutine.forEach(function (r, q) {
      if (prise[q] || !r) return;
      var x = { iExo: null, exercise_slug: r.exercise_slug, lignes: lignesDeRoutine(r, [], 'x' + q) };
      var ou = 0;
      rangRoutine.forEach(function (rq, k) { if (rq >= 0 && rq < q) ou = k + 1; });
      sortie.splice(ou, 0, x);
      rangRoutine.splice(ou, 0, q);
    });
    return sortie;
  }

  // Les validations dans l'ordre réel : `validee_a`, puis la position dans la
  // séance quand deux instants sont égaux. Rend `[{ iExo, iSerie, id, a }]`.
  function etapes(exercices) {
    var liste = [];
    (exercices || []).forEach(function (exo, iExo) {
      ((exo && exo.series) || []).forEach(function (s, iSerie) {
        if (s && s.validee_a) liste.push({ iExo: iExo, iSerie: iSerie, id: s.id || null, a: s.validee_a });
      });
    });
    return liste.sort(function (x, y) {
      var tx = Date.parse(x.a), ty = Date.parse(y.a);
      if (tx !== ty) return tx - ty;
      return x.iExo !== y.iExo ? x.iExo - y.iExo : x.iSerie - y.iSerie;
    });
  }

  // ── LE TEXTE ─────────────────────────────────────────────────────────────

  function nb(v) {
    if (v === null || v === undefined || v === '') return '–';
    var s = Modele() ? Modele().nombre(v) : String(v).replace('.', ',');
    return s === '' ? '–' : s;
  }
  function fois(charge, reps) { return nb(charge) + ' × ' + nb(reps); }
  function cite(t) { return '« ' + String(t) + ' »'; }

  // L'heure de Paris, à la seconde : la même sortie sur toutes les machines.
  function heure(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return String(iso || '–');
    try {
      return d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return d.toISOString().slice(11, 19) + ' UTC'; }
  }
  function date(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return String(iso || '–');
    try {
      return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + heure(iso);
    } catch (e) { return d.toISOString(); }
  }

  var NOM_ROLE = { ligne: 'ligne', test: 'test', coach: 'coach', retour: 'retour', hors: 'hors plan' };

  // Toutes les phrases d'un objet (chaînes, à toute profondeur), dans l'ordre
  // des clés : rien ne se perd de ce qu'un objet du plan dit.
  function phrasesDe(o, prefixe, sortie) {
    if (o === null || o === undefined) return sortie;
    if (typeof o === 'string') { if (o) sortie.push((prefixe ? prefixe + ' : ' : '') + cite(o)); return sortie; }
    if (Array.isArray(o)) { o.forEach(function (v, i) { phrasesDe(v, prefixe + '[' + i + ']', sortie); }); return sortie; }
    if (typeof o === 'object') {
      Object.keys(o).forEach(function (k) { phrasesDe(o[k], prefixe ? prefixe + '.' + k : k, sortie); });
    }
    return sortie;
  }

  // Le bloc d'UN exercice du plan. `o` : `{ nom, series, fantomes: { [iSerie]:
  // { charge_kg, reps } }, presentes: { [iSerie]: bool }, controles: [texte] }`.
  function texteExercice(x, o) {
    var e = o || {};
    var t = [];
    var c = x && x.consigne;
    var tete = '▸ ' + (e.nom || (x && x.slug) || '?') + ' [' + ((x && x.slug) || '?') + ']';
    if (c) {
      tete += ' · consigne ' + (c.etat || '?') + ' · zone ' + (c.zone || '–') +
        ' · palier ' + nb(c.palier) + ' · niveau ' + nb(c.niveau) + ' · n ' + nb(c.n);
      if (c.ligne) tete += ' · ligne ' + fois(c.ligne.charge, c.ligne.vise);
      if (c.haut) tete += ' · haut ' + fois(c.haut.charge, c.haut.vise) + ' (k ' + nb(c.haut.k) + ')';
    } else {
      tete += ' · sans consigne';
    }
    t.push(tete);
    if (x && x.entete) {
      if ((x.entete.jaune || []).length) t.push('  en-tête (jaune) : ' + x.entete.jaune.map(cite).join(' · '));
      if (x.entete.gris) t.push('  en-tête (gris) : ' + cite(x.entete.gris));
      if (x.entete.compteur) t.push('  compteur : ' + cite(x.entete.compteur));
      if (x.entete.plus) t.push('  série de plus : ' + cite(x.entete.plus));
    }
    if (x && x.compteur) {
      t.push('  compteur (valeur) : ' + nb(x.compteur.compteur) +
        (x.compteur.meilleur ? ' · meilleur ' + fois(x.compteur.meilleur.palier, x.compteur.meilleur.niveau) : ''));
    }
    if (x && x.escalier) {
      var esc = x.escalier;
      t.push('  escalier : marche ' + (esc.marche || '–') + ' · n ' + nb(esc.n) + ' · compteur ' + nb(esc.compteur) +
        (esc.reponse ? ' · réponse ' + esc.reponse : ''));
      phrasesDe(esc.carte || null, '', []).forEach(function (p) { t.push('    carte ' + p); });
      if (esc.repli) t.push('    repli : ' + fois(esc.repli.palier, esc.repli.niveau));
    }
    if (x && x.chauffes) {
      t.push('  chauffes : ' + (x.chauffes.phrase ? cite(x.chauffes.phrase) : '(sans phrase)') +
        ' · situation ' + (x.chauffes.situation || '–') + ' · référence ' + nb(x.chauffes.reference));
    }
    if (x && x.proposition) {
      t.push('  proposition de chauffes : ' + (x.proposition.phrase ? cite(x.proposition.phrase) : '(sans phrase)') +
        ' → ' + (x.proposition.lignes || []).map(function (l) {
          return Array.isArray(l) ? fois(l[0], l[1]) : fois(l && l.charge, l && l.reps);
        }).join(', '));
    }
    t.push('  lignes :');
    var series = e.series || [];
    ((x && x.lignes) || []).forEach(function (l) {
      var s = series[l.iSerie] || {};
      var morceaux = ['#' + (l.iSerie + 1), l.type || typeDe(s), NOM_ROLE[l.role] || l.role];
      if (l.rang !== undefined && l.role !== 'hors') morceaux.push('rang ' + nb(l.rang));
      if (l.role !== 'hors') {
        morceaux.push('plan ' + fois(l.charge, l.vise) + (l.fourchette ? ' (' + l.fourchette.join('-') + ')' : ''));
        if (l.proposee) morceaux.push('proposée');
        if (l.figee) morceaux.push('figée');
        if (l.ajoutee) morceaux.push('ajoutée (série de plus)');
      }
      if (l.chauffe) morceaux.push('chauffe ' + nb(l.chauffe.charge));
      if (l.degressive) morceaux.push('dégressive ' + nb(l.degressive.charge) + (l.degressive.phrase ? ' ' + cite(l.degressive.phrase) : ''));
      if (l.validee) {
        morceaux.push('faite ' + fois(s.charge_kg, s.reps) +
          (s.rpe !== null && s.rpe !== undefined ? ' RPE ' + nb(s.rpe) : '') +
          (s.ressenti ? ' ressenti ' + s.ressenti : ''));
      } else {
        var f = (e.fantomes || {})[l.iSerie];
        morceaux.push('à faire · pré-rempli ' + (f ? fois(f.charge_kg, f.reps) : '–'));
      }
      t.push('    ' + morceaux.join(' · '));
    });
    if (x && x.message) {
      t.push('  réaction (au-dessus de #' + (x.message.iSerie === null ? '?' : x.message.iSerie + 1) + ', ' +
        (x.message.type || '?') + ') : ' + (x.message.phrase ? cite(x.message.phrase) : '(sans phrase)'));
    }
    if (x && x.degressive) {
      t.push('  dégressive (#' + (x.degressive.iSerie + 1) + ', après #' + (x.degressive.apres + 1) + ') : charge ' +
        nb(x.degressive.charge) + ' · référence ' + nb(x.degressive.reference) +
        (x.degressive.phrase ? ' · ' + cite(x.degressive.phrase) : ''));
    }
    if (x && x.donc) t.push('  pourquoi (donc) : ' + cite(x.donc));
    if (x && x.constat) {
      phrasesDe(x.constat, '', []).forEach(function (p) { t.push('  constat ' + p); });
    }
    (e.controles || []).forEach(function (k) { t.push('  ' + k); });
    return t.join('\n');
  }

  // Le texte d'une étape : la carte et la semaine allégée, chaque exercice, et
  // les invariants (`verifierPlan`). `avant` : les blocs de l'étape d'avant —
  // un exercice dont le bloc n'a pas changé se nomme seulement. Les blocs se
  // reconnaissent par leur clé (`slug#occurrence`) : un exercice ajouté en
  // cours de séance décale les positions.
  function texteEtape(etape, avant) {
    var t = [];
    t.push('');
    t.push('── ' + etape.titre + ' ──');
    var p = etape.plan || {};
    if (p.allegee) t.push('semaine allégée : ' + phrasesDe(p.allegee, '', []).join(' · '));
    if (p.carte) t.push('carte de semaine allégée : ' + phrasesDe(p.carte, '', []).join(' · '));
    var blocs = etape.blocs || [];
    var inchanges = [];
    var precedents = {};
    (avant || []).forEach(function (b) { precedents[b.cle] = b.texte; });
    blocs.forEach(function (b) {
      if (avant && precedents[b.cle] === b.texte) { inchanges.push(b.nom); return; }
      t.push(b.texte);
    });
    if (inchanges.length) t.push('(inchangés : ' + inchanges.join(', ') + ')');
    var v = etape.verification;
    if (!v) t.push('invariants : non vérifiés');
    else if (!(v.erreurs || []).length) t.push('invariants : aucune violation');
    else {
      t.push('invariants : ' + v.erreurs.length + ' violation(s)');
      v.erreurs.forEach(function (x) { t.push('  ✗ ' + x); });
    }
    return t;
  }

  // Le texte complet. `r` : `{ seance: { id, titre, debut, fin }, entete: [lignes],
  // notes: [lignes], etapes: [{ titre, plan, blocs: [{ cle, nom, texte }], verification }] }`.
  function texte(r) {
    var t = [];
    var s = r.seance || {};
    t.push('═══ Rejeu de la séance ' + (s.id || '?') + ' ═══');
    t.push((s.titre ? cite(s.titre) + ' · ' : '') + 'début ' + date(s.debut) + (s.fin ? ' · fin ' + heure(s.fin) : ''));
    (r.entete || []).forEach(function (l) { t.push(l); });
    if ((r.notes || []).length) {
      t.push('');
      t.push('Ce qui n’est pas reconstruit exactement :');
      r.notes.forEach(function (n) { t.push('  · ' + n); });
    }
    var avant = null;
    (r.etapes || []).forEach(function (e) {
      t = t.concat(texteEtape(e, avant));
      avant = e.blocs || null;
    });
    return t.join('\n') + '\n';
  }

  var api = {
    demande: demande,
    structure: structure,
    etapes: etapes,
    texteExercice: texteExercice,
    texteEtape: texteEtape,
    texte: texte,
    heure: heure
  };

  racine.THRejeu = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
