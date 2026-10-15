// v2/js/bilans.js — le moteur des bilans de période (chantier 95, BILANS-V1).
//
// UN SEUL MOTEUR, la période en paramètre (année, saison, mois) : mêmes règles, même partage, seule la fenêtre
// change. Le prompt 95 code l'ANNÉE ; le moteur accepte toute période `{ type, cle, libelle, debut, fin,
// precedente }`, mais les versions saison et mois attendent leur maquette (aucun écran ne les lit) — et le bilan du
// mois actuel (`bilan.js`) ne bouge pas.
//
// ⚠️ IL APPELLE CE QUI EXISTE, IL NE LE REFAIT PAS : la série de travail (`Modele.estTravail`), le volume soulevé
// (`Bilan.volumeKg`), le compte des séries de travail (`Semaine.compteSeriesTravail`), les séries par muscle
// (`Semaine.volumeParMuscle`), le compte des paris (`Bilan.compterParis`), l'objet de comparaison du récap
// (`Bilan.comparaison`), la règle « moins pratiqué » et la comparaison à reps égales de « Ton parcours »
// (`Parcours.pratique`, `Parcours.aRepsEgales`). L'entrée est assemblée par le module des faits
// (`faits.js`, `entreeDuBilan`) ; aucun écran n'appelle ce module.
//
// JAMAIS (BILANS-V1) : le nombre de séances, la santé, une comparaison à une autre personne. Le nombre de séances
// d'UN exercice (« ton exercice de l'année ») est un fait de l'exercice, pas un total. Les heures et les jours à la
// salle (97, décision du 15/10/2026) sont un fait de la période, comptés par `faits.tempsALaSalle` et passés dans
// l'entrée (`salle`) : JAMAIS comparés à une autre période (aucun écart, aucune flèche).
//
// L'entrée : `{ periode, aujourdhui: 'AAAA-MM-JJ', seances: [{ id, jour, titre, series }], exercices: [fiche…],
//               pesees: [{ jour, poids }], paris: [{ jour, predite, observee }], salle: { jours, minutes } }` — toutes les séances terminées
// jusqu'à la fin de la période (l'avant compte : « la plus lourde de ta vie », la comparaison).
// Pur : aucun accès au DOM, au réseau, au stockage, à l'horloge.

