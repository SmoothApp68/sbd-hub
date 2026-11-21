/** @jest-environment node */
//
// 21/11/2026 — LE FILET DU DÉFICIT (synchro-filet), en miroir du rapprochement du surplus (117).
//
// LE CONSTAT (contradicteur à froid de #742, scénarios 1 et 4 de `rejeu742.js`) : `paginerParCle` pagine par `id` (des uuid
// aléatoires) AVEC le filtre incrémental. Une série insérée pendant la pagination avec un `id` inférieur à la page en cours est
// sautée, alors que le curseur avance au maximum : le cache reste court pour toujours (« 32 séries manquantes »). Le compte le
// voit ; rien ne le réparait.
//
// Ici, un faux serveur qui PAGINE COMME `paginerParCle`, et la synchronisation d'un appareil dans l'ordre de `synchroniser` +
// `completerSeriesDuServeur` (app.js), en papier. ⚠️ Ce test rejoue sa propre copie : il démontre le modèle ; les gardes de ce
// qu'`app.js` fait vraiment sont le test de texte (dernier bloc) et le banc `synchro-filet`.

const fs = require('fs');
const path = require('path');
const Sync = require('../../v2/js/sync.js');
const A = require('../../v2/js/attente.js');

const clone = (o) => JSON.parse(JSON.stringify(o));
const ids = (l) => l.map((s) => s.id).sort();

function serveur() {
  let t = Date.parse('2026-11-01T08:00:00Z');
  const S = { sessions: [], sets: [], lots: 0, lignesDIds: 0, rapatriees: 0 };
  S.tic = () => { t += 1000; return new Date(t).toISOString(); };
  S.seance = (id) => S.sessions.push({ id, debut: S.tic(), statut: 'terminee' });
  S.serie = (id, sid) => S.sets.push({ id, session_id: sid, created_at: S.tic(), modifie_a: null });
  // paginerParCle + seriesDepuis : (created_at > c OU modifie_a > c) ET id > dernier, ORDER BY id, LIMIT PAGE.
  S.seriesDepuis = (curseur, PAGE, entrePages) => {
    let tout = [], dernier = null;
    for (let k = 0; k < 500; k++) {
      const lot = S.sets.filter((x) => (!curseur || x.created_at > curseur || (x.modifie_a && x.modifie_a > curseur)) &&
        (dernier === null || x.id > dernier)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, PAGE).map(clone);
      tout = tout.concat(lot);
      if (lot.length < PAGE) return tout;
      dernier = lot[lot.length - 1].id;
      if (entrePages) entrePages(k);
    }
    return tout;
  };
  S.seriesDesSeances = (lot) => {
    S.lots++;
    const l = S.sets.filter((s) => lot.indexOf(s.session_id) >= 0).map((s) => ({ id: s.id, session_id: s.session_id }));
    S.lignesDIds += l.length;
    return l;
  };
  S.seriesParIds = (liste) => { S.rapatriees += liste.length; return S.sets.filter((s) => liste.indexOf(s.id) >= 0).map(clone); };
  return S;
}

const appareil = () => ({ series: [], seances: [], meta: { curseurSeries: null, attendu: null, formeSync: { version: 6 } }, file: [] });

// `opts` : { PAGE, entrePages, filet (défaut vrai) }
function synchroniser(app, S, opts) {
  const o = opts || {};
  const PAGE = o.PAGE || 1000;
  let resync = false;
  if (Sync.doitReprendre(app.meta.formeSync, app.series.length, app.meta.attendu)) { app.meta.curseurSeries = null; resync = true; }
  const compteSeances = S.sessions.length, compteSeries = S.sets.length;
  const nouvelles = S.seriesDepuis(app.meta.curseurSeries, PAGE, o.entrePages);
  const seances = S.sessions.map(clone);
  const protegees = A.seancesEnAttente(app.file);
  app.seances = Sync.remplacer(seances, { conserver: protegees, existants: app.seances });
  const listeComplete = Sync.verifierCompletude(seances.length, compteSeances).complet;
  let series = Sync.purgerSeriesOrphelines(Sync.fusionner(app.series, nouvelles), app.seances, listeComplete);
  if (listeComplete && o.filet !== false) {
    // completerSeriesDuServeur
    if (Sync.deficitDeSeries(series, seances, compteSeries) > 0) {
      const deficit = Sync.deficitDeSeries(series, seances, S.sets.length);
      if (deficit > 0) {
        let absentes = [];
        const lots = Sync.lotsDeRapprochement(seances);
        for (let i = 0; i < lots.length && absentes.length < deficit; i++) {
          absentes = absentes.concat(Sync.seriesAbsentes(series, S.seriesDesSeances(lots[i]), lots[i], protegees));
        }
        if (absentes.length) series = Sync.fusionner(series, S.seriesParIds(absentes).filter((r) => !protegees[r.session_id]));
      }
    }
  }
  app.series = series;
  const commit = Sync.decisionDeCommit(series.length, compteSeries);
  if (commit.autorise) {
    const avance = Sync.curseurDe(nouvelles);
    if (avance) app.meta.curseurSeries = avance;
    if (resync) app.meta.formeSync = { version: Sync.VERSION_SYNC };
    if (commit.attendu !== null) app.meta.attendu = { series: commit.attendu };
  }
  return { commit, resync };
}

