// v2/js/objectif.js — L'OBJECTIF, À L'ESSAI (109, MOTEUR §9.25, décidé le 16/10/2026). Module PUR.
//
// La personne pose elle-même un objectif sur un exercice, en charge × reps (« 150 kg × 1 au squat ») ; le coach ne
// l'impose jamais. Ce module dit, à la POSE, ce que le coach en annonce (une date, « pas encore », « plus d'un an »)
// et le pari qui va avec ; puis, à chaque lecture, ce que la page de l'exercice montre (la jauge, la ligne de date
// FIGÉE) et l'observation du pari (les jours réellement mis, rattachés à la série qui atteint l'objectif).
//
// ⚠️ UN RECORD, JAMAIS UN MAXIMUM ESTIMÉ (MOTEUR §16.2). Le rythme se lit sur « la charge pour au moins N reps »
// (N = les reps de l'objectif) de la table cumulée — `Modele.recordsDeLExercice`, la fonction de la médaille et du
// tableau des records (§9.23, même périmètre : 12 mois pour un matériel de salle). Aucune formule d'estimation ici.
//
// ⚠️ LA DATE EST CELLE DU PARI, FIGÉE. Elle se calcule une fois, à la pose ; la page relit ce qui a été posé
// (`objectifs.projection`, `echeance`), jamais un nouveau calcul : elle ne bouge pas d'une séance à l'autre.
//
// Jamais « impossible », jamais en rouge, jamais dans les phrases de la séance (§9.25).
//
// Pur : aucun accès au DOM, au réseau, au stockage, ni à l'horloge (`maintenant` arrive en argument).

