/** @jest-environment node */
//
// 117 (audit du 16/10/2026, 06 #1) — UNE SÉRIE EFFACÉE SUR UN APPAREIL QUITTE LE CACHE DE L'AUTRE.
//
// LE CONSTAT : la synchronisation des séries est incrémentale (`created_at`, `modifie_a`) : une série SUPPRIMÉE
// ne redescend jamais. Le téléphone B corrige la séance de mardi et retire un 150 × 3 saisi par erreur (son
// `remplacerSeries` le supprime en base) ; le téléphone A le garde à vie — le coach, les records et le volume le
// comptent. Et le compte de contrôle ne réagissait pas : un cache plus GRAND que le serveur passait pour complet.
//
// Ici, DEUX APPAREILS ET UN SERVEUR, en papier : chaque appareil a son cache et sa file, et synchronise comme
// `synchroniser` + `rapprocherSeriesDuServeur` (app.js) — l'incrémental, la purge des orphelines, puis le
// rapprochement par lots, seulement quand le compte dit qu'il y a un surplus.

const Sync = require('../../v2/js/sync.js');
const A = require('../../v2/js/attente.js');

function serveur() {
  return {
    sessions: [], sets: [], lectures: { lots: 0, lignes: 0 },
    seriesDepuis(curseur) {
      return this.sets.filter((s) => !curseur || s.created_at > curseur || (s.modifie_a && s.modifie_a > curseur));
    },
    seriesDesSeances(ids) {
      this.lectures.lots++;
      const l = this.sets.filter((s) => ids.indexOf(s.session_id) >= 0).map((s) => ({ id: s.id, session_id: s.session_id }));
      this.lectures.lignes += l.length;
      return l;
    }
  };
}

function appareil() { return { series: [], seances: [], curseur: null, file: [] }; }

// La synchronisation d'un appareil, dans l'ordre de `synchroniser`.
function synchroniser(app, srv) {
  const compte = srv.sets.length;
  const seances = srv.sessions.slice();
  const nouvelles = srv.seriesDepuis(app.curseur);
  const protegees = A.seancesEnAttente(app.file);
  app.seances = Sync.remplacer(seances, { conserver: protegees, existants: app.seances });
  const listeComplete = Sync.verifierCompletude(seances.length, srv.sessions.length).complet;
  let series = Sync.purgerSeriesOrphelines(Sync.fusionner(app.series, nouvelles), app.seances, listeComplete);
  let surplus = Sync.surplusDeSeries(series, seances, protegees, compte);
  if (listeComplete && surplus > 0) {
    for (const lot of Sync.lotsDeRapprochement(seances, 2)) {
      if (surplus <= 0) break;
      const r = Sync.rapprocherSeries(series, srv.seriesDesSeances(lot), lot, protegees);
      series = r.series;
      surplus -= r.retirees.length;
    }
  }
  app.series = series;
  app.curseur = Sync.curseurDe(nouvelles) || app.curseur;
}

const seance = (id, debut) => ({ id, debut, statut: 'terminee' });
const serie = (id, sid, t) => ({ id, session_id: sid, charge_kg: 150, reps: 3, created_at: t, modifie_a: null });
const ids = (l) => l.map((s) => s.id).sort();

function decor() {
  const srv = serveur();
  srv.sessions = [seance('lundi', '2026-10-12T08:00'), seance('mardi', '2026-10-13T08:00'),
    seance('ancienne', '2026-06-01T08:00'), seance('vieille', '2026-05-01T08:00'), seance('tres-vieille', '2026-04-01T08:00')];
  srv.sets = [serie('lu-1', 'lundi', 't1'), serie('ma-1', 'mardi', 't1'), serie('ma-2', 'mardi', 't1'),
    serie('an-1', 'ancienne', 't1'), serie('vi-1', 'vieille', 't1'), serie('tv-1', 'tres-vieille', 't1')];
  return srv;
}

