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
require('../../v2/js/periode.js');
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
// 58-2 — `recordsDeLaSeance` porte en plus l'identifiant de la série médaillée
// (`serieId`, pour le journal). L'oracle d'avant ne l'a pas : on le retire pour
// comparer le reste à l'identique, et on vérifie à part qu'il désigne bien une
// série de la séance, de l'exercice annoncé.
const sansSerie = (r) => {
  if (Array.isArray(r)) return r.map(sansSerie);
  if (!r) return r;
  const c = Object.assign({}, r);
  delete c.serieId;
  return c;
};
const serieDuRecord = (r) => seriesDe(r.seanceId).filter((x) => x.id === r.serieId)[0];
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
    let designees = 0;
    faits.seancesAvecSeries(corpus()).forEach((se, i) => {
      const r = faits.recordsDeLaSeance(corpus(), se);
      expect([i, sansSerie(r)]).toEqual([i, avant.recordsDeLaSeance(avant.seancesAvecSeries()[i])]);
      r.forEach((m) => {
        const x = serieDuRecord(m);
        expect([m.serieId, !!x && x.exercise_slug === m.slug]).toEqual([m.serieId, true]);
        designees++;
      });
    });
    expect(designees).toBeGreaterThan(20);
  });

  test('⚠️ les records d’un mois — chaque mois du corpus — et le dernier record', () => {
    expect(moisDuCorpus.length).toBeGreaterThan(10);
    let total = 0;
    moisDuCorpus.forEach((m) => {
      const r = faits.recordsDuMois(corpus(), m);
      total += r.length;
      expect([m, sansSerie(r)]).toEqual([m, avant.recordsDuMois(m)]);
    });
    expect(total).toBeGreaterThan(20);
    const d = faits.dernierRecord(corpus());
    expect(d).not.toBeNull();
    expect(sansSerie(d)).toEqual(avant.dernierRecord());
    expect(serieDuRecord(d)).toBeDefined();
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

// ══ 58-2 — LE JOURNAL DES RECORDS (MOTEUR §9.23) ═════════════════════════════
//
// Une ligne de `records` par série et par type : ce que la fonction des
// records a constaté, aux colonnes de la table (v2_061, v2_062). Le journal ne
// calcule rien — ces tests le vérifient champ par champ, sur le même corpus.
const COLONNES_RECORDS = ['user_id', 'set_id', 'session_id', 'exercise_slug', 'type', 'valeur', 'reps',
  'charge', 'unite', 'ancien', 'ancien_le', 'sur_douze_mois', 'battu_le'].sort();
// 120 (D1, 16/10/2026) — plus de `un_rm_estime` : la force estimée n'est plus un record, rien ne l'écrit.
const TYPES_RECORDS = ['charge_a_reps', 'reps_a_charge', 'charge_max', 'cap',
  'volume_seance', 'duree_s', 'distance_m'];
const rouvrir = (s) => {
  const exercices = [];
  seriesDe(s.id).forEach((x) => {
    let e = exercices[exercices.length - 1];
    if (!e || e.exercise_slug !== x.exercise_slug) { e = { exercise_slug: x.exercise_slug, series: [] }; exercices.push(e); }
    e.series.push(Object.assign({}, x, { validee_a: s.debut }));
  });
  return { id: s.id, debut: s.debut, user_id: 'u1', exercices: exercices };
};

describe('58-2 — le journal des records : ce que la fonction des records a constaté, aux colonnes de la table', () => {
  const f = Faits.creer();
  const toutes = f.seancesAvecSeries(corpus());
  const journal = [];
  toutes.forEach((se) => { f.journalDeLaSeance(corpus(), se, 'u1').forEach((l) => journal.push(l)); });

  test('le remplissage couvre le corpus : chaque record d’une séance passée devient une ligne, une seule', () => {
    const attendu = toutes.reduce((n, se) =>
      n + f.recordsDeLaSeance(corpus(), se).reduce((k, m) => k + m.records.length, 0), 0);
    expect(journal.length).toBe(attendu);
    expect(journal.length).toBeGreaterThan(50);
    const cles = new Set(journal.map((l) => l.set_id + '|' + l.type));
    expect(cles.size).toBe(journal.length);   // l'unicité (set_id, type) de la table
  });

  test('chaque ligne a exactement les colonnes de la table, et des valeurs que la base accepte', () => {
    const fautes = [];
    journal.forEach((l) => {
      if (JSON.stringify(Object.keys(l).sort()) !== JSON.stringify(COLONNES_RECORDS)) fautes.push('colonnes : ' + Object.keys(l));
      Object.keys(l).forEach((k) => { if (l[k] === undefined) fautes.push(k + ' indéfini'); });
      if (TYPES_RECORDS.indexOf(l.type) < 0) fautes.push('type ' + l.type);
      if (typeof l.valeur !== 'number' || !isFinite(l.valeur)) fautes.push('valeur ' + l.valeur);
      if ((l.reps !== null) !== (l.type === 'charge_a_reps')) fautes.push('reps sur ' + l.type);
      if ((l.charge !== null) !== (l.type === 'reps_a_charge')) fautes.push('charge sur ' + l.type);
      if ((l.unite !== null) !== (l.type === 'volume_seance')) fautes.push('unite sur ' + l.type);
      if (l.unite !== null && ['kg', 'reps'].indexOf(l.unite) < 0) fautes.push('unite ' + l.unite);
      if (l.reps !== null && !Number.isInteger(l.reps)) fautes.push('reps non entier ' + l.reps);
      if (typeof l.sur_douze_mois !== 'boolean') fautes.push('sur_douze_mois');
      if (l.user_id !== 'u1') fautes.push('user_id');
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ chaque ligne est le record constaté, champ par champ — rien de déduit', () => {
    const fautes = [];
    let vues = 0;
    toutes.forEach((se) => {
      const lignes = journal.filter((l) => l.session_id === se.id);
      f.recordsDeLaSeance(corpus(), se).forEach((m) => {
        m.records.forEach((r) => {
          const l = lignes.filter((x) => x.set_id === m.serieId && x.type === r.type)[0];
          vues++;
          if (!l) { fautes.push('ligne absente ' + m.serieId + ' ' + r.type); return; }
          if (l.valeur !== r.valeur) fautes.push('valeur');
          if (l.ancien !== (r.ancien === undefined ? null : r.ancien)) fautes.push('ancien');
          if (l.ancien_le !== (r.ancien_le === undefined ? null : r.ancien_le)) fautes.push('ancien_le');
          if (r.type === 'charge_a_reps' && l.reps !== r.reps) fautes.push('reps');
          if (r.type === 'reps_a_charge' && l.charge !== r.charge) fautes.push('charge');
          if (r.type === 'volume_seance' && l.unite !== r.unite) fautes.push('unite');
          if (l.sur_douze_mois !== r.douzeMois) fautes.push('douze mois');
          if (l.battu_le !== se.debut || l.exercise_slug !== m.slug) fautes.push('séance');
        });
      });
    });
    expect(vues).toBe(journal.length);
    expect(fautes).toEqual([]);
  });

  test('le corpus exerce les types qui portent un champ propre (sinon les contrôles ne prouveraient rien)', () => {
    const vus = new Set(journal.map((l) => l.type));
    ['charge_a_reps', 'reps_a_charge', 'charge_max', 'volume_seance'].forEach((t) => {
      expect([t, vus.has(t)]).toEqual([t, true]);
    });
    // 120 (D1) — et jamais `un_rm_estime` : le corpus en écrivait avant (le couché 122,5 × 5 puis × 6).
    expect(vus.has('un_rm_estime')).toBe(false);
    // La fenêtre des 12 mois : vraie pour un matériel de salle, fausse à la barre.
    expect(journal.some((l) => l.sur_douze_mois)).toBe(true);
    expect(journal.some((l) => !l.sur_douze_mois)).toBe(true);
    journal.forEach((l) => {
      if (equipDe[l.exercise_slug] === 'barre') expect([l.set_id, l.sur_douze_mois]).toEqual([l.set_id, false]);
    });
  });

  test('⚠️ « Terminer » et le remplissage écrivent les MÊMES lignes pour la même séance', () => {
    // La séance la plus récente qui porte des records, rouverte « en cours » :
    // la feuille « Terminer » (et la médaille) passent par `recordsDeLaSerie`,
    // le remplissage par `recordsDeLaSeance`. Deux chemins, une seule vérité.
    let comparees = 0;
    local.seances.slice(0, 40).forEach((s) => {
      const se = toutes.filter((x) => x.id === s.id)[0];
      const passe = f.journalDeLaSeance(corpus(), se, 'u1');
      if (!passe.length) return;
      const terminee = f.journalDuJour(corpus(), rouvrir(s), 'u1');
      const tri = (l) => l.slice().sort((a, b) => (a.set_id + a.type).localeCompare(b.set_id + b.type));
      expect([s.id, tri(terminee)]).toEqual([s.id, tri(passe)]);
      comparees++;
    });
    expect(comparees).toBeGreaterThan(3);
    // La feuille « Terminer » montre une ligne par série médaillée : le journal
    // en a au moins autant, et ses séries sont exactement celles-là.
    const s = local.seances.filter((x) => f.journalDeLaSeance(corpus(),
      toutes.filter((y) => y.id === x.id)[0], 'u1').length)[0];
    const r = rouvrir(s);
    const series = new Set(f.journalDuJour(corpus(), r, 'u1').map((l) => l.set_id));
    expect(series.size).toBe(f.recordsDuJour(corpus(), r).length);
    expect(f.journalDuJour(corpus(), null, 'u1')).toEqual([]);
  });

  test('la lecture du journal : filtres, ordre chronologique, copies', () => {
    const c = Object.assign(corpus(), { journal: journal.slice().reverse() });
    const tout = f.recordsDuJournal(c);
    expect(tout.length).toBe(journal.length);
    for (let i = 1; i < tout.length; i++) {
      expect(Date.parse(tout[i - 1].battu_le) <= Date.parse(tout[i].battu_le)).toBe(true);
    }
    const slug = journal[0].exercise_slug;
    const duSlug = f.recordsDuJournal(c, { slug: slug });
    expect(duSlug.length).toBe(journal.filter((l) => l.exercise_slug === slug).length);
    const se = journal[0].session_id;
    expect(f.recordsDuJournal(c, { seance: se }).every((l) => l.session_id === se)).toBe(true);
    expect(f.recordsDuJournal(c, { type: 'charge_max' }).every((l) => l.type === 'charge_max')).toBe(true);
    const milieu = tout[Math.floor(tout.length / 2)].battu_le;
    const apres = f.recordsDuJournal(c, { depuis: milieu });
    expect(apres.length).toBeGreaterThan(0);
    expect(apres.every((l) => Date.parse(l.battu_le) >= Date.parse(milieu))).toBe(true);
    expect(f.recordsDuJournal(c, { jusqua: milieu }).length + apres.length)
      .toBe(tout.length + tout.filter((l) => l.battu_le === milieu).length);
    // Des copies : modifier ce qu'on lit ne touche pas au journal.
    tout[0].valeur = -1;
    expect(f.recordsDuJournal(c)[0].valeur).not.toBe(-1);
    expect(f.recordsDuJournal({ journal: undefined })).toEqual([]);
  });

  // 120 (D1, audit du 16/10/2026, 05 #2) — les lignes `un_rm_estime` d'avant D1 restent en base, immuables : la
  // lecture du journal (la seule) les ignore. Le jeu ne les compte plus (ni record, ni XP), filtre `type` compris.
  test('⚠️ DISCRIMINANT — une ligne `un_rm_estime` d’avant D1 n’est plus lue : ni record, ni XP', () => {
    const l = (set_id, type) => ({ set_id, session_id: 'S', exercise_slug: 'presse', type, valeur: 133.3,
      battu_le: '2026-10-06T16:00:00Z' });
    const c = Object.assign(corpus(), { journal: [l('a', 'un_rm_estime'), l('b', 'charge_max'), l('b', 'un_rm_estime')] });
    expect(f.recordsDuJournal(c).map((x) => [x.set_id, x.type])).toEqual([['b', 'charge_max']]);
    expect(f.recordsDuJournal(c, { type: 'un_rm_estime' })).toEqual([]);
    // Le jeu lit le journal par `faitsDuJeu` : une seule série médaillée (b), pas deux.
    expect(f.faitsDuJeu(c, '2026-10-09').journal.map((x) => x.set_id)).toEqual(['b']);
  });
  // 140 — `volume_seance` est un record et a sa place dans l'ordre de la phrase (§9.23) : après `cap`, avant `duree_s`.
  test('⚠️ DISCRIMINANT (140) — à instant égal, le volume vient après le cap et avant la durée', () => {
    const t = '2026-10-06T16:00:00Z';
    const l = (set_id, type) => ({ set_id, session_id: 'S', exercise_slug: 'presse', type, valeur: 603, battu_le: t });
    const c = Object.assign(corpus(), { journal: [l('d', 'duree_s'), l('v', 'volume_seance'), l('k', 'cap'), l('m', 'charge_max')] });
    expect(f.recordsDuJournal(c).map((x) => x.type)).toEqual(['charge_max', 'cap', 'volume_seance', 'duree_s']);
    const m = f.medaillesDuSocial(Object.assign(corpus(), { journal: [
      { set_id: 's', session_id: 'S', exercise_slug: 'presse', type: 'volume_seance', valeur: 603, unite: 'kg', battu_le: t },
      { set_id: 's', session_id: 'S', exercise_slug: 'presse', type: 'cap', valeur: 150, battu_le: t }] }), [
      { set_id: 's', session_id: 'S', exercise_slug: 'presse', type: 'volume_seance', valeur: 603, unite: 'kg', battu_le: t },
      { set_id: 's', session_id: 'S', exercise_slug: 'presse', type: 'cap', valeur: 150, battu_le: t }]);
    expect(m.map((x) => x.types)).toEqual([['cap', 'volume_seance']]);
  });

});
