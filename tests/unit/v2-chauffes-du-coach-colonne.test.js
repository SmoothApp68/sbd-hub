/** @jest-environment node */
//
// 20/11/2026 (CONTRA-725 D4) — LE FILET DE LA COLONNE FACULTATIVE `routine_exercises.chauffes_du_coach` (donnees.js). Tant que la
// migration (Claude.ai) n'est pas passée, une base qui répond 42703 (lecture) ou PGRST204 (écriture) ne fait perdre AUCUNE écriture :
// la lecture des routines, l'insertion et la mise à jour d'un exercice repartent sans la colonne, une fois, puis ne la redemandent plus.
// C'est le seul chemin où une écriture rejetée perdrait une routine : il est joué ici contre un faux client PostgREST.
global.self = global;

function fauxClient(avecColonne) {
  const etat = { appels: [] };
  const client = { from(table) {
    const q = { table, op: null, cols: null, payload: null };
    const c = {
      select(cols) { if (!q.op) q.op = 'select'; q.cols = cols; return c; },
      insert(p) { q.op = 'insert'; q.payload = p; return c; },
      update(p) { q.op = 'update'; q.payload = p; return c; },
      eq() { return c; }, order() { return c; }, in() { return c; }, single() { return c; },
      then(res, rej) {
        etat.appels.push(JSON.parse(JSON.stringify(q)));
        const txt = JSON.stringify(q.payload || '') + (q.cols || '');
        let r;
        if (!avecColonne && txt.indexOf('chauffes_du_coach') >= 0) {
          r = q.op === 'select'
            ? { data: null, error: { code: '42703', message: 'column routine_exercises_1.chauffes_du_coach does not exist' } }
            : { data: null, error: { code: 'PGRST204', message: "Could not find the 'chauffes_du_coach' column of 'routine_exercises' in the schema cache" } };
        } else r = { data: [{ id: 'x' }], error: null };
        return Promise.resolve(r).then(res, rej);
      }
    };
    return c;
  } };
  return { etat, client };
}
function donnees(f) {
  global.THClient = { obtenir: () => f.client };
  let D;
  jest.isolateModules(() => { D = require('../../v2/js/donnees.js'); });
  return D;
}
const aLaColonne = (a) => JSON.stringify(a.payload || '').indexOf('chauffes_du_coach') >= 0 || String(a.cols || '').indexOf('chauffes_du_coach') >= 0;

describe('colonne `chauffes_du_coach` absente : aucune écriture perdue', () => {
  test('DISCRIMINANT — l’insertion (PGRST204) repart sans la colonne et ÉCRIT l’exercice', async () => {
    const f = fauxClient(false);
    const D = donnees(f);
    const lignes = [{ routine_id: 'r', exercise_slug: 'squat_barre', rang: 0, chauffes_du_coach: true }];
    await expect(D.insererExercices(lignes)).resolves.toEqual([{ id: 'x' }]);
    const ins = f.etat.appels.filter((a) => a.op === 'insert');
    expect(ins).toHaveLength(2);
    expect(aLaColonne(ins[0])).toBe(true);
    expect(aLaColonne(ins[1])).toBe(false);
    expect(ins[1].payload[0]).toEqual({ routine_id: 'r', exercise_slug: 'squat_barre', rang: 0 });
    expect(lignes[0].chauffes_du_coach).toBe(true);   // la ligne de l'app n'est pas touchée
  });
  test('DISCRIMINANT — la mise à jour repart sans elle (les autres champs écrits) ; sans autre champ, aucun appel', async () => {
    const f = fauxClient(false);
    const D = donnees(f);
    await D.majExercice('e1', { chauffes_du_coach: true, note: 'a' });
    const maj = f.etat.appels.filter((a) => a.op === 'update');
    expect(maj).toHaveLength(2);
    expect(maj[1].payload).toEqual({ note: 'a' });
    // La colonne est sortie pour la session : plus aucune requête ne la porte, et une mise à jour qui n'a qu'elle ne part pas.
    const avant = f.etat.appels.length;
    await D.majExercice('e1', { chauffes_du_coach: false });
    expect(f.etat.appels.length).toBe(avant);
  });
  test('DISCRIMINANT — la lecture des routines (42703) rejoue sans elle, une fois, puis ne la redemande plus', async () => {
    const f = fauxClient(false);
    const D = donnees(f);
    await expect(D.mesRoutines()).resolves.toEqual([{ id: 'x' }]);
    const sel = f.etat.appels.filter((a) => a.op === 'select' && a.table === 'routines');
    expect(sel).toHaveLength(2);
    expect(aLaColonne(sel[0])).toBe(true);
    expect(aLaColonne(sel[1])).toBe(false);
    await D.mesRoutines();
    expect(f.etat.appels.filter((a) => a.op === 'select' && a.table === 'routines')).toHaveLength(3);
    expect(aLaColonne(f.etat.appels[f.etat.appels.length - 1])).toBe(false);
  });
  test('colonne présente : lue et écrite telle quelle, une requête chacune', async () => {
    const f = fauxClient(true);
    const D = donnees(f);
    await D.mesRoutines();
    await D.insererExercices([{ routine_id: 'r', exercise_slug: 'squat_barre', rang: 0, chauffes_du_coach: true }]);
    await D.majExercice('e1', { chauffes_du_coach: false });
    expect(f.etat.appels).toHaveLength(3);
    expect(f.etat.appels.every(aLaColonne)).toBe(true);
  });
  test('une AUTRE colonne absente reste une erreur (rien n’est avalé)', async () => {
    const f = fauxClient(true);
    f.client.from = ((o) => (t) => { const c = o(t); c.then = (res, rej) => Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'autre' column" } }).then(res, rej); return c; })(f.client.from);
    const D = donnees(f);
    await expect(D.insererExercices([{ routine_id: 'r', exercise_slug: 'sq', rang: 0 }])).rejects.toMatchObject({ code: 'PGRST204' });
  });
});