describe('deux appareils, une série effacée', () => {
  test('⚠️ DISCRIMINANT — B retire une série de mardi : elle quitte le cache de A à sa synchronisation suivante', () => {
    const srv = decor();
    const telA = appareil(), telB = appareil();
    synchroniser(telA, srv); synchroniser(telB, srv);
    expect(ids(telA.series)).toEqual(['an-1', 'lu-1', 'ma-1', 'ma-2', 'tv-1', 'vi-1']);

    // B corrige mardi : son `remplacerSeries` supprime ma-2 en base (il la connaît).
    srv.sets = srv.sets.filter((s) => s.id !== 'ma-2');
    telB.series = telB.series.filter((s) => s.id !== 'ma-2');

    synchroniser(telA, srv);
    expect(ids(telA.series)).toEqual(ids(srv.sets));
    expect(ids(telA.series)).toEqual(ids(telB.series));
    // La correction porte sur une séance récente : un seul lot relu (les deux séances les plus récentes).
    expect(srv.lectures.lots).toBe(1);
  });

  test('le cas de tous les jours (rien d’effacé) : rien n’est relu', () => {
    const srv = decor();
    const tel = appareil();
    synchroniser(tel, srv);
    srv.sets.push(serie('lu-2', 'lundi', 't2'));
    synchroniser(tel, srv);
    expect(ids(tel.series)).toEqual(ids(srv.sets));
    expect(srv.lectures.lots).toBe(0);
  });

  test('une série effacée dans une séance ancienne : les lots s’enchaînent jusqu’à elle, pas au-delà', () => {
    const srv = decor();
    const tel = appareil();
    synchroniser(tel, srv);
    srv.sets = srv.sets.filter((s) => s.id !== 'vi-1');
    synchroniser(tel, srv);
    expect(ids(tel.series)).toEqual(ids(srv.sets));
    // Lots de 2 : [lundi, mardi], [ancienne, vieille] — la très vieille n'est jamais relue.
    expect(srv.lectures.lots).toBe(2);
  });

  test('effacée ici ET ajoutée là (le compte ne bouge pas) : l’ajout redescend, le surplus se voit quand même', () => {
    const srv = decor();
    const tel = appareil();
    synchroniser(tel, srv);
    srv.sets = srv.sets.filter((s) => s.id !== 'ma-2');
    srv.sets.push(serie('ma-3', 'mardi', 't2'));
    synchroniser(tel, srv);
    expect(ids(tel.series)).toEqual(ids(srv.sets));
  });
});

describe('ce qui attend dans la file n’est jamais retiré', () => {
  test('⚠️ une série locale pas encore envoyée (sa séance attend dans la file) reste dans le cache', () => {
    const srv = decor();
    const tel = appareil();
    synchroniser(tel, srv);
    // Une correction de mardi, faite ICI hors ligne : une série neuve, pas encore montée, et la série ma-2
    // effacée ailleurs. La séance attend dans la file : rien de mardi ne bouge.
    tel.series.push(serie('ma-locale', 'mardi', 't9'));
    tel.file = A.poser([], { table: A.SETS, op: A.REMPLACER, id: 'mardi', donnees: [] });
    srv.sets = srv.sets.filter((s) => s.id !== 'ma-2');
    synchroniser(tel, srv);
    expect(ids(tel.series)).toContain('ma-locale');
    expect(ids(tel.series)).toContain('ma-2');
  });

  test('une séance saisie hors ligne (inconnue du serveur) garde ses séries', () => {
    const srv = decor();
    const tel = appareil();
    synchroniser(tel, srv);
    tel.seances.push(seance('hors-ligne', '2026-10-15T08:00'));
    tel.series.push(serie('hl-1', 'hors-ligne', 't9'));
    tel.file = A.poser([], { table: A.SESSIONS, op: A.UPSERT, id: 'hors-ligne', creation: true, donnees: {} });
    srv.sets = srv.sets.filter((s) => s.id !== 'lu-1');
    synchroniser(tel, srv);
    expect(ids(tel.series)).toContain('hl-1');
    expect(ids(tel.series)).not.toContain('lu-1');
  });
});

describe('les briques', () => {
  test('surplusDeSeries : hors file, des seules séances que le serveur rend ; un compte inconnu ne prouve rien', () => {
    const seances = [seance('a', '1'), seance('b', '2')];
    const series = [serie('1', 'a'), serie('2', 'a'), serie('3', 'b'), serie('4', 'inconnue')];
    expect(Sync.surplusDeSeries(series, seances, {}, 2)).toBe(1);
    expect(Sync.surplusDeSeries(series, seances, { a: true }, 1)).toBe(0);
    expect(Sync.surplusDeSeries(series, seances, {}, null)).toBe(0);
  });

  test('lotsDeRapprochement : des plus récentes aux plus anciennes', () => {
    const lots = Sync.lotsDeRapprochement([seance('vieux', '2026-01'), seance('neuf', '2026-10'), seance('moyen', '2026-05')], 2);
    expect(lots).toEqual([['neuf', 'moyen'], ['vieux']]);
    expect(Sync.LOT_RAPPROCHEMENT).toBe(50);
  });

  test('rapprocherSeries : ne touche qu’aux séances du lot', () => {
    const series = [serie('1', 'a'), serie('2', 'a'), serie('3', 'b')];
    const r = Sync.rapprocherSeries(series, [{ id: '1', session_id: 'a' }], ['a'], {});
    expect(r.retirees).toEqual(['2']);
    expect(ids(r.series)).toEqual(['1', '3']);
  });
});
