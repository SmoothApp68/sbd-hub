/** @jest-environment node */
//
// 58-1 — LE MODULE DES FAITS (`v2/js/faits.js`) : un DÉPLACEMENT, rien d'autre.
//
// L'assemblage des faits vivait dans `app.js` ; il vit dans `faits.js`, avec
// ses mémos. La preuve demandée : MÊMES RÉSULTATS QU'AVANT. L'oracle est
// l'assemblage d'avant, RECOPIÉ ICI tel qu'il était dans `app.js` (main
// 0c1303b), fermé sur un `local` de papier — et le module, appelé sur le même
// corpus, doit rendre exactement la même chose.
//
// Le corpus : l'historique de rejeu du fichier de cas 55-1 (345 séances
// réelles, anonymes, celles des records), rangé comme l'app le range — de la
// plus récente à la plus ancienne.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');
const F = require('./fixtures/cas-55-1-records.json');

// ── Le corpus de papier ─────────────────────────────────────────────────────
const COL = F.colonnes_serie;
const equipDe = {};
const local = { seances: [], series: [], exercices: [] };
F.rejeu.seances.slice().sort((a, b) => String(b.debut).localeCompare(String(a.debut))).forEach((se, i) => {
  const id = 's' + i;
  local.seances.push({ id, debut: se.debut, fin: se.fin || null });
  se.series.forEach((t, r) => {
    const o = {};
    COL.forEach((c, k) => { o[c] = t[k]; });
    equipDe[o.slug] = o.equip;
    local.series.push({ id: id + '-' + (r + 1), session_id: id, exercise_slug: o.slug, type_serie: o.type,
      charge_kg: o.kg, reps: o.reps, duree_s: o.duree_s, distance_m: o.distance_m, rang: r + 1 });
  });
});
Object.keys(equipDe).forEach((slug) => local.exercices.push({ slug, nom: slug.replace(/_/g, ' '),
  equipement: equipDe[slug], mesure: equipDe[slug] === 'aucun' ? 'reps' : 'charge_reps',
  muscles_primaires: ['pectoraux'], muscles_secondaires: [] }));
const parSeance = new Map();
local.series.forEach((s) => { const l = parSeance.get(s.session_id); if (l) l.push(s); else parSeance.set(s.session_id, [s]); });
function seriesDe(id) { return parSeance.get(id) || []; }
let catalogueMemo = null;
function catalogueIndexe() {
  if (!catalogueMemo || catalogueMemo.source !== local.exercices) {
    catalogueMemo = { source: local.exercices, index: Modele.indexerExercices(local.exercices || []) };
  }
  return catalogueMemo.index;
}
const corpus = () => ({ seances: local.seances, series: local.series, exercices: local.exercices,
  seriesDe: seriesDe, catalogue: catalogueIndexe });

