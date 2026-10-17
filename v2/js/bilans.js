// v2/js/bilans.js — le moteur des bilans de période (chantier 95, BILANS-V1).
//
// UN SEUL MOTEUR, la période en paramètre (année, saison, mois) : mêmes règles, même partage, seule la fenêtre
// change (décision du 14-15/10/2026). Le prompt 95 a codé l'ANNÉE ; le prompt 98 la SAISON et le MOIS
// (`periodeDeLaSaison`, `periodeDuMois`, maquette `maquette-saison-mois-v1.html`). Une période :
// `{ type, cle, libelle, debut, fin, precedente: { debut, fin, libelle, en } }`.
//
// LA COMPARAISON dépend de la fenêtre (`comparaisonDe`) : l'année, contre l'année d'avant ou début contre fin ;
// la saison et le mois, contre la saison ou le mois d'avant, et seulement avec au moins 3 semaines de données dans
// la période — sinon les faits seuls.
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
  // La saison et le mois : moins de 3 semaines de données dans la période, les faits seulement (décision du 14/10).
  var SEMAINES_MIN = 3;
  // Les saisons MÉTÉOROLOGIQUES (décision du 14/10/2026) : l'hiver AAAA va du 1er décembre AAAA à la fin de
  // février AAAA+1. `en` : la préposition (« plus lourd qu’en été », « comme au printemps ») ; `ce` : « cet hiver ».
  var SAISONS = {
    hiver: { mois: 12, libelle: 'hiver', le: 'l’hiver', en: 'en hiver', ce: 'cet hiver', avant: 'automne', decale: 0 },
    printemps: { mois: 3, libelle: 'printemps', le: 'le printemps', en: 'au printemps', ce: 'ce printemps', avant: 'hiver', decale: -1 },
    ete: { mois: 6, libelle: 'été', le: 'l’été', en: 'en été', ce: 'cet été', avant: 'printemps', decale: 0 },
    automne: { mois: 9, libelle: 'automne', le: 'l’automne', en: 'en automne', ce: 'cet automne', avant: 'ete', decale: 0 }
  };
  // Le nom d'une saison (décision du 14/10/2026) : l'hiver est « Winter Arc » pour tout le monde ; les autres
  // suivent la phase du profil au début de la saison (`profiles.phase` : `prise_de_masse`, `seche`, `maintien` ;
  // vide = maintien).
  var NOMS_DE_SAISON = {
    hiver: { prise_de_masse: 'Winter Arc', seche: 'Winter Arc', maintien: 'Winter Arc' },
    printemps: { prise_de_masse: 'Spring Bulk', seche: 'Summer Prep', maintien: 'Spring Arc' },
    ete: { prise_de_masse: 'Summer Bulk', seche: 'Summer Shred', maintien: 'Summer Arc' },
    automne: { prise_de_masse: 'Bulk Season', seche: 'Fall Cut', maintien: 'Fall Arc' }
  };
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
  // Le lundi de la semaine d'un jour (les semaines du bilan commencent le lundi, comme la semaine de l'app).
  function lundiDe(j) {
    var n = numero(j);
    return deNumero(n - (new Date(n * 864e5).getUTCDay() + 6) % 7);
  }
  function deux(x) { return (x < 10 ? '0' : '') + x; }
  function dernierJour(an, mo) { return new Date(Date.UTC(an, mo, 0)).getUTCDate(); }

  // ── Les périodes ─────────────────────────────────────────────────────────
  function periodeDeLAnnee(an) {
    var a = Number(an);
    return { type: 'annee', cle: String(a), libelle: String(a), debut: a + '-01-01', fin: a + '-12-31',
             precedente: { debut: (a - 1) + '-01-01', fin: (a - 1) + '-12-31', libelle: String(a - 1) } };
  }
  // Le mois (98) : « octobre 2026 », comparé à septembre.
  function periodeDuMois(cle) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(cle || ''));
    if (!m || +m[2] < 1 || +m[2] > 12) return null;
    var a = +m[1], n = +m[2];
    var pa = n === 1 ? a - 1 : a, pn = n === 1 ? 12 : n - 1;
    var nom = Mo().MOIS_LONGS[n - 1], nomAvant = Mo().MOIS_LONGS[pn - 1];
    return { type: 'mois', cle: cle, libelle: nom + ' ' + a, nom: nom, ce: 'en ' + nom,
             debut: cle + '-01', fin: cle + '-' + deux(dernierJour(a, n)),
             precedente: { cle: pa + '-' + deux(pn), debut: pa + '-' + deux(pn) + '-01',
                           fin: pa + '-' + deux(pn) + '-' + deux(dernierJour(pa, pn)),
                           libelle: nomAvant, en: 'en ' + nomAvant } };
  }
  // La saison (98) : `AAAA-hiver|printemps|ete|automne`. L'hiver 2026 = décembre 2026 → février 2027.
  function bornesDeLaSaison(an, cle) {
    var m0 = SAISONS[cle].mois, a1 = m0 === 12 ? an + 1 : an, m1 = m0 === 12 ? 2 : m0 + 2;
    return { debut: an + '-' + deux(m0) + '-01', fin: a1 + '-' + deux(m1) + '-' + deux(dernierJour(a1, m1)) };
  }
  function periodeDeLaSaison(cle) {
    var m = /^(\d{4})-(hiver|printemps|ete|automne)$/.exec(String(cle || ''));
    if (!m) return null;
    var an = +m[1], sa = m[2], s = SAISONS[sa], b = bornesDeLaSaison(an, sa);
    var av = s.avant, anAv = an + s.decale, ba = bornesDeLaSaison(anAv, av);
    return { type: 'saison', cle: cle, saison: sa, an: an, libelle: s.libelle + ' ' + an, ce: s.ce,
             debut: b.debut, fin: b.fin,
             precedente: { cle: anAv + '-' + av, debut: ba.debut, fin: ba.fin, libelle: SAISONS[av].le, en: SAISONS[av].en } };
  }
  // La saison d'un jour `AAAA-MM-JJ` : janvier et février sont l'hiver de l'année d'avant.
  function saisonDuJour(jour) {
    var m = RE_JOUR.exec(String(jour || ''));
    if (!m) return null;
    var a = +m[1], n = +m[2];
    if (n === 12) return a + '-hiver';
    if (n <= 2) return (a - 1) + '-hiver';
    return a + '-' + (n <= 5 ? 'printemps' : (n <= 8 ? 'ete' : 'automne'));
  }
  function nomDeSaison(saison, phase) {
    var t = NOMS_DE_SAISON[saison];
    return t ? (t[phase] || t.maintien) : null;
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
  //
  // LA SAISON ET LE MOIS (98) : contre la période d'avant, seulement si la période a au moins 3 semaines de données
  // (des semaines du lundi qui ont une série de travail) et la période d'avant au moins une série ; sinon, aucune.
  // Jamais « début contre fin » : une saison ou un mois est trop court pour se couper en deux.
  function comparaisonDe(periode, travail) {
    var tous = {}, ici = {}, semaines = {}, avantAussi = false;
    travail.forEach(function (t) {
      tous[moisDe(t.jour)] = true;
      if (dans(t.jour, periode)) { ici[moisDe(t.jour)] = true; semaines[lundiDe(t.jour)] = true; }
      if (dans(t.jour, periode.precedente)) avantAussi = true;
    });
    var moisDeDonnees = Object.keys(tous).length, moisIci = Object.keys(ici).length;
    if (periode.type !== 'annee') {
      var nSem = Object.keys(semaines).length;
      if (nSem < SEMAINES_MIN || !avantAussi || !periode.precedente) {
        return { mode: 'aucune', moisDeDonnees: moisDeDonnees, semainesDeDonnees: nSem };
      }
      var pr = periode.precedente;
      return { mode: 'precedente', moisDeDonnees: moisDeDonnees, semainesDeDonnees: nSem, avant: pr, apres: periode,
               libelle: pr.libelle, qu: 'qu’' + pr.en, comme: 'comme ' + pr.en };
    }
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
    // 119 (audit du 16/10/2026, F4) — LES SÉRIES DE MUSCULATION (`Semaine.estSerieDeMusculation`, la règle du volume) :
    // une période de seules sorties (randonnée, vélo, tapis) est VIDE, et ses semaines ne comptent pas pour la
    // comparaison — sinon une story « 0 t soulevées » s'annonçait pour un mois de randonnées.
    var muscu = travail.filter(function (t) { return Se().estSerieDeMusculation(t.serie, index[t.serie.exercise_slug]); });
    var muscuIci = muscu.filter(function (t) { return t.jour >= periode.debut; });

    var cmp = comparaisonDe(periode, muscu);
    var sortie = { periode: periode, versus: { mode: cmp.mode, moisDeDonnees: cmp.moisDeDonnees, semainesDeDonnees: cmp.semainesDeDonnees,
                                               libelle: cmp.libelle || null },
                   vide: !muscuIci.length };

    // Les tonnes, et l'équivalence.
    var kg = Bi().volumeKg(seriesIci);
    sortie.tonnes = { kg: kg, elephants: kg >= 1.5 * ELEPHANT_KG ? Math.round(kg / ELEPHANT_KG) : null,
                      objet: kg >= 1.5 * ELEPHANT_KG ? null : Bi().comparaison(kg, 'bilan-' + periode.cle),
                      avant: null, ecart: null };
    // Les tonnes de la période d'avant (98) : la seule comparaison que montrent la saison et le mois.
    if (cmp.mode === 'precedente') {
      var avantSeries = [];
      seances.forEach(function (s) { if (dans(s.jour, cmp.avant)) (s.series || []).forEach(function (x) { if (x) avantSeries.push(x); }); });
      sortie.tonnes.avant = Bi().volumeKg(avantSeries);
      sortie.tonnes.ecart = kg - sortie.tonnes.avant;
    }

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

    // Semaine par semaine (98) : les semaines du lundi qui touchent la période, jusqu'à aujourd'hui ; seules les
    // séances de la période comptent. La plus lourde : à égalité, la première.
    var parSemaine = [], lu = lundiDe(periode.debut), luFin = lundiDe(fin);
    while (lu <= luFin) {
      var finSem = deNumero(numero(lu) + 6), lesSiennesS = [];
      ici.forEach(function (s) { if (s.jour >= lu && s.jour <= finSem) (s.series || []).forEach(function (x) { if (x) lesSiennesS.push(x); }); });
      parSemaine.push({ lundi: lu, kg: Bi().volumeKg(lesSiennesS) });
      lu = deNumero(numero(lu) + 7);
    }
    var lourdeS = null;
    parSemaine.forEach(function (x) { if (x.kg > 0 && (!lourdeS || x.kg > lourdeS.kg)) lourdeS = x; });
    sortie.semaines = { liste: parSemaine, plusLourde: lourdeS };

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
    // 119 (audit du 16/10/2026, F1/F3 ; Aurélien, 16/10 : « Pour l'exercice du mois, le tapis ne devrait pas
    // apparaître ») — SEULS LES EXERCICES MESURÉS EN REPS (`Modele.seMesureEnReps` : `charge_reps`, `reps`), avec au
    // moins une rep : ni le tapis, ni une randonnée, ni une planche. Et LE CLASSEMENT SUIT LE CHIFFRE AFFICHÉ : la
    // saison et le mois montrent les reps, ils se classent par les reps ; l'année montre les séances puis les reps, elle
    // se classe ainsi.
    var exo = {};
    travailIci.forEach(function (t) {
      var slug = t.serie.exercise_slug;
      if (!Mo().seMesureEnReps(index[slug])) return;
      var o = exo[slug] || (exo[slug] = { slug: slug, seances: {}, reps: 0 });
      o.seances[t.seance] = true;
      var r = nombre(t.serie.reps);
      if (r !== null && r > 0) o.reps += r;
    });
    var parReps = periode.type !== 'annee';
    sortie.exercices = Object.keys(exo).filter(function (s) { return exo[s].reps > 0; }).map(function (s) {
      return { slug: s, nom: nomDe(s), seances: Object.keys(exo[s].seances).length, reps: exo[s].reps };
    }).sort(function (a, b) {
      return (parReps ? b.reps - a.reps || b.seances - a.seances : b.seances - a.seances || b.reps - a.reps) ||
        (a.slug < b.slug ? -1 : 1);
    }).slice(0, 3);

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

    // Les records (98) : les NOUVELLES CHARGES MAX de la période — un exercice dont la charge la plus lourde de la
    // période (série de travail, au moins 1 rep) dépasse tout ce qui précède la période. Sans avant, pas de record.
    // Les plus lourdes d'abord ; haltères : la charge d'une main (l'écran l'écrit « 2 × »).
    var recs = [], vus = {};
    travailIci.forEach(function (t) { vus[t.serie.exercise_slug] = true; });
    Object.keys(vus).forEach(function (slug) {
      var ic = lourdeDe(slug, function (j) { return j >= periode.debut; });
      var av = lourdeDe(slug, function (j) { return j < periode.debut; });
      if (!ic || !av || ic.charge <= av.charge) return;
      recs.push({ slug: slug, nom: nomDe(slug), charge: ic.charge, avant: av.charge, jour: ic.jour,
                  haltere: !!(index[slug] && index[slug].equipement === 'haltere') });
    });
    recs.sort(function (a, b) { return b.charge - a.charge || (a.slug < b.slug ? -1 : 1); });
    sortie.records = recs;

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
    periodeDeLaSaison: periodeDeLaSaison,
    saisonDuJour: saisonDuJour,
    nomDeSaison: nomDeSaison,
    SAISONS: SAISONS,
    SEMAINES_MIN: SEMAINES_MIN,
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
