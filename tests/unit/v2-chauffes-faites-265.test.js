/** @jest-environment node */
//
// 265 (MOTEUR §9.15.7, 07/11/2026) — une chauffe ajoutée après une chauffe FAITE monte au-dessus de la plus lourde des chauffes
// faites, jusqu'à 90 % de la charge de travail au plus ; plus de cran libre : sans charge, avec « Trop proche… ». Les cas de la
// maquette v4 (squat 100 kg, barre) et ceux du contradicteur à froid (crans larges, plusieurs lignes d'un coup, validation dans le
// désordre, reps, chauffe faite au-dessus de la charge de travail, dévalidation).

require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');

const base = { equipement: 'barre', reference: 100, deja_sollicite: false, sol: false, cran: 2.5, salle: null, coach: true,
  isolation: false, premierExercice: true };
const avec = (n, faites, extra) => M.chauffesDe(Object.assign({}, base, extra || {}, { routine: Array(n).fill(null), faites }));
const charges = (r) => r.lignes.map((l) => l.charge);
const TROP_PROCHE = 'Trop proche de ta charge de travail pour une chauffe de plus.';

describe('§9.15.7 — après une chauffe faite', () => {
  test('sans chauffe faite : la rampe du nombre de lignes, inchangée', () => {
    expect(charges(avec(3, [null, null, null]))).toEqual([40, 60, 80]);
    expect(avec(3, [null, null, null]).trop_proches).toBe(0);
  });

  test('fait 50 × 8, une ligne de plus : la rampe convient (80), gardée', () => {
    const r = avec(2, [{ charge: 50, reps: 8 }, null]);
    expect(r.lignes[1].charge).toBe(80);
  });

  test('fait 50 × 8 et 80 × 3, une de plus : 90 (et non 80, qui ne monte pas)', () => {
    const r = avec(3, [{ charge: 50, reps: 8 }, { charge: 80, reps: 3 }, null]);
    expect(r.lignes[2].charge).toBe(90);
    expect(r.lignes[2].reps).toBeLessThanOrEqual(2);
  });

  test('fait 50 × 8 et 90 × 1, une de plus : sans charge, avec la phrase', () => {
    const r = avec(3, [{ charge: 50, reps: 8 }, { charge: 90, reps: 1 }, null]);
    expect(r.lignes[2].charge).toBeNull();
    expect(r.lignes[2].trop_proche).toBe(true);
    expect(r.trop_proches).toBe(1);
    expect(r.phrase_apres_faites).toBe(TROP_PROCHE);
  });

  test('chauffe faite plus lourde que la charge de travail : trop proche', () => {
    const r = avec(2, [{ charge: 105, reps: 1 }, null]);
    expect(r.lignes[1].charge).toBeNull();
    expect(r.phrase_apres_faites).toBe(TROP_PROCHE);
  });

  test('validation dans le désordre : une ligne restée AVANT une chauffe faite garde la rampe (la montée se lit dans l\u2019ordre, I16)', () => {
    const r = avec(3, [null, null, { charge: 80, reps: 2 }]);
    expect(charges(r)).toEqual([40, 60, 80]);
  });

  test('la borne est la plus lourde des chauffes faites, quelle que soit sa place', () => {
    const r = avec(3, [{ charge: 50, reps: 8 }, { charge: 85, reps: 2 }, null]);
    expect(r.lignes[2].charge).toBe(90);
  });

  test('plusieurs lignes d’un coup : charges strictement croissantes, jamais au-dessus de 90 %, jamais deux fois la même', () => {
    const r = avec(4, [{ charge: 50, reps: 8 }, null, null, null]);
    const c = r.lignes.slice(1).map((l) => l.charge).filter((x) => x !== null);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    c.forEach((x) => { expect(x).toBeGreaterThan(50); expect(x).toBeLessThanOrEqual(90); });
  });

  test('crans larges (machine, cran 10, travail 60) : jamais la charge de travail, jamais deux charges égales', () => {
    const r = M.chauffesDe({ equipement: 'machine', reference: 60, deja_sollicite: false, sol: false, cran: 10, salle: null, coach: true,
      isolation: false, premierExercice: true, routine: [null, null, null], faites: [{ charge: 30, reps: 8 }, null, null] });
    const c = r.lignes.slice(1).map((l) => l.charge);
    c.filter((x) => x !== null).forEach((x) => { expect(x).toBeLessThan(60); expect(x).toBeLessThanOrEqual(54); expect(x).toBeGreaterThan(30); });
    expect(c.filter((x) => x !== null).length).toBeLessThanOrEqual(2);
    expect(c[0] !== c[1] || c[0] === null).toBe(true);
    expect(r.trop_proches + c.filter((x) => x !== null).length).toBe(2);
  });

  test('reps du coach : jamais plus que la dernière faite moins une', () => {
    const r = avec(2, [{ charge: 60, reps: 5 }, null]);
    expect(r.lignes[1].reps).toBeLessThanOrEqual(4);
  });

  test('dévalider une chauffe rend la rampe du nombre de lignes (fonction pure des faites)', () => {
    const avant = charges(avec(3, [{ charge: 50, reps: 8 }, { charge: 80, reps: 3 }, null]));
    expect(avant[2]).toBe(90);
    expect(charges(avec(3, [{ charge: 50, reps: 8 }, null, null]))).toEqual([40, 60, 80]);
    expect(charges(avec(3, [null, null, null]))).toEqual([40, 60, 80]);
  });
});