// ── L'ORACLE : l'assemblage d'avant, recopié de `app.js` (main 0c1303b) ─────
let seance = null;
const avant = (function () {
  var memoSeancesBilan = { cle: null, liste: [] };
  function seancesAvecSeries() {
    var cle = (local.seances || []).length + '|' + (local.series || []).length;
    if (memoSeancesBilan.cle !== cle) {
      memoSeancesBilan = { cle: cle, liste: (local.seances || []).filter(Boolean).map(function (s) {
        return { id: s.id, debut: s.debut, fin: s.fin || null, series: Modele.trierParRang(seriesDe(s.id)) };
      }) };
    }
    return memoSeancesBilan.liste;
  }
  var memoParSlug = { cle: null, parSlug: {} };
  function seancesDuSlug(slug) {
    var cle = (local.seances || []).length + '|' + (local.series || []).length;
    if (memoParSlug.cle !== cle) memoParSlug = { cle: cle, parSlug: {} };
    if (!memoParSlug.parSlug[slug]) {
      memoParSlug.parSlug[slug] = seancesAvecSeries().map(function (s) {
        return { id: s.id, debut: s.debut, series: s.series.filter(function (x) { return x && x.exercise_slug === slug; }) };
      }).filter(function (g) { return g.series.length > 0; });
    }
    return memoParSlug.parSlug[slug];
  }
  var memoRecordsSeance = { cle: null, parId: {} };
  function recordsDeLaSeance(se) {
    var cle = (local.seances || []).length + '|' + (local.series || []).length;
    if (memoRecordsSeance.cle !== cle) memoRecordsSeance = { cle: cle, parId: {} };
    if (memoRecordsSeance.parId[se.id]) return memoRecordsSeance.parId[se.id];
    var index = catalogueIndexe(), out = [];
    se.series.forEach(function (x, k) {
      if (!x || !Modele.estTravail(x)) return;
      var r = Modele.recordsBattus(seancesDuSlug(x.exercise_slug), se, k, Modele.optionsDeRecord(index[x.exercise_slug] || null));
      if (!r.length) return;
      var nom = Modele.nomCourt(index[x.exercise_slug] ? index[x.exercise_slug].nom : x.exercise_slug);
      out.push({ seanceId: se.id, debut: se.debut, slug: x.exercise_slug,
                 nom: nom.charAt(0).toUpperCase() + nom.slice(1), mesure: Modele.formatMesure(x), records: r });
    });
    memoRecordsSeance.parId[se.id] = out;
    return out;
  }
  function recordsDuMois(mois) {
    var out = [];
    Bilan.seancesDuMois(seancesAvecSeries(), mois).slice().sort(function (a, b) {
      return String(a.debut).localeCompare(String(b.debut));
    }).forEach(function (se) { recordsDeLaSeance(se).forEach(function (r) { out.push(r); }); });
    return out;
  }
  function dernierRecord() {
    var liste = seancesAvecSeries();
    for (var i = 0; i < liste.length; i++) {
      var r = recordsDeLaSeance(liste[i]);
      if (r.length) return r[r.length - 1];
    }
    return null;
  }
  var memoRecords = { cle: null, parSlug: {} };
  function historiqueDesRecords(slug) {
    var cle = (seance ? seance.id : '') + '|' + (local.seances || []).length + '|' + (local.series || []).length;
    if (memoRecords.cle !== cle) memoRecords = { cle: cle, parSlug: {} };
    if (!memoRecords.parSlug[slug]) {
      memoRecords.parSlug[slug] = (local.seances || []).filter(function (s) {
        return s && (!seance || s.id !== seance.id);
      }).map(function (s) {
        return { debut: s.debut, series: seriesDe(s.id).filter(function (x) { return x && x.exercise_slug === slug; }) };
      }).filter(function (g) { return g.series.length > 0; });
    }
    return memoRecords.parSlug[slug];
  }
  function seanceDesRecords() {
    var series = [], positions = {};
    (seance ? seance.exercices : []).forEach(function (exo, i) {
      (exo.series || []).forEach(function (s, j) {
        if (!Seance.partEnBase(s)) return;
        positions[i + ':' + j] = series.length;
        series.push(Object.assign({}, s, { exercise_slug: exo.exercise_slug }));
      });
    });
    return { debut: seance ? seance.debut : null, series: series, positions: positions };
  }
  function recordsDeLaSerie(iExo, iSerie, lue) {
    var v = lue || seanceDesRecords();
    var k = v.positions[iExo + ':' + iSerie];
    if (k === undefined) return [];
    var slug = v.series[k].exercise_slug;
    return Modele.recordsBattus(historiqueDesRecords(slug), v, k,
      Modele.optionsDeRecord(catalogueIndexe()[slug] || null));
  }
  function recordsDuJour() {
    if (!seance) return [];
    var v = seanceDesRecords(), index = catalogueIndexe(), out = [];
    seance.exercices.forEach(function (exo, i) {
      (exo.series || []).forEach(function (s, j) {
        if (!recordsDeLaSerie(i, j, v).length) return;
        var nom = Modele.nomCourt(index[exo.exercise_slug] ? index[exo.exercise_slug].nom : exo.exercise_slug);
        out.push({ nom: nom.charAt(0).toUpperCase() + nom.slice(1), mesure: Modele.formatMesure(s) });
      });
    });
    return out;
  }
  function seancesDeLExercice(slug) {
    return local.seances.map(function (s) {
      var siennes = seriesDe(s.id).filter(function (x) {
        return x && x.exercise_slug === slug;
      });
      return siennes.length ? { seance: s, series: siennes } : null;
    }).filter(Boolean);
  }
  function semaineCourante(lundiAffiche) {
    var bornes = Semaine.bornesSemaine(lundiAffiche);
    var jours = Semaine.repartirParJour(local.seances, bornes.lundi);
    var seances = jours.reduce(function (acc, j) { return acc.concat(j.seances); }, []);
    var series = seances.reduce(function (acc, s) { return acc.concat(seriesDe(s.id)); }, []);
    return {
      bornes: bornes, jours: jours, seances: seances, series: series,
      bilan: Semaine.bilanSemaine(seances, series, local.exercices),
      zones: Semaine.volumeParZone(series, local.exercices)
    };
  }
  function calculerDatesExercices() {
    var parSeanceDebut = {};
    (local.seances || []).forEach(function (s) {
      if (s && s.id && s.debut) parSeanceDebut[s.id] = s.debut;
    });
    return Modele.exercicesFaits(local.series, parSeanceDebut);
  }
  return { seancesAvecSeries, seancesDuSlug, recordsDeLaSeance, recordsDuMois, dernierRecord,
           historiqueDesRecords, recordsDeLaSerie, recordsDuJour, seancesDeLExercice, semaineCourante,
           calculerDatesExercices };
})();