let graine = 0;
const hex = () => { graine++; return require('crypto').createHash('md5').update('g' + graine).digest('hex').slice(0, 8) + '-h'; };
function historique(S, nSeances, nSeries) {
  for (let i = 0; i < nSeances; i++) { const sid = 'se-' + hex(); S.seance(sid); for (let j = 0; j < nSeries; j++) S.serie(hex(), sid); }
}
const absentes = (app, S) => { const l = new Set(app.series.map((x) => x.id)); return S.sets.filter((x) => !l.has(x.id)).map((x) => x.id); };

describe('le filet du déficit — la pagination par id saute une série', () => {
  test('⚠️ DISCRIMINANT (scénario 1 de rejeu742) — une série montée pendant la passe complète, id sous la page en cours : sautée sans filet, rapatriée avec', () => {
    const monter = (S) => (k) => {
      if (k === 2) S.sets.push({ id: '0000aaaa-bas', session_id: S.sessions[0].id, created_at: S.tic(), modifie_a: null });   // id < page : sautée
      // Une seconde, d'id plus haut : lue. Le magasin atteint le compte lu AU DÉPART, le commit est autorisé, le curseur avance.
      if (k === 3) S.sets.push({ id: 'ffffffff-haut', session_id: S.sessions[0].id, created_at: S.tic(), modifie_a: null });
    };
    const sans = serveur(); graine = 100; historique(sans, 60, 10);
    const telSans = appareil(); telSans.meta.formeSync = { version: 5 };
    synchroniser(telSans, sans, { PAGE: 100, entrePages: monter(sans), filet: false });
    synchroniser(telSans, sans, { PAGE: 100, filet: false });
    expect(absentes(telSans, sans)).toEqual(['0000aaaa-bas']);   // le défaut : le cache reste court

    const avec = serveur(); graine = 100; historique(avec, 60, 10);
    const tel = appareil(); tel.meta.formeSync = { version: 5 };
    synchroniser(tel, avec, { PAGE: 100, entrePages: monter(avec) });
    // Le compte lu au départ (un plancher) ne voit pas encore le trou, masqué par la série montée de l'autre côté de la page :
    // la synchronisation suivante, au compte à jour, le voit et le répare.
    synchroniser(tel, avec, { PAGE: 100 });
    expect(absentes(tel, avec)).toEqual([]);
    expect(ids(tel.series)).toEqual(ids(avec.sets));
  });

  test('⚠️ DISCRIMINANT (scénario 4 de rejeu742) — séance et 8 séries montées entre deux pages : le cache est complet', () => {
    const S = serveur(); graine = 300; historique(S, 60, 10);
    const tel = appareil();
    synchroniser(tel, S, { PAGE: 100, entrePages: (k) => {
      if (k === 2) { S.seance('pendant'); for (let i = 0; i < 8; i++) S.serie(hex(), 'pendant'); }
    } });
    synchroniser(tel, S, { PAGE: 100 });
    expect(absentes(tel, S)).toEqual([]);
  });

  test('⚠️ DISCRIMINANT (le compte de prod) — 32 séries absentes avant le curseur : le cache est complet après UNE synchronisation, le curseur ne bouge pas', () => {
    const S = serveur(); graine = 500; historique(S, 12, 10);   // 120 séries
    const tel = appareil();
    synchroniser(tel, S, { PAGE: 1000 });
    expect(tel.series.length).toBe(120);
    // L'état relevé en prod : 32 séries absentes du cache, le curseur au-delà d'elles, `attendu` périmé (0), forme à jour.
    const perdues = tel.series.slice(10, 42).map((x) => x.id);
    tel.series = tel.series.filter((x) => perdues.indexOf(x.id) < 0);
    tel.meta.attendu = { series: 0 };
    const curseurAvant = tel.meta.curseurSeries;
    expect(Sync.doitReprendre(tel.meta.formeSync, tel.series.length, tel.meta.attendu)).toBe(false);   // le filet de B ne se déclenche pas
    synchroniser(tel, S, { PAGE: 1000 });
    expect(ids(tel.series)).toEqual(ids(S.sets));
    expect(tel.meta.curseurSeries).toBe(curseurAvant);   // JAMAIS remis à zéro, ni avancé à tort
    expect(S.rapatriees).toBe(32);                       // seules les absentes se téléchargent
  });

  test('le cas de tous les jours : aucun déficit, aucune lecture d’identifiants', () => {
    const S = serveur(); graine = 700; historique(S, 12, 10);
    const tel = appareil();
    synchroniser(tel, S);
    S.serie(hex(), S.sessions[0].id);
    synchroniser(tel, S);
    expect(ids(tel.series)).toEqual(ids(S.sets));
    expect(S.lots).toBe(0);
    expect(S.rapatriees).toBe(0);
  });

  test('une série d’une séance qui attend dans la file n’est pas rendue au cache', () => {
    const S = serveur(); graine = 900; historique(S, 12, 10);
    const tel = appareil();
    synchroniser(tel, S);
    const mardi = S.sessions[3].id;
    tel.meta.attendu = { series: 0 };
    S.sets.push({ id: 'zz-ailleurs', session_id: mardi, created_at: '2026-01-01T00:00:00Z', modifie_a: null });   // sautée : sous le curseur
    tel.file = A.poser([], { table: A.SETS, op: A.REMPLACER, id: mardi, donnees: [] });
    synchroniser(tel, S, { filet: true });
    expect(ids(tel.series)).not.toContain('zz-ailleurs');
    expect(S.rapatriees).toBe(0);
    tel.file = [];
    synchroniser(tel, S);
    expect(ids(tel.series)).toContain('zz-ailleurs');
  });

  test('les lots s’arrêtent dès que les absentes couvrent le déficit', () => {
    const S = serveur(); graine = 1100; historique(S, 120, 2);   // 3 lots de 50
    const tel = appareil();
    synchroniser(tel, S);
    const recente = S.sessions[S.sessions.length - 1].id;
    const perdue = tel.series.filter((x) => x.session_id === recente)[0].id;
    tel.series = tel.series.filter((x) => x.id !== perdue);
    tel.meta.attendu = { series: 0 };
    S.lots = 0;
    synchroniser(tel, S);
    expect(ids(tel.series)).toEqual(ids(S.sets));
    expect(S.lots).toBe(1);
  });
});

