/** @jest-environment node */
//
// 21/11/2026 (MOTEUR §9.32, I253) — `sets.serie_de_mesure` est une colonne FACULTATIVE tant que la migration (Claude.ai) n'est pas passée : absente,
// elle ne casse ni la lecture ni l'écriture des séries (`donnees.js`, COLONNES_SERIE_FACULTATIVES, le patron de `pente_pct`).

global.self = global;
require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

function fauxSets(avecColonne) {
  const etat = { lectures: [], ecritures: [] };
  const client = { from() {
    const q = {};
    const c = {
      select(cols) { q.cols = cols; return c; },
      eq() { return c; }, gt() { return c; }, or() { return c; }, order() { return c; }, limit() { return c; }, in() { return c; },
      delete() { return c; },
      upsert(l) { q.up = l; return c; },
      then(res, rej) {
        let r;
        if (q.up) {
          etat.ecritures.push(q.up);
          r = !avecColonne && q.up.some((l) => 'serie_de_mesure' in l)
            ? { error: { code: 'PGRST204', message: "Could not find the 'serie_de_mesure' column of 'sets' in the schema cache" } } : { error: null };
        } else {
          etat.lectures.push(q.cols);
          r = !avecColonne && String(q.cols).indexOf('serie_de_mesure') >= 0
            ? { data: null, error: { code: '42703', message: 'column sets.serie_de_mesure does not exist' } } : { data: [], error: null };
        }
        return Promise.resolve(r).then(res, rej);
      }
    };
    return c;
  } };
  return { etat, client };
}
function donnees(f) {
  global.THClient = { obtenir: () => f.client };
  global.THSeance = Seance;
  let D;
  jest.isolateModules(() => { D = require('../../v2/js/donnees.js'); });
  return D;
}

describe('I253 — `serie_de_mesure` absente en base : l’app fonctionne avant la migration', () => {
  test('la colonne est déclarée, lue et écrite (COLONNES_SET), et `au_max_reserve` ne l’est plus', () => {
    expect(Seance.COLONNES_SET).toContain('serie_de_mesure');
    expect(Seance.COLONNES_SET).not.toContain('au_max_reserve');
  });
  test('DISCRIMINANT — la lecture rejoue sans elle, une fois', async () => {
    const f = fauxSets(false);
    const D = donnees(f);
    await expect(D.seriesDepuis(null)).resolves.toEqual([]);
    expect(f.etat.lectures[0]).toContain('serie_de_mesure');
    expect(f.etat.lectures[1]).not.toContain('serie_de_mesure');
  });
  test('DISCRIMINANT — l’écriture repart sans elle (la file ne boucle pas), la marque reste dans la séance', async () => {
    const f = fauxSets(false);
    const D = donnees(f);
    const lignes = [{ id: 'a', session_id: 's', serie_de_mesure: true, reps: 6 }];
    await D.remplacerSeries('s', lignes, []);
    expect(f.etat.ecritures[0][0]).toHaveProperty('serie_de_mesure', true);
    expect(f.etat.ecritures[1][0]).not.toHaveProperty('serie_de_mesure');
    expect(lignes[0].serie_de_mesure).toBe(true);
  });
  test('colonne présente : écrite telle quelle, une seule écriture', async () => {
    const f = fauxSets(true);
    const D = donnees(f);
    await D.remplacerSeries('s', [{ id: 'a', session_id: 's', serie_de_mesure: true }], []);
    expect(f.etat.ecritures).toHaveLength(1);
    expect(f.etat.ecritures[0][0].serie_de_mesure).toBe(true);
  });
});