const faits = Faits.creer();
const slugs = Object.keys(equipDe);
const moisDuCorpus = Array.from(new Set(local.seances.map((s) => Bilan.cleMois(s.debut))));

describe('58-1 — le module des faits rend exactement ce que rendait app.js', () => {
  test('le corpus est réel et porte des records (sinon la comparaison ne prouverait rien)', () => {
    expect(local.seances.length).toBe(345);
    expect(local.series.length).toBeGreaterThan(1000);
    const avecRecords = avant.seancesAvecSeries().filter((se) => avant.recordsDeLaSeance(se).length);
    expect(avecRecords.length).toBeGreaterThan(20);
  });

  test('les séances avec leurs séries, et celles de chaque exercice', () => {
    expect(faits.seancesAvecSeries(corpus())).toEqual(avant.seancesAvecSeries());
    slugs.forEach((slug) => {
      expect([slug, faits.seancesDuSlug(corpus(), slug)]).toEqual([slug, avant.seancesDuSlug(slug)]);
      expect([slug, faits.seancesDeLExercice(corpus(), slug)]).toEqual([slug, avant.seancesDeLExercice(slug)]);
    });
  });

  test('⚠️ les records d’une séance — toutes les séances du corpus', () => {
    faits.seancesAvecSeries(corpus()).forEach((se, i) => {
      expect([i, faits.recordsDeLaSeance(corpus(), se)]).toEqual([i, avant.recordsDeLaSeance(avant.seancesAvecSeries()[i])]);
    });
  });

  test('⚠️ les records d’un mois — chaque mois du corpus — et le dernier record', () => {
    expect(moisDuCorpus.length).toBeGreaterThan(10);
    let total = 0;
    moisDuCorpus.forEach((m) => {
      const r = faits.recordsDuMois(corpus(), m);
      total += r.length;
      expect([m, r]).toEqual([m, avant.recordsDuMois(m)]);
    });
    expect(total).toBeGreaterThan(20);
    const d = faits.dernierRecord(corpus());
    expect(d).not.toBeNull();
    expect(d).toEqual(avant.dernierRecord());
  });

  test('⚠️ la séance en cours : les records de chaque série (la médaille) et ceux du jour (« Terminer »)', () => {
    // La séance la plus récente, rouverte « en cours » : ses séries validées.
    const derniere = local.seances[0];
    const exercices = [];
    seriesDe(derniere.id).forEach((s) => {
      let e = exercices[exercices.length - 1];
      if (!e || e.exercise_slug !== s.exercise_slug) { e = { exercise_slug: s.exercise_slug, series: [] }; exercices.push(e); }
      e.series.push(Object.assign({}, s, { validee_a: derniere.debut }));
    });
    seance = { id: derniere.id, debut: derniere.debut, exercices: exercices };
    seance.exercices.forEach((exo, i) => exo.series.forEach((s, j) => {
      expect([i, j, faits.recordsDeLaSerie(corpus(), seance, i, j)]).toEqual([i, j, avant.recordsDeLaSerie(i, j)]);
    }));
    const duJour = faits.recordsDuJour(corpus(), seance);
    expect(duJour).toEqual(avant.recordsDuJour());
    expect(duJour.length).toBeGreaterThan(0);   // sinon la comparaison ne prouverait rien
    slugs.forEach((slug) => {
      expect(faits.historiqueDesRecords(corpus(), seance, slug)).toEqual(avant.historiqueDesRecords(slug));
    });
    seance = null;
    expect(faits.recordsDuJour(corpus(), null)).toEqual([]);
  });

  test('la semaine affichée — dix semaines du corpus', () => {
    local.seances.slice(0, 10).forEach((s) => {
      const lundi = Semaine.bornesSemaine(new Date(s.debut)).lundi;
      expect(faits.semaineDe(corpus(), lundi)).toEqual(avant.semaineCourante(lundi));
    });
  });

  test('les exercices faits, leur date et leur compte — et l’oubli explicite', () => {
    const f = Faits.creer();
    const dates = avant.calculerDatesExercices();
    expect(f.datesDesExercices(corpus())).toEqual(dates);
    expect(f.compterExercices(corpus())).toEqual({ total: local.exercices.length, faits: Object.keys(dates).length });
    // Le compte se garde jusqu'à l'oubli, comme `datesExercices` dans app.js.
    const g = Faits.creer();
    const vide = { seances: [], series: [], exercices: local.exercices, seriesDe: () => [], catalogue: catalogueIndexe };
    expect(g.compterExercices(vide).faits).toBe(0);
    expect(g.compterExercices(corpus()).faits).toBe(0);
    g.oublierDates();
    expect(g.compterExercices(corpus()).faits).toBe(Object.keys(dates).length);
  });
});