(function (racine) {
  'use strict';

  function Modele() { return racine.THModele; }

  var GRANDEUR = 'jours';
  // 120 (D12) — '2' : le plafond « moins d'un an » en deux temps ; un pari dit la règle qui l'a posé.
  var VERSION = '2';

  // LE PLAFOND DU RYTHME — le seuil « hors littérature » du REFERENTIEL-BORNES (§1.2), selon l'ancienneté déclarée
  // (`profiles.anciennete`) : il ne coupe que l'impossible ; la fourchette personnelle reste la référence. Une part
  // du record d'il y a un an, sur une durée en jours, convertie en kg par mois une fois, à la pose.
  //
  // 120 (D12, décision d'Aurélien du 16/10/2026, audit 01 #12) — « moins d'un an » = « +40 % sur les 12 premières
  // semaines, puis +20 %/an » : le plafond a DEUX temps (`puis`), comptés depuis la pose. Avant, 40 % / 12 semaines
  // s'étendait à toute l'année projetée (≈ 14,5 % par mois, +174 % par an) : il ne coupait rien. Les autres tranches
  // n'ont qu'un temps, inchangé.
  var PLAFONDS = {
    moins_1_an: { part: 0.40, jours: 84, puis: { part: 0.20, jours: 365 } },   // 40 % sur 12 semaines, puis 20 % par an
    '1_a_3_ans': { part: 0.20, jours: 365 },      // 20 % par an
    '3_a_5_ans': { part: 0.15, jours: 365 },      // 15 % par an
    plus_5_ans: { part: 0.15, jours: 365 }
  };
  var PLAFOND_PAR_DEFAUT = { part: 0.15, jours: 365 };   // non renseignée

  var JOURS_PAR_MOIS = 365.25 / 12;
  var JOUR_MS = 864e5;
  var SEMAINES_MIN = 8;            // d'historique sur l'exercice
  var RECORDS_MIN = 3;             // hausses du record « au moins N reps », la première comprise
  var MOIS_MAX = 12;               // au-delà : « plus d'un an », et aucun pari
  var EPS = 1e-6;
  var REPS_MAX = 100;              // le CHECK de `objectifs.reps` (v2_089)
  var CHARGE_MAX = 1000;           // le CHECK de `objectifs.charge_kg`

  var PROJECTIONS = ['date', 'pas_encore', 'plus_d_un_an', 'carnet'];

  // ── Les instants et les jours civils (heure du téléphone) ───────────────────────────────────────────────────
  function instant(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    var t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  }
  // Le jour civil et son numéro : l'arithmétique du moteur (`THMoteur.jourCivil`, `numeroDuJour`), écrite une fois
  // (124, audit du 16/10/2026, 01 #14).
  function jourCivil(v) { return racine.THMoteur.jourCivil(v); }
  function numeroDuJour(jour) { return racine.THMoteur.numeroDuJour(jour); }
  function joursEntre(de, a) {
    var x = numeroDuJour(jourCivil(de)), y = numeroDuJour(jourCivil(a));
    return x === null || y === null ? null : y - x;
  }

  // ── Les séries qui comptent : de travail, chargées, avec des reps ───────────────────────────────────────────
  function nombre(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function serieQuiCompte(s) {
    if (!s || !Modele().estTravail(s)) return false;
    var c = nombre(s.charge_kg), r = nombre(s.reps);
    return c !== null && c > 0 && r !== null && r > 0;
  }
  // Les séances `{ debut, series }` dans l'ordre du temps, leurs séries dans l'ordre du rang.
  function chronologiques(seances) {
    return (seances || []).filter(function (h) { return h && instant(h.debut) !== null; }).slice()
      .sort(function (a, b) { return instant(a.debut) - instant(b.debut); })
      .map(function (h) { return { debut: h.debut, id: h.id || null, series: Modele().trierParRang(h.series || []) }; });
  }

  // LES HAUSSES DU RECORD « charge pour au moins N reps », toute la vie de l'exercice : chaque série qui fait plus
  // lourd que tout ce qui précède à N reps ou plus — la première comprise. `[{ debut, charge, reps }]`.
  function haussesDuRecord(seances, n) {
    var max = null, out = [];
    chronologiques(seances).forEach(function (h) {
      h.series.forEach(function (s) {
        if (!serieQuiCompte(s) || Number(s.reps) < n) return;
        var c = Number(s.charge_kg);
        if (max === null || c > max + EPS) { max = c; out.push({ debut: h.debut, charge: c, reps: Number(s.reps) }); }
      });
    });
    return out;
  }

  // LE RECORD « au moins N reps » à un instant (séances strictement antérieures, le périmètre de la médaille) :
  // `{ charge, date }` ou `null`. `ancre` : la fenêtre des 12 mois d'un matériel de salle se pose sur l'instant lu.
  function recordA(seances, n, quand, options) {
    var M = Modele();
    var t = M.recordsDeLExercice(seances || [], new Date(quand), options || {}).table;
    var l = M.auMoinsDe(t, n);
    return l ? { charge: l.charge, date: l.date } : null;
  }

  // LA SÉRIE QUI PORTE LE RECORD « au moins N reps » (la plus lourde, la première fois) : pour dire « Déjà fait :
  // 152,5 kg × 3, le 3 mars. » avec les reps vraiment faites. `{ charge, reps, debut }` ou `null`.
  function serieDuRecord(seances, n, quand, options) {
    var best = null;
    chronologiques(Modele().seancesDuPerimetre(seances, new Date(quand), options || {})).forEach(function (h) {
      h.series.forEach(function (s) {
        if (!serieQuiCompte(s) || Number(s.reps) < n) return;
        if (!best || Number(s.charge_kg) > best.charge + EPS) best = { charge: Number(s.charge_kg), reps: Number(s.reps), debut: h.debut };
      });
    });
    return best;
  }

  // `{ materiel, max }` quand la salle déclarée, en vigueur, n'a pas la charge de l'objectif (au-delà de sa plus
  // lourde, dans l'unité des séries : la paire pour des haltères), sinon `null`. Une charge intermédiaire (27,5 kg
  // entre les barres de 25 et 30) n'est pas refusée : elle s'atteint à 30.
  function horsDeLaSalle(salle, charge, record) {
    var Mo = racine.THMoteur;
    if (!salle || !Mo) return null;
    var vigueur = Mo.salleEnVigueur(salle, record ? record.charge : null);
    var max = vigueur ? Mo.maxDeLaSalle(vigueur) : null;
    if (max === null || !(charge > max + EPS)) return null;
    return { materiel: vigueur.materiel, max: max };
  }
  var NOM_DU_MATERIEL = { barre_ez: 'en barre EZ', barre_droite: 'en barre droite', halteres: 'en haltères' };
  // Le refus d'un objectif au-delà de la salle, avec le fait : « Ta salle va jusqu'à 30 kg en barre EZ. »,
  // « Ta salle va jusqu'à 2 × 40 kg en haltères. » (les haltères se déclarent par haltère, §10 bis).
  function phraseHorsSalle(pr) {
    if (!pr || pr.etat !== 'hors_salle') return null;
    var M = Modele();
    var t = pr.salle === 'halteres' ? '2\u00a0×\u00a0' + M.charge(pr.max / 2) : M.charge(pr.max);
    return 'Ta salle va jusqu\u2019à ' + t + ' ' + (NOM_DU_MATERIEL[pr.salle] || '') + '.';
  }

  function plafondDe(anciennete) {
    return Object.prototype.hasOwnProperty.call(PLAFONDS, anciennete) ? PLAFONDS[anciennete] : PLAFOND_PAR_DEFAUT;
  }
  function arrondi(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }

  // ══ LA PROJECTION, À LA POSE ═════════════════════════════════════════════════════════════════════════════════
  //
  // `e` : { seances: [{ debut, series }] de l'exercice (toute la vie), charge, reps, maintenant, anciennete,
  //         options (le périmètre des records : `Modele.optionsDeRecord(exo)`), carnet (« Juste un carnet »),
  //         salle (la salle de l'exercice, `THProfil.salleDeLExercice`, ou null : rien de déclaré) }.
  // Rend `{ etat, … }` :
  //   · `deja`         : l'objectif est déjà fait — refusé, avec le fait (`serie`) ;
  //   · `hors_salle`   : une charge au-delà de la plus lourde de la salle déclarée (barre fixe, haltères, MOTEUR
  //                      §10 bis) — refusé, avec le fait (`salle`, `max`) : le coach ne proposera jamais cette charge ;
  //   · `carnet`       : « Juste un carnet » — ni date ni pari ;
  //   · `pas_encore`   : moins de 8 semaines d'historique, moins de 3 records à N reps ou plus, ou rythme nul ;
  //   · `plus_d_un_an` : la date tomberait au-delà de 12 mois — aucun pari ;
  //   · `date`         : `echeance` (la fin du mois, « AAAA-MM-JJ »), `jours` (de la pose à l'échéance) — le pari.
  // Toujours : `depart` (le record « au moins N reps » à la pose, ou null), et ce qui a servi au calcul.
  // 132 (MOTEUR §10 ter) — « Pas d'objectif chiffré non plus : l'objectif (§9.25) se refuse sur un exercice noté par
  // nom, avec la phrase « Un objectif se pose en kg : cet exercice se note par élastique. » » Sa salle (`salleDeLExercice`)
  // le dit : `materiel: 'elastique'`. Refusé avant tout calcul — une projection en kg n'a pas de sens sur un nom.
  var PHRASE_ELASTIQUE = 'Un objectif se pose en kg\u00a0: cet exercice se note par élastique.';
  function projection(e) {
    if (e && e.salle && e.salle.materiel === 'elastique') return { etat: 'elastique', depart: null, record: null };
    var n = Math.round(Number(e.reps)), charge = Number(e.charge);
    var t0 = instant(e.maintenant);
    var seances = e.seances || [];
    var options = e.options || {};
    var maintenant = recordA(seances, n, t0, options);
    var base = { depart: maintenant ? maintenant.charge : null, record: maintenant };
    if (maintenant && maintenant.charge >= charge - EPS) {
      return Object.assign(base, { etat: 'deja', serie: serieDuRecord(seances, n, t0, options) });
    }
    // Audit du 16/10/2026, 01 #3 — L'OBJECTIF LIT MA SALLE (§10 bis) : « le coach ne propose jamais une charge que
    // la salle n'a pas » ; un objectif au-delà de la plus lourde serait un pari sur une charge que le moteur s'interdit
    // de proposer. Refusé à la pose, avec le fait. La salle « en vigueur » se juge sur la plus lourde série faite :
    // à la barre, au-delà de la plus lourde barre fixe, c'est une barre qu'on charge, et la salle n'en dit rien.
    var hors = horsDeLaSalle(e.salle, charge, recordA(seances, 1, t0, options));
    if (hors) return Object.assign(base, { etat: 'hors_salle', salle: hors.materiel, max: hors.max });
    if (e.carnet) return Object.assign(base, { etat: 'carnet' });

    var premiere = null;
    chronologiques(seances).forEach(function (h) {
      if (premiere === null && h.series.some(function (s) { return s && Modele().estTravail(s); })) premiere = instant(h.debut);
    });
    var hausses = haussesDuRecord(seances.filter(function (h) { return instant(h && h.debut) < t0; }), n);
    if (premiere === null || t0 - premiere < SEMAINES_MIN * 7 * JOUR_MS || hausses.length < RECORDS_MIN || !maintenant) {
      return Object.assign(base, { etat: 'pas_encore', raison: 'historique', hausses: hausses.length });
    }

    // La référence : le record d'il y a un an — ou le plus ancien, avec moins d'un an d'historique (ou rien à N
    // reps ou plus il y a un an).
    var unAn = new Date(t0); unAn.setFullYear(unAn.getFullYear() - 1);
    var ref = null;
    if (premiere <= unAn.getTime()) {
      var r = recordA(seances, n, unAn.getTime(), options);
      if (r) ref = { charge: r.charge, le: jourCivil(unAn), t: unAn.getTime() };
    }
    if (!ref) ref = { charge: hausses[0].charge, le: jourCivil(hausses[0].debut), t: instant(hausses[0].debut) };
    var mois = (t0 - ref.t) / JOUR_MS / JOURS_PAR_MOIS;
    var brut = mois > 0 ? (maintenant.charge - ref.charge) / mois : 0;
    var p = plafondDe(e.anciennete);
    var plafond = ref.charge * p.part / (p.jours / JOURS_PAR_MOIS);
    var calcul = { reference: { charge: ref.charge, le: ref.le }, rythme_brut: arrondi(brut, 4),
                   plafond: arrondi(plafond, 4), anciennete: e.anciennete || null, hausses: hausses.length };
    if (!(brut > EPS)) return Object.assign(base, calcul, { etat: 'pas_encore', raison: 'rythme_nul', rythme: 0 });
    var rythme = Math.min(brut, plafond);
    calcul.rythme = arrondi(rythme, 4);
    var reste = charge - maintenant.charge;
    var tProjete;
    if (p.puis) {
      // D12 — deux temps : le premier plafond pendant `p.jours` (12 semaines) depuis la pose, le second ensuite.
      var plafondApres = ref.charge * p.puis.part / (p.puis.jours / JOURS_PAR_MOIS);
      var rythmeApres = Math.min(brut, plafondApres);
      calcul.plafond_apres = arrondi(plafondApres, 4);
      calcul.rythme_apres = arrondi(rythmeApres, 4);
      var moisPremier = p.jours / JOURS_PAR_MOIS, gainPremier = rythme * moisPremier;
      var moisProjetes = reste <= gainPremier + EPS ? reste / rythme : moisPremier + (reste - gainPremier) / rythmeApres;
      tProjete = t0 + moisProjetes * JOURS_PAR_MOIS * JOUR_MS;
    } else {
      tProjete = t0 + reste / rythme * JOURS_PAR_MOIS * JOUR_MS;
    }
    var limite = new Date(t0); limite.setMonth(limite.getMonth() + MOIS_MAX);
    if (tProjete > limite.getTime()) return Object.assign(base, calcul, { etat: 'plus_d_un_an' });
    var d = new Date(tProjete);
    var echeance = jourCivil(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return Object.assign(base, calcul, { etat: 'date', echeance: echeance, jours: joursEntre(t0, echeance) });
  }

  // ══ LE PARI, À LA POSE ═══════════════════════════════════════════════════════════════════════════════════════
  //
  // Seulement pour une date (`projection.etat === 'date'`). `exercise_slug` reste VIDE : l'exercice vit dans le
  // fondement (`exercice`), comme les paris de l'escalier — cinq lecteurs prennent un pari portant `exercise_slug`
  // pour un pari de consigne. Le fondement ne porte PAS `seance` : le pari ne dépend d'aucune séance.
  function pariDe(o, pr, userId, id) {
    if (!pr || pr.etat !== 'date') return null;
    var pari = {
      id: id, user_id: userId || null, module: racine.THMoteur.MODULE_OBJECTIF, module_version: VERSION,
      emise_a: o.pose_le, exercise_slug: null, grandeur: GRANDEUR,
      horizon_jours: pr.jours, valeur_predite: pr.jours, borne_basse: null, borne_haute: null,
      fondement: {
        exercice: o.exercise_slug, charge: Number(o.charge_kg), reps: Number(o.reps), pose_le: o.pose_le,
        echeance: pr.echeance, record: pr.record ? pr.record.charge : null, reference: pr.reference,
        rythme: pr.rythme, rythme_brut: pr.rythme_brut, plafond: pr.plafond, anciennete: pr.anciennete,
        hausses: pr.hausses
      },
      valeur_observee: null, observee_a: null, set_observe: null
    };
    // 120 (D12) — le second temps du plafond « moins d'un an » (après 12 semaines), seulement quand il s'applique : le
    // fondement des autres tranches ne change pas.
    if (pr.plafond_apres !== undefined) {
      pari.fondement.plafond_apres = pr.plafond_apres;
      pari.fondement.rythme_apres = pr.rythme_apres;
    }
    return pari;
  }

  // La ligne `objectifs` posée : ce que la page relira, figé.
  function ligneDe(slug, charge, reps, poseLe, pr, userId, pariId) {
    var etat = pr && PROJECTIONS.indexOf(pr.etat) >= 0 ? pr.etat : 'pas_encore';
    return {
      user_id: userId || null, exercise_slug: slug, charge_kg: Number(charge), reps: Math.round(Number(reps)),
      pose_le: poseLe, depart_kg: pr && pr.depart !== null && pr.depart !== undefined ? pr.depart : null,
      projection: etat, echeance: etat === 'date' ? pr.echeance : null, pari_id: etat === 'date' ? (pariId || null) : null
    };
  }

  // ══ LE RETOUR EN PROGRESSER : LA DATE SE CALCULE UNE FOIS, ALORS ════════════════════════════════════════════
  //
  // Audit du 16/10/2026, 01 #11 (prompt 122). Un objectif posé en « Juste un carnet » n'a ni date ni pari
  // (`projection = 'carnet'`) ; revenu en Progresser, la page disait « Pas encore de date. » — qui veut dire « pas
  // assez d'historique » — alors que la date n'avait jamais été calculée. Au retour en Progresser, la date se calcule
  // UNE fois (`pr` : `projection`, sans le carnet, à l'instant du retour) et le pari se pose à ce moment-là (l'app :
  // `pariDe` avec `pose_le` = l'instant du retour). La ligne garde sa pose (le moment où la personne l'a posé, qui
  // décide de la série qui l'atteint) et son départ (la jauge) ; seuls la projection, l'échéance et le pari changent.
  // Rend la ligne réécrite, ou `null` : pas un objectif du carnet, ou rien à projeter (déjà fait).
  function ligneAuRetour(o, pr, pariId) {
    if (!o || o.projection !== 'carnet' || !pr || pr.etat === 'carnet' || pr.etat === 'deja') return null;
    var etat = PROJECTIONS.indexOf(pr.etat) >= 0 ? pr.etat : 'pas_encore';
    return Object.assign({}, o, { projection: etat, echeance: etat === 'date' ? pr.echeance : null,
                                  pari_id: etat === 'date' ? (pariId || null) : null });
  }

  // ══ ATTEINT : LA PREMIÈRE SÉRIE QUI FAIT L'OBJECTIF, APRÈS LA POSE ═══════════════════════════════════════════
  //
  // Une série de travail de l'exercice, à la charge de l'objectif ou plus, pour ses reps ou plus, faite après la
  // pose (sa validation, sinon le début de sa séance). `{ serie, set_id, session_id, debut, jours }` ou `null`.
  // `jours` : du jour de la pose au jour de la séance, au calendrier — l'observation du pari.
  function atteinte(seances, objectif) {
    if (!objectif) return null;
    var tPose = instant(objectif.pose_le), n = Number(objectif.reps), c = Number(objectif.charge_kg);
    if (tPose === null) return null;
    var trouve = null;
    chronologiques(seances).some(function (h) {
      return h.series.some(function (s) {
        if (!serieQuiCompte(s) || Number(s.reps) < n || Number(s.charge_kg) < c - EPS) return false;
        var t = instant(s.validee_a);
        if (t === null) t = instant(h.debut);
        if (t === null || t < tPose) return false;
        trouve = { serie: s, set_id: s.id || null, session_id: s.session_id || h.id || null, debut: h.debut,
                   jours: Math.max(0, joursEntre(tPose, h.debut)) };
        return true;
      });
    });
    return trouve;
  }

  // L'OBSERVATION D'UN PARI D'OBJECTIF : les jours réellement mis, rattachés à la série qui atteint son objectif
  // — l'objectif du PARI (son fondement), pas l'objectif en cours : un objectif changé ou retiré garde son pari, qui
  // s'observe comme les autres. Rend les trois champs voulus ; `valeur_observee` vide quand rien n'est atteint (une
  // série effacée entre-temps retire l'observation : jamais un fait faux).
  function observationDe(pari, seances) {
    var f = (pari && pari.fondement) || {};
    var a = atteinte(seances, { pose_le: f.pose_le, reps: f.reps, charge_kg: f.charge });
    if (!a || !a.set_id) return { valeur_observee: null, set_observe: null, session_id: null };
    return { valeur_observee: a.jours, set_observe: a.set_id, session_id: a.session_id };
  }

  // TENU = observé ≤ prédit ; sans observation passé l'échéance, il est non tenu à la lecture ; avant, en cours
  // (`null`). `aujourdhui` : un jour civil ou un instant.
  function estTenu(pari, aujourdhui) {
    if (!pari) return null;
    var o = nombre(pari.valeur_observee), p = nombre(pari.valeur_predite);
    if (o !== null && p !== null) return o <= p;
    var ech = pari.fondement && pari.fondement.echeance;
    var j = jourCivil(aujourdhui);
    if (ech && j && j > ech) return false;
    return null;
  }

  // ══ CE QUE LA PAGE DE L'EXERCICE MONTRE ══════════════════════════════════════════════════════════════════════

  function moisLong(i) { return Modele().MOIS_LONGS[i]; }

  // « Au rythme actuel : fin février. » — l'année seulement quand le mois annoncé est celui d'aujourd'hui, un an plus
  // tard (la date ne dépasse jamais 12 mois : c'est le seul nom de mois ambigu).
  // 150 : « fin avril » — le mois du pari, ou celui de la ligne « au rythme d'aujourd'hui » (la même règle d'année).
  function finDeMois(echeance, aujourdhui) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(echeance || ''));
    if (!m) return null;
    var auj = new Date(instant(aujourdhui));
    var mois = Number(m[2]) - 1, annee = Number(m[1]);
    var ambigu = mois === auj.getMonth() && annee !== auj.getFullYear();
    return 'fin ' + moisLong(mois) + (ambigu ? ' ' + annee : '');
  }
  function ligneDeDate(o, aujourdhui) {
    var t = finDeMois(o && o.echeance, aujourdhui);
    return t ? 'Le pari du coach\u00a0: ' + t + '.' : null;
  }
  // 150 (23/10/2026) — « Posé le 16 oct. On verra s'il tombe juste. » : la date de pose, l'année seulement si elle
  // diffère d'aujourd'hui.
  function lignePose(o, aujourdhui) {
    var d = new Date(instant(o && o.pose_le));
    if (isNaN(d.getTime())) return PARI;
    var auj = new Date(instant(aujourdhui));
    var j = Modele().jourMois(d, auj.getFullYear());
    return 'Pos\u00e9 le ' + j + (/\.$/.test(j) ? '' : '.') + ' ' + PARI;
  }
  // 150 — « Au rythme d'aujourd'hui : fin février. » : un SECOND appel de `projection` (la seule règle), à la date
  // d'aujourd'hui. Rien n'est écrit. Seulement quand un pari existe ; aucun état autre que date / plus d'un an / pas
  // encore ne parle.
  function ligneDuRythme(o, pr, aujourdhui) {
    var debut = 'Au rythme d\u2019aujourd\u2019hui\u00a0: ';
    if (!pr) return null;
    if (pr.etat === 'date') {
      var t = finDeMois(pr.echeance, aujourdhui);
      if (!t) return null;
      var memeMois = String(pr.echeance).slice(0, 7) === String(o.echeance).slice(0, 7);
      return debut + (memeMois ? 'toujours ' : '') + t + '.';
    }
    if (pr.etat === 'plus_d_un_an') return debut + 'plus d\u2019un an.';
    if (pr.etat === 'pas_encore') return debut + 'pas encore de date.';
    return null;
  }
  function ligneAtteint(debut, aujourdhui) {
    var d = new Date(instant(debut)), auj = new Date(instant(aujourdhui));
    return 'Atteint le ' + d.getDate() + ' ' + moisLong(d.getMonth()) +
      (d.getFullYear() !== auj.getFullYear() ? ' ' + d.getFullYear() : '') + '.';
  }

  var PAS_ENCORE = 'Pas encore de date.';
  var PLUS_D_UN_AN = 'Au rythme actuel\u00a0: plus d\u2019un an.';
  var PARI = 'On verra s\u2019il tombe juste.';

  // `e` : { objectif (la ligne), seances, options, maintenant, carnet }. Rend la carte « Mon objectif » :
  //   `titre` (« 150 kg × 1 »), `jauge` (0 à 1, depuis le record de la pose), `aujourdhui` (« Aujourd'hui : 145 kg ×
  //   1 », le record « au moins N reps » d'aujourd'hui, ou null), `ligne` (UNE ligne de date, ou null en « Juste un
  //   carnet »), `pari` (la phrase du pari, avec une date seulement), `atteint`.
  function vue(e) {
    var o = e.objectif;
    if (!o) return null;
    var M = Modele();
    var n = Number(o.reps), charge = Number(o.charge_kg);
    var maintenant = recordA(e.seances, n, instant(e.maintenant), e.options);
    var a = atteinte(e.seances, o);
    var depart = nombre(o.depart_kg);
    var jauge;
    if (a) jauge = 1;
    else if (!maintenant) jauge = 0;
    else if (depart === null || charge - depart <= EPS) jauge = maintenant.charge / charge;
    else jauge = (maintenant.charge - depart) / (charge - depart);
    jauge = Math.max(0, Math.min(1, jauge));
    var ligne = null, pari = null, rythme = null;
    if (a) ligne = ligneAtteint(a.debut, e.maintenant);
    else if (!e.carnet) {
      if (o.projection === 'date' && o.echeance) { ligne = ligneDeDate(o, e.maintenant); pari = lignePose(o, e.maintenant);
        rythme = ligneDuRythme(o, projection({ seances: e.seances, charge: charge, reps: n, maintenant: e.maintenant,
          anciennete: e.anciennete || null, options: e.options, carnet: false, salle: e.salle || null }), e.maintenant); }
      else if (o.projection === 'plus_d_un_an') ligne = PLUS_D_UN_AN;
      else ligne = PAS_ENCORE;
    }
    return {
      titre: M.chargeFois(charge, n),
      jauge: jauge,
      aujourdhui: maintenant ? 'Aujourd\u2019hui\u00a0: ' + M.chargeFois(maintenant.charge, n) : null,
      ligne: ligne, pari: pari, rythme: rythme, atteint: !!a
    };
  }

  // ══ LA FEUILLE « POSER UN OBJECTIF » ═════════════════════════════════════════════════════════════════════════

  // La phrase sous les champs, pour les reps tapées : « Ton record : 145 kg × 1. Le coach projettera une date à
  // partir de tes records. » (sans la seconde phrase en « Juste un carnet »).
  function phraseDeSaisie(seances, reps, maintenant, options, carnet) {
    var n = Math.round(Number(reps));
    var suite = carnet ? '' : ' Le coach projettera une date à partir de tes records.';
    if (!(n >= 1)) return suite.trim();
    var r = recordA(seances, n, instant(maintenant), options);
    var debut = r ? 'Ton record\u00a0: ' + Modele().chargeFois(r.charge, n) + '.'
      : 'Pas encore de série à ' + Modele().repsTexte(n) + ' ou plus.';
    return debut + suite;
  }

  // LA SAISIE : « 150 », « 152,5 » ; des reps entières. `{ charge, reps }` ou `{ refus }` (la phrase reste dans la
  // feuille — le CHECK de la base est doublé avant la file : un 23514 y serait définitif).
  function lireSaisie(chargeTexte, repsTexte) {
    var c = Modele().lireNombre(chargeTexte);
    var r = Modele().lireNombre(repsTexte);
    if (c === null || !(c > 0) || c > CHARGE_MAX) return { refus: 'Une charge en kg, plus grande que zéro.' };
    if (r === null || Math.round(r) !== r || r < 1 || r > REPS_MAX) return { refus: 'Des reps entre 1 et ' + REPS_MAX + '.' };
    return { charge: c, reps: r };
  }

  // Le refus d'un objectif déjà fait, avec le fait : « Déjà fait : 152,5 kg × 3, le 3 mars. »
  function phraseDejaFait(pr, maintenant) {
    var s = pr && pr.serie;
    if (!s) return 'Déjà fait.';
    var d = new Date(instant(s.debut)), auj = new Date(instant(maintenant));
    var date = Modele().jourMois(d, auj.getFullYear());
    return 'Déjà fait\u00a0: ' + Modele().chargeFois(s.charge, s.reps) + ', le ' + date + (/\.$/.test(date) ? '' : '.');
  }

  // Un objectif se pose sur un exercice en charge × reps, à charge positive : ni au poids du corps, ni avec une
  // aide, ni en durée ou en distance.
  function possible(exo) {
    if (!exo || exo.mesure !== 'charge_reps') return false;
    return !Modele().optionsDeRecord(exo).corps && Modele().natureDeCharge(exo) !== 'aide';
  }

  var api = {
    GRANDEUR: GRANDEUR, VERSION: VERSION, PLAFONDS: PLAFONDS, PLAFOND_PAR_DEFAUT: PLAFOND_PAR_DEFAUT,
    JOURS_PAR_MOIS: JOURS_PAR_MOIS, SEMAINES_MIN: SEMAINES_MIN, RECORDS_MIN: RECORDS_MIN, MOIS_MAX: MOIS_MAX,
    PAS_ENCORE: PAS_ENCORE, PLUS_D_UN_AN: PLUS_D_UN_AN, PARI: PARI,
    projection: projection, pariDe: pariDe, ligneDe: ligneDe, ligneAuRetour: ligneAuRetour, atteinte: atteinte,
    observationDe: observationDe,
    estTenu: estTenu, vue: vue, phraseDeSaisie: phraseDeSaisie, lireSaisie: lireSaisie, phraseDejaFait: phraseDejaFait,
    phraseHorsSalle: phraseHorsSalle,
    PHRASE_ELASTIQUE: PHRASE_ELASTIQUE,
    possible: possible, haussesDuRecord: haussesDuRecord, plafondDe: plafondDe, joursEntre: joursEntre
  };
  racine.THObjectif = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