describe('les briques', () => {
  const seances = [{ id: 'a', debut: '2' }, { id: 'b', debut: '1' }];
  const serie = (id, sid) => ({ id, session_id: sid });

  test('deficitDeSeries : le compte moins les séries des séances rendues, protégées comprises ; un compte inconnu ne prouve rien', () => {
    const series = [serie('1', 'a'), serie('2', 'a'), serie('3', 'b'), serie('4', 'inconnue')];
    expect(Sync.deficitDeSeries(series, seances, 5)).toBe(2);
    expect(Sync.deficitDeSeries(series, seances, 3)).toBe(0);
    expect(Sync.deficitDeSeries(series, seances, 2)).toBe(-1);
    expect(Sync.deficitDeSeries(series, seances, null)).toBe(0);
    expect(Sync.deficitDeSeries(series, seances, NaN)).toBe(0);
  });

  test('seriesAbsentes : celles du lot, hors cache, hors file ; sans doublon', () => {
    const series = [serie('1', 'a')];
    const lignes = [serie('1', 'a'), serie('2', 'a'), serie('2', 'a'), serie('3', 'b'), serie('4', 'c')];
    expect(Sync.seriesAbsentes(series, lignes, ['a', 'b'], {})).toEqual(['2', '3']);
    expect(Sync.seriesAbsentes(series, lignes, ['a', 'b'], { b: true })).toEqual(['2']);
    expect(Sync.seriesAbsentes(series, lignes, ['a'], {})).toEqual(['2']);
  });
});

describe('ce qu’app.js fait vraiment (garde de texte)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  test('⚠️ DISCRIMINANT — la synchronisation appelle le filet après le rapprochement du surplus, jamais sans liste complète, et ne remet jamais le curseur à zéro', () => {
    const debut = src.indexOf('async function synchroniser()');
    const corps = src.slice(debut, debut + 14000);
    const iSurplus = corps.indexOf('await rapprocherSeriesDuServeur(');
    const iFilet = corps.indexOf('await completerSeriesDuServeur(');
    expect(iSurplus).toBeGreaterThan(0);
    expect(iFilet).toBeGreaterThan(iSurplus);
    expect(corps.slice(iSurplus - 80, iFilet)).toMatch(/if \(listeComplete\)/);
    const fn = src.slice(src.indexOf('async function completerSeriesDuServeur('), src.indexOf('function idsRetires('));
    expect(fn).toMatch(/Sync\.deficitDeSeries/);
    expect(fn).toMatch(/Donnees\.seriesParIds/);
    expect(fn).not.toMatch(/curseurSeries/);
  });
});