(function (racine) {
  'use strict';

  function Mo() { return racine.THModele; }
  function Se() { return racine.THSemaine; }
  function Bi() { return racine.THBilan; }
  function Pa() { return racine.THParcours; }

  // ── Les constantes, une fois ─────────────────────────────────────────────
  // Les quatre barres de l'année, dans l'ordre de l'écran ; les trois grandes du total.
  var BARRES = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre'];
  var TROIS = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre'];
  // Le profil de l'année : la part des séries de travail par zone de reps (décidé le 12/10/2026).
  var ZONES_DE_REPS = [{ cle: 'force', jusqua: 5 }, { cle: 'mix', jusqua: 8 }, { cle: 'muscle', jusqua: Infinity }];
  // La comparaison : moins de 2 mois de données, aucune ; moins de 12, début contre fin de la période.
  var MOIS_MIN = 2, MOIS_PLEIN = 12;
  // Le poids du jour : deux pesées qui encadrent la perf, à 60 j au plus chacune ; sinon la plus proche à 45 j, « ≈ ».
  var JOURS_ENCADRE = 60, JOURS_PROCHE = 45;
  // L'équivalence : un éléphant d'Afrique pèse 6 t.
  var ELEPHANT_KG = 6000;
  // Ce que dit une comparaison « début contre fin », selon la période.
  var DEBUT_DE = { annee: 'en début d’année', saison: 'en début de saison', mois: 'en début de mois' };

  // ── Les jours ────────────────────────────────────────────────────────────
  var RE_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
  function numero(j) {
    var m = RE_JOUR.exec(String(j || ''));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null;
  }
  function deNumero(n) {
    var d = new Date(n * 864e5);
    var deux = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate());
  }
  function moisDe(j) { return String(j).slice(0, 7); }
  function moisSuivant(m) {
    var a = +m.slice(0, 4), n = +m.slice(5, 7);
    return n === 12 ? (a + 1) + '-01' : a + '-' + (n < 9 ? '0' : '') + (n + 1);
  }
  function dans(j, f) { return !!f && j >= f.debut && j <= f.fin; }

  // ── Les périodes ─────────────────────────────────────────────────────────
  function periodeDeLAnnee(an) {
    var a = Number(an);
    return { type: 'annee', cle: String(a), libelle: String(a), debut: a + '-01-01', fin: a + '-12-31',
             precedente: { debut: (a - 1) + '-01-01', fin: (a - 1) + '-12-31', libelle: String(a - 1) } };
  }
  // Prête pour le bilan du mois à venir (BILANS-V1) : aucun écran ne la lit encore.
  function periodeDuMois(cle) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(cle || ''));
    if (!m) return null;
    var a = +m[1], n = +m[2];
    var dernier = function (an, mo) { return new Date(Date.UTC(an, mo, 0)).getUTCDate(); };
    var pa = n === 1 ? a - 1 : a, pn = n === 1 ? 12 : n - 1;
    var deux = function (x) { return (x < 10 ? '0' : '') + x; };
    return { type: 'mois', cle: cle, libelle: Mo().MOIS_LONGS[n - 1] + ' ' + a,
             debut: cle + '-01', fin: cle + '-' + deux(dernier(a, n)),
             precedente: { debut: pa + '-' + deux(pn) + '-01', fin: pa + '-' + deux(pn) + '-' + deux(dernier(pa, pn)),
                           libelle: Mo().MOIS_LONGS[pn - 1] } };
  }

  // ── Les nombres ──────────────────────────────────────────────────────────
  function nombre(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function centiemes(x) { return Math.round(Number(x) * 100); }
  // Des parts entières qui font 100 : les plus grands restes (à égalité, l'ordre donné).
  function pourcents(valeurs) {
    var total = valeurs.reduce(function (t, v) { return t + v; }, 0);
    if (!total) return valeurs.map(function () { return 0; });
    var bruts = valeurs.map(function (v) { return v * 100 / total; });
    var ent = bruts.map(Math.floor);
    var reste = 100 - ent.reduce(function (t, v) { return t + v; }, 0);
    bruts.map(function (b, i) { return { i: i, r: b - ent[i] }; })
      .sort(function (a, b) { return b.r - a.r || a.i - b.i; })
      .slice(0, reste).forEach(function (x) { ent[x.i]++; });
    return ent;
  }

  // ── Le poids du jour (BILANS-V1) ─────────────────────────────────────────
  // `pesees` : `[{ jour, poids }]`. Rend `{ poids, approx }` ou `null`.
  function poidsDuJour(pesees, jour) {
    var n = numero(jour);
    if (n === null) return null;
    var avant = null, apres = null, proche = null;
    (pesees || []).forEach(function (p) {
      var k = numero(p && p.jour), v = nombre(p && p.poids);
      if (k === null || v === null || v <= 0) return;
      var d = k - n;
      if (d <= 0 && -d <= JOURS_ENCADRE && (!avant || k > avant.k)) avant = { k: k, v: v };
      if (d >= 0 && d <= JOURS_ENCADRE && (!apres || k < apres.k)) apres = { k: k, v: v };
      if (Math.abs(d) <= JOURS_PROCHE && (!proche || Math.abs(d) < Math.abs(proche.k - n) ||
          (Math.abs(d) === Math.abs(proche.k - n) && k < proche.k))) proche = { k: k, v: v };
    });
    if (avant && apres) {
      var v = avant.k === apres.k ? avant.v : avant.v + (apres.v - avant.v) * (n - avant.k) / (apres.k - avant.k);
      return { poids: v, approx: false };
    }
    if (proche) return { poids: proche.v, approx: true };
    return null;
  }

  // ── La comparaison : avec quoi, et sur quelles fenêtres ──────────────────
  // `moisDeDonnees` : les mois civils qui ont au moins une série de travail, de la première séance à la fin de la
  // période. Moins de 2 : aucune comparaison. 12 ou plus, et la période précédente a des séries : contre elle. Sinon,
  // si la période a au moins 2 mois de données : son début contre sa fin (la moitié des jours entre sa première et sa
  // dernière série). Sinon : aucune.
  function comparaisonDe(periode, travail) {
    var tous = {}, ici = {}, avantAussi = false;
    travail.forEach(function (t) {
      tous[moisDe(t.jour)] = true;
      if (dans(t.jour, periode)) ici[moisDe(t.jour)] = true;
      if (dans(t.jour, periode.precedente)) avantAussi = true;
    });
    var moisDeDonnees = Object.keys(tous).length, moisIci = Object.keys(ici).length;
    if (moisDeDonnees < MOIS_MIN) return { mode: 'aucune', moisDeDonnees: moisDeDonnees };
    if (moisDeDonnees >= MOIS_PLEIN && avantAussi && periode.precedente) {
      return { mode: 'precedente', moisDeDonnees: moisDeDonnees, avant: periode.precedente, apres: periode,
               libelle: periode.precedente.libelle, qu: 'qu’en ' + periode.precedente.libelle,
               comme: 'comme en ' + periode.precedente.libelle };
    }
    if (moisIci < MOIS_MIN) return { mode: 'aucune', moisDeDonnees: moisDeDonnees };
    var nums = travail.filter(function (t) { return dans(t.jour, periode); }).map(function (t) { return numero(t.jour); });
    var d0 = Math.min.apply(null, nums), d1 = Math.max.apply(null, nums);
    var milieu = d0 + Math.floor((d1 - d0) / 2);
    var debut = DEBUT_DE[periode.type] || 'au début';
    return { mode: 'debut_fin', moisDeDonnees: moisDeDonnees,
             avant: { debut: deNumero(d0), fin: deNumero(milieu) }, apres: { debut: deNumero(milieu + 1), fin: deNumero(d1) },
             libelle: debut, qu: 'qu’' + debut, comme: 'comme ' + debut };
  }

  // ── Le calcul ────────────────────────────────────────────────────────────
  function bilanDeLaPeriode(e) {
    var periode = e.periode, J = e.aujourdhui;
    var fin = J && J < periode.fin ? J : periode.fin;
    var exercices = e.exercices || [];
    var index = {};
    exercices.forEach(function (x) { if (x && x.slug) index[x.slug] = x; });
    var nomDe = function (slug) { return index[slug] && index[slug].nom ? index[slug].nom : slug; };

    // Les séances jusqu'à la fin, et leurs séries de travail datées.
    var seances = (e.seances || []).filter(function (s) { return s && s.jour && s.jour <= fin; });
    var travail = [];
    seances.forEach(function (s) {
      (s.series || []).forEach(function (x) {
        if (x && x.exercise_slug && Mo().estTravail(x)) travail.push({ jour: s.jour, seance: s.id, serie: x });
      });
    });
    var ici = seances.filter(function (s) { return s.jour >= periode.debut; });
    var seriesIci = [];
    ici.forEach(function (s) { (s.series || []).forEach(function (x) { if (x) seriesIci.push(x); }); });
    var travailIci = travail.filter(function (t) { return t.jour >= periode.debut; });

    var cmp = comparaisonDe(periode, travail);
    var sortie = { periode: periode, versus: { mode: cmp.mode, moisDeDonnees: cmp.moisDeDonnees,
                                               libelle: cmp.libelle || null },
                   vide: !travailIci.length };

    // Les tonnes, et l'équivalence.
    var kg = Bi().volumeKg(seriesIci);
    sortie.tonnes = { kg: kg, elephants: kg >= 1.5 * ELEPHANT_KG ? Math.round(kg / ELEPHANT_KG) : null,
                      objet: kg >= 1.5 * ELEPHANT_KG ? null : Bi().comparaison(kg, 'bilan-' + periode.cle) };

    // Les heures et les jours à la salle : le fait tel quel, sans comparaison ; l'équivalence en jours entiers
    // (24 h) à partir d'un jour et demi.
    var sa = e.salle || { jours: 0, minutes: 0 };
    var heures = Math.round(sa.minutes / 60);
    sortie.salle = { jours: sa.jours, heures: heures,
                     joursEntiers: sa.minutes >= 1.5 * 24 * 60 ? Math.round(sa.minutes / (24 * 60)) : null };

    // Mois par mois (jusqu'au mois d'aujourd'hui), le plus lourd, le mois en cours.
    var parMois = [], m = moisDe(periode.debut), mFin = moisDe(fin);
    while (m <= mFin) {
      var lesSiennes = [];
      ici.forEach(function (s) { if (moisDe(s.jour) === m) (s.series || []).forEach(function (x) { if (x) lesSiennes.push(x); }); });
      parMois.push({ mois: m, kg: Bi().volumeKg(lesSiennes) });
      m = moisSuivant(m);
    }
    var lourd = null;
    parMois.forEach(function (x) { if (x.kg > 0 && (!lourd || x.kg > lourd.kg)) lourd = x; });
    sortie.mois = { liste: parMois, plusLourd: lourd,
                    enCours: J && J >= periode.debut && J <= periode.fin ? moisDe(J) : null };

    // Reps et séries de travail.
    var reps = 0, zones = [0, 0, 0];
    travailIci.forEach(function (t) {
      var r = nombre(t.serie.reps);
      if (r === null || r < 1) return;
      reps += r;
      for (var i = 0; i < ZONES_DE_REPS.length; i++) if (r <= ZONES_DE_REPS[i].jusqua) { zones[i]++; break; }
    });
    sortie.reps = { reps: reps, series: Se().compteSeriesTravail(seriesIci, exercices) };
    var parts = pourcents(zones);
    var ordre = ZONES_DE_REPS.map(function (z, i) { return { cle: z.cle, part: parts[i], n: zones[i] }; });
    var tries = ordre.slice().sort(function (a, b) { return b.n - a.n; });
    sortie.profil = zones[0] + zones[1] + zones[2] ? { force: parts[0], mix: parts[1], muscle: parts[2],
                                                       premier: tries[0].cle, second: tries[1].cle } : null;

    // Le muscle de l'année et les deux suivants (en séries, la règle du volume).
    sortie.muscles = Se().volumeParMuscle(seriesIci, exercices).slice(0, 3);

    // L'exercice de l'année et les deux suivants : ses séances, puis ses reps.
    var exo = {};
    travailIci.forEach(function (t) {
      var slug = t.serie.exercise_slug, o = exo[slug] || (exo[slug] = { slug: slug, seances: {}, reps: 0 });
      o.seances[t.seance] = true;
      var r = nombre(t.serie.reps);
      if (r !== null && r > 0) o.reps += r;
    });
    sortie.exercices = Object.keys(exo).map(function (s) {
      return { slug: s, nom: nomDe(s), seances: Object.keys(exo[s].seances).length, reps: exo[s].reps };
    }).sort(function (a, b) { return b.seances - a.seances || b.reps - a.reps || (a.slug < b.slug ? -1 : 1); }).slice(0, 3);

    // La séance la plus lourde (à égalité, la première).
    var lourde = null;
    ici.forEach(function (s) {
      var v = Bi().volumeKg(s.series);
      if (v > 0 && (!lourde || v > lourde.kg)) lourde = { id: s.id, jour: s.jour, titre: s.titre || null, kg: v };
    });
    sortie.seance = lourde;

    // Les barres : la charge la plus lourde (série de travail, au moins 1 rep) d'une fenêtre, la première à égalité.
    var lourdeDe = function (slug, f) {
      var best = null;
      travail.forEach(function (t) {
        if (t.serie.exercise_slug !== slug || !f(t.jour)) return;
        var c = nombre(t.serie.charge_kg), r = nombre(t.serie.reps);
        if (c === null || c <= 0 || r === null || r < 1) return;
        if (!best || c > best.charge || (c === best.charge && t.jour < best.jour)) best = { charge: c, jour: t.jour };
      });
      return best;
    };
    var avec = cmp.mode !== 'aucune';
    var lignes = [];
    BARRES.forEach(function (slug) {
      var an = lourdeDe(slug, function (j) { return j >= periode.debut; });
      if (!an) return;
      var vie = lourdeDe(slug, function (j) { return j < periode.debut; });
      var avant = avec ? lourdeDe(slug, function (j) { return dans(j, cmp.avant); }) : null;
      var pdc = poidsDuJour(e.pesees, an.jour);
      lignes.push({ slug: slug, nom: nomDe(slug), charge: an.charge, jour: an.jour,
                    avant: avant ? avant.charge : null,
                    vie: !!vie && an.charge > vie.charge,
                    pdc: pdc ? { pct: Math.round(an.charge * 100 / pdc.poids), approx: pdc.approx } : null });
    });
    var tete = null;
    lignes.forEach(function (l) { if (!tete || l.charge > tete.charge) tete = l; });
    var total = null;
    var des = function (slug) { return lignes.filter(function (l) { return l.slug === slug; })[0] || null; };
    if (TROIS.every(des)) {
      var t = 0, ta = 0, tousAvant = true;
      TROIS.forEach(function (s) { t += des(s).charge; if (des(s).avant === null) tousAvant = false; else ta += des(s).avant; });
      total = { charge: t, avant: avec && tousAvant ? ta : null, ecart: avec && tousAvant ? t - ta : null };
    }
    sortie.barres = lignes.length ? { tete: tete, lignes: lignes, total: total } : null;

    // Ce qui a le plus avancé : à reps égales, la fenêtre d'avant contre celle d'après. La règle « moins pratiqué »
    // de « Ton parcours » écarte un exercice qu'on a délaissé ; la comparaison à reps égales décide de la hausse.
    sortie.avance = null;
    if (avec) {
      var cel = {};
      travail.forEach(function (t) {
        var p = dans(t.jour, cmp.avant) ? 'A' : (dans(t.jour, cmp.apres) ? 'B' : null);
        if (!p) return;
        var slug = t.serie.exercise_slug, o = cel[slug] || (cel[slug] = { A: {}, B: {}, nA: {}, nB: {} });
        o['n' + p][t.seance] = true;
        var c = nombre(t.serie.charge_kg), r = nombre(t.serie.reps);
        if (c === null || c <= 0 || r === null || r < 1 || r > Pa().REPS_CELLULE_MAX) return;
        if (centiemes(c) > (o[p][r] || 0)) o[p][r] = centiemes(c);
      });
      var compares = 0, progressent = 0, gains = [];
      Object.keys(cel).sort().forEach(function (slug) {
        var fiche = index[slug];
        if (!fiche || fiche.habilete) return;
        var o = cel[slug];
        if (Pa().pratique(Object.keys(o.nA).length, Object.keys(o.nB).length)) return;
        var eg = Pa().aRepsEgales(o.A, o.B);
        if (!eg) return;
        compares++;
        if (eg.etat !== '↑' && eg.etat !== '↗') return;
        progressent++;
        var best = null;
        eg.communs.forEach(function (r) {
          var q = o.B[r] / o.A[r];
          if (!best || q > best.q + 1e-12) best = { q: q, reps: r };
        });
        if (best.q <= 1) return;
        var fois = fiche.equipement === 'haltere' ? 2 : 1;   // haltères : le poids des deux
        gains.push({ slug: slug, nom: nomDe(slug), reps: best.reps, de: o.A[best.reps] * fois / 100,
                     a: o.B[best.reps] * fois / 100, q: best.q, h: eg.h, n: eg.communs.length });
      });
      gains.sort(function (x, y) { return y.q - x.q || (x.slug < y.slug ? -1 : 1); });
      if (compares) {
        var premier = gains[0] || null;
        var courbe = [];
        if (premier) {
          parMois.forEach(function (pm) {
            var b = null;
            travailIci.forEach(function (t) {
              if (t.serie.exercise_slug !== premier.slug || moisDe(t.jour) !== pm.mois) return;
              var c = nombre(t.serie.charge_kg), r = nombre(t.serie.reps);
              if (c !== null && c > 0 && r !== null && r >= 1 && (b === null || c > b)) b = c;
            });
            if (b !== null) courbe.push([pm.mois, b]);
          });
        }
        sortie.avance = {
          tete: premier ? Object.assign({ courbe: courbe,
            partout: premier.h === premier.n ? 'toutes' : (premier.n >= 4 && premier.h >= premier.n - 1 ? 'presque' : null) },
            premier) : null,
          suivants: gains.slice(1, 3), progressent: progressent, compares: compares, qu: cmp.qu
        };
      }
    }
    sortie.versus.qu = cmp.qu || null;
    sortie.versus.comme = cmp.comme || null;

    // Le coach : les paris tenus sur les paris vérifiés de la période ; « depuis » si le premier est venu en cours.
    var comptes = Bi().compterParis((e.paris || []).map(function (q) {
      return { date: q.jour, predite: q.predite, observee: q.observee };
    }), function (q) { return q.date >= periode.debut && q.date <= fin; });
    var premierPari = null;
    (e.paris || []).forEach(function (q) {
      if (q && q.jour >= periode.debut && q.jour <= fin && q.observee !== null && q.observee !== undefined &&
          (!premierPari || q.jour < premierPari)) premierPari = q.jour;
    });
    sortie.coach = comptes.verifies ? { tenus: comptes.tenus, faits: comptes.verifies,
                                        depuis: premierPari && premierPari > periode.debut ? premierPari : null } : null;
    return sortie;
  }

  var api = {
    bilanDeLaPeriode: bilanDeLaPeriode,
    periodeDeLAnnee: periodeDeLAnnee,
    periodeDuMois: periodeDuMois,
    poidsDuJour: poidsDuJour,
    comparaisonDe: comparaisonDe,
    BARRES: BARRES,
    ZONES_DE_REPS: ZONES_DE_REPS,
    JOURS_ENCADRE: JOURS_ENCADRE,
    JOURS_PROCHE: JOURS_PROCHE
  };
  racine.THBilans = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
