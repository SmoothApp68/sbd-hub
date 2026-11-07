/** @jest-environment node */
//
// 268 (lot 2, écran B) — LA PENTE MOYENNE FACULTATIVE DU TAPIS (`sets.pente_pct`, v2_140).
//
// Un champ en plus du catalogue (`champs_series`), sous la série comme le D+ : décimal (4,5), 0 à 40 %, 0 accepté, vide = inconnue,
// jamais recopié, jamais réclamé après coup. La mesure reste `distance_temps` : le coach, les bilans et les records ne voient rien.
// Et la colonne PEUT NE PAS EXISTER ENCORE (migration pas lancée) : lecture et écriture des séries continuent.

global.self = global;
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const TAPIS = { slug: 'tapis_de_course', nom: 'Tapis de Course', mesure: 'distance_temps', charge: 'aucune', champs_series: ['pente_pct'] };
const seance = () => ({ id: 's', user_id: 'u', exercices: [{ exercise_slug: 'tapis_de_course', series: [Seance.serieVide ? Seance.serieVide('a') : { id: 'a' }] }] });
const apres = (champs) => Seance.modifierSerie(seance(), 0, 0, champs).exercices[0].series[0];

describe('la pente : un champ en plus sous la série', () => {
  test('la grille du tapis la pose SOUS la série (comme le D+), la mesure ne change pas', () => {
    const g = Modele.grilleDe(TAPIS);
    expect(g.mesure).toBe('distance_temps');
    expect(g.colonnes).toEqual(['duree', 'distance_km']);
    expect(g.dessous).toEqual(['pente_pct']);
    expect(Modele.champDeMesure('pente_pct')).toMatchObject({ cle: 'pente_pct', unite: '%', facultatif: true, texte: 'Pente moyenne' });
    // Sans `champs_series`, rien n'apparaît (la migration pas lancée : le catalogue de la base ne la porte pas encore).
    expect(Modele.grilleDe({ mesure: 'distance_temps' }).dessous).toEqual([]);
  });

  test('la saisie : une décimale, 0 accepté, 40 au plus, vide = inconnue', () => {
    expect(apres({ pente_pct: '4,5' }).pente_pct).toBe(4.5);
    expect(apres({ pente_pct: '4,56' }).pente_pct).toBe(4.6);
    expect(apres({ pente_pct: '0' }).pente_pct).toBe(0);          // ⚠️ à plat est une valeur, pas une absence
    expect(apres({ pente_pct: '40' }).pente_pct).toBe(40);
    expect(apres({ pente_pct: '40,1' }).pente_pct).toBeNull();
    expect(apres({ pente_pct: '-1' }).pente_pct).toBeNull();
    expect(apres({ pente_pct: '' }).pente_pct).toBeNull();
    expect(Modele.maxDeSaisie('pente_pct')).toBe(40);
  });

  test('la réparation de la file borne comme la saisie', () => {
    expect(Seance.bornerLigne({ pente_pct: 55 })).toMatchObject({ change: true, ligne: { pente_pct: null } });
    expect(Seance.bornerLigne({ pente_pct: 0 })).toMatchObject({ change: false });
    expect(Seance.bornerLigne({ pente_pct: 4.5 })).toMatchObject({ change: false });
  });

  test('le journal : distance, durée, puis pente ; vide ou absente, rien', () => {
    expect(Modele.formatMesure({ distance_m: 5200, duree_s: 1920, pente_pct: 4.5 })).toBe('5,2 km · 32 min · pente 4,5 %');
    expect(Modele.formatMesure({ distance_m: 5200, duree_s: 1920, pente_pct: 0 })).toBe('5,2 km · 32 min · pente 0 %');
    expect(Modele.formatMesure({ distance_m: 5200, duree_s: 1920, pente_pct: null })).toBe('5,2 km · 32 min');
    expect(Modele.formatMesure({ distance_m: 5200, duree_s: 1920 })).toBe('5,2 km · 32 min');
  });

  test('elle part toujours (à null compris) et se déclare : COLONNES_SET dit ce que lignes() émet', () => {
    expect(Seance.COLONNES_SET).toContain('pente_pct');
    expect(() => Seance.verifierColonnes()).not.toThrow();
    const s = seance();
    s.exercices[0].series[0] = Object.assign({}, s.exercices[0].series[0], { validee_a: 'v', duree_s: 600, pente_pct: 3 });
    expect(Seance.lignes(s)[0].pente_pct).toBe(3);
    expect(Object.keys(Seance.lignes(seance())[0] || { pente_pct: 0 })).toContain('pente_pct');
  });

  test('jamais recopiée d’une séance à l’autre (pas de gris) et jamais réclamée après coup', () => {
    const s = seance();
    s.exercices[0].series[0] = Object.assign({}, s.exercices[0].series[0], { validee_a: 'v', type_serie: 'travail', duree_s: 600, distance_m: 3000, pente_pct: null });
    expect(Seance.donneeFacultativeVide(s, [TAPIS])).toBeNull();                   // la carte de fin ne la demande pas
    const D = Seance.donneeFacultativeVide(Object.assign({}, s, { exercices: [{ exercise_slug: 'rando', series: s.exercices[0].series }] }),
      [{ slug: 'rando', mesure: 'distance_temps', champs_series: ['denivele_m'] }]);
    expect(D && D.nom).toBe('denivele_m');                                         // témoin : le D+, lui, est relancé
  });
});

