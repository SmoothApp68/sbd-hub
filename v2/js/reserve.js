// v2/js/reserve.js — la question de réserve (chantier 78, MOTEUR §17.2 bis).
//
// « Il t'en restait combien ? » : le coach le demande, une fois par exercice, sur la dernière série de travail d'un
// exercice qui a un pari. Ce module dit QUAND (`questionsDeReserve`) ; le plan porte la décision (`planDeSeance`,
// `x.questionReserve`), figée pour la séance comme la consigne ; l'écran la lit. La référence
// `tests/unit/fixtures/question78.py` fait foi pour chaque décision.
//
// ⚠️ IL LIT CE QUI EXISTE, IL NE LE REFAIT PAS : la série de travail (`Modele.estTravail`), le jour civil d'une
// séance (`Moteur.jourCivil`).
//
// L'entrée de la règle : `{ lancement: 'AAAA-MM-JJ', jour: 'AAAA-MM-JJ', exercices: [{ slug, pari: bool,
// passe: [{ jour, effort: { ressenti, rpe } | null }] }] }`, `passe` trié du plus ancien au plus récent, l'effort étant
// celui de la dernière série de travail de chaque séance. La sortie : `[{ slug, motif }]`, `motif` ∈ `calage`,
// `ecart`, `rappel`, dans l'ordre du plan. Pur : aucun accès au DOM, au réseau, au stockage, à l'horloge.

(function (racine) {
  'use strict';

  function Modele() { return racine.THModele; }
  function Moteur() { return racine.THMoteur; }

  // Le jour où la question commence (une date fixe) : les séances d'avant ne comptent ni pour le rang ni pour le
  // calage — sans quoi tout l'historique compterait comme « sans réponse ».
  var LANCEMENT_RESERVE = '2026-10-20';
  var CALAGE_JOURS = 42;      // 6 semaines
  var RAPPEL = 3;             // ensuite, une séance sur trois
  var SILENCE = 5;            // 5 séances de suite sans réponse → seulement les jours de rappel
  var FENETRE = 6;            // les 6 dernières réponses pour juger le coach
  var TROP_PRUDENT = 2.5;     // réserve moyenne ≥ 2,5
  var TROP_OPTIMISTE = 3;     // au moins 3 réponses « 0 » sur les 6
  var MAX_SEANCE = 4;

  var RESERVE_DU_RESSENTI = { reste_0: 0, reste_1: 1, reste_2: 2, reste_3_plus: 3 };

  // La réserve d'une réponse : `reste_N` → N (`reste_3_plus` → 3) ; un RPE → 10 − RPE, borné de 0 à 3. `null` : pas
  // de réponse.
  function reserveDe(effort) {
    if (!effort) return null;
    if (effort.rpe !== null && effort.rpe !== undefined) {
      return Math.min(3, Math.max(0, 10 - Number(effort.rpe)));
    }
    return Object.prototype.hasOwnProperty.call(RESERVE_DU_RESSENTI, effort.ressenti)
      ? RESERVE_DU_RESSENTI[effort.ressenti] : null;
  }

  // Des jours entre deux dates civiles `AAAA-MM-JJ` (lues à minuit UTC : aucun changement d'heure ne s'y glisse).
  function jours(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

  function decision(ex, L, J) {
    if (!ex || !ex.pari) return null;
    var tout = ex.passe || [];
    var passe = tout.filter(function (p) { return p.jour >= L && p.jour < J; });
    var n = passe.length;   // le rang de la séance du jour parmi celles depuis le lancement
    var debut = n ? passe[0].jour : J;
    var rappel = n % RAPPEL === 0;
    // 1. Le silence : les dernières séances depuis le lancement, sans réponse, de suite.
    var sans = 0;
    for (var i = passe.length - 1; i >= 0; i--) {
      if (reserveDe(passe[i].effort) === null) sans++;
      else break;
    }
    if (sans >= SILENCE) return rappel ? 'rappel' : null;
    // 2. L'écart : les 6 dernières réponses, de tout temps.
    var rep = tout.filter(function (p) { return p.jour < J; })
      .map(function (p) { return reserveDe(p.effort); })
      .filter(function (r) { return r !== null; })
      .slice(-FENETRE);
    if (rep.length >= FENETRE) {
      var somme = rep.reduce(function (s, r) { return s + r; }, 0);
      var zeros = rep.filter(function (r) { return r === 0; }).length;
      if (somme / rep.length >= TROP_PRUDENT || zeros >= TROP_OPTIMISTE) return 'ecart';
    }
    // 3. Le calage ; 4. le rappel.
    if (jours(debut, J) < CALAGE_JOURS) return 'calage';
    return rappel ? 'rappel' : null;
  }

  // LA RÈGLE (MOTEUR §17.2 bis) : au plus quatre questions, celles des exercices qui ont le moins de réponses dans
  // les 42 derniers jours, puis dans l'ordre du plan ; la liste garde l'ordre du plan.
  function questionsDeReserve(entree) {
    var e = entree || {};
    var L = e.lancement, J = e.jour;
    var retenus = [];
    (e.exercices || []).forEach(function (ex, i) {
      var d = decision(ex, L, J);
      if (d === null) return;
      var recentes = (ex.passe || []).filter(function (p) {
        return p.jour < J && jours(p.jour, J) <= CALAGE_JOURS && reserveDe(p.effort) !== null;
      }).length;
      retenus.push({ recentes: recentes, i: i, slug: ex.slug, motif: d });
    });
    retenus.sort(function (a, b) { return a.recentes - b.recentes || a.i - b.i; });
    return retenus.slice(0, MAX_SEANCE)
      .sort(function (a, b) { return a.i - b.i; })
      .map(function (r) { return { slug: r.slug, motif: r.motif }; });
  }

  // LE PASSÉ D'UN EXERCICE, pour la règle : ses séances terminées d'avant (`seances`, celles du cache — jamais une
  // séance en cours), chacune avec l'effort de sa DERNIÈRE SÉRIE DE TRAVAIL (au rang le plus haut). Une séance où
  // l'exercice n'a que des chauffes n'en est pas une. `seriesDe(id)` : les séries d'une séance ; `saufId` : la
  // séance ouverte. Trié du plus ancien au plus récent.
  function passeDeReserve(slug, seances, seriesDe, saufId) {
    var passe = [];
    (seances || []).forEach(function (s) {
      if (!s || s.id === saufId || s.statut === 'en_cours') return;
      var jour = Moteur().jourCivil(s.debut);
      if (!jour) return;
      var travail = (seriesDe(s.id) || []).filter(function (x) {
        return x && x.exercise_slug === slug && Modele().estTravail(x);
      }).sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); });
      if (!travail.length) return;
      var der = travail[travail.length - 1];
      passe.push({ debut: s.debut, jour: jour, effort: {
        ressenti: der.ressenti === undefined ? null : der.ressenti,
        rpe: der.rpe === null || der.rpe === undefined ? null : Number(der.rpe) } });
    });
    passe.sort(function (a, b) { return Date.parse(a.debut) - Date.parse(b.debut); });
    return passe.map(function (p) { return { jour: p.jour, effort: p.effort }; });
  }

  var api = {
    LANCEMENT_RESERVE: LANCEMENT_RESERVE,
    MAX_SEANCE: MAX_SEANCE,
    reserveDe: reserveDe,
    questionsDeReserve: questionsDeReserve,
    passeDeReserve: passeDeReserve
  };

  racine.THReserve = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