// ── La colonne absente ne casse ni la lecture ni l'écriture des séries (donnees.js) ──────────────────────────────────────
function fauxSets(avecColonne) {
  const etat = { lectures: [], ecritures: [] };
  const manque = (cols) => (!avecColonne && String(cols).indexOf('pente_pct') >= 0) ? 'pente_pct' : null;
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
          r = !avecColonne && q.up.some((l) => 'pente_pct' in l)
            ? { error: { code: 'PGRST204', message: "Could not find the 'pente_pct' column of 'sets' in the schema cache" } } : { error: null };
        } else {
          etat.lectures.push(q.cols);
          r = manque(q.cols) ? { data: null, error: { code: '42703', message: 'column sets.pente_pct does not exist' } } : { data: [], error: null };
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

describe('colonne `pente_pct` absente en base : l’app fonctionne avant la migration', () => {
  test('DISCRIMINANT — la lecture rejoue sans elle, une fois, puis ne la redemande plus', async () => {
    const f = fauxSets(false);
    const D = donnees(f);
    await expect(D.seriesDepuis(null)).resolves.toEqual([]);
    expect(f.etat.lectures[0]).toContain('pente_pct');
    expect(f.etat.lectures[1]).not.toContain('pente_pct');
    await D.seriesDeSeance('s1');
    expect(f.etat.lectures[2]).not.toContain('pente_pct');
  });
  test('DISCRIMINANT — l’écriture repart sans elle (la file ne boucle pas), la valeur reste dans la séance', async () => {
    const f = fauxSets(false);
    const D = donnees(f);
    const lignes = [{ id: 'a', session_id: 's', pente_pct: 4.5, duree_s: 600 }];
    await D.remplacerSeries('s', lignes, []);
    expect(f.etat.ecritures[0][0]).toHaveProperty('pente_pct');
    expect(f.etat.ecritures[1][0]).not.toHaveProperty('pente_pct');
    expect(lignes[0].pente_pct).toBe(4.5);
  });
  test('colonne présente : lue et écrite telle quelle, une seule requête', async () => {
    const f = fauxSets(true);
    const D = donnees(f);
    await D.seriesDepuis(null);
    await D.remplacerSeries('s', [{ id: 'a', session_id: 's', pente_pct: 4.5 }], []);
    expect(f.etat.lectures).toHaveLength(2);   // le select des séries, puis la lecture des identifiants existants
    expect(f.etat.ecritures).toHaveLength(1);
    expect(f.etat.ecritures[0][0].pente_pct).toBe(4.5);
  });
  test('une AUTRE colonne absente reste une erreur', async () => {
    const f = fauxSets(true);
    f.client.from = ((o) => () => { const c = o(); c.then = (res, rej) => Promise.resolve({ error: { code: '42703', message: 'column sets.autre does not exist' } }).then(res, rej); return c; })(f.client.from);
    const D = donnees(f);
    await expect(D.seriesDepuis(null)).rejects.toMatchObject({ code: '42703' });
  });
});
