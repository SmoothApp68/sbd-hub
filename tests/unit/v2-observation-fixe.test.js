/** @jest-environment node */
//
// v2/js/seance.js — une observation ne change jamais de série (MOTEUR §9.11,
// 49-8 ; diagnostic « + Série » du 26/09/2026).
//
// Les rangs se relisent sur la liste actuelle, alignée par la fin (§9.13) :
// une série ajoutée ou supprimée les fait glisser. Ces tests rejouent les
// glissements du diagnostic sur les fonctions pures ; le câblage (`app.js`)
// se vérifie dans le banc de l'écran de séance, section 7 septvicies.

require('../../v2/js/modele.js'); // la lecture des nombres (`lireNombre`), chargée avant, comme dans index.html
const Seance = require('../../v2/js/seance.js');

const valid = (id, kg, reps) => ({ id, charge_kg: kg, reps, type_serie: 'travail',
  validee_a: '2026-09-26T10:00:00Z', source: 'app' });
const vide = (id) => ({ id, charge_kg: null, reps: null, type_serie: 'travail',
  validee_a: null, source: null });
const pari = (rang, rev, set) => ({ id: 'p' + rang + '-' + rev, set_observe: set || null,
  valeur_observee: set ? 4 : null, fondement: { rang, revision: rev, charge: 130 } });

describe('§9.11 (49-8) — observationTenue', () => {
  test('tenue : la série existe et est en base', () => {
    expect(Seance.observationTenue('s3', [valid('s1'), valid('s3')])).toBe(true);
  });
  test('non tenue : la série a disparu, ou n’est plus validée, ou rien n’est relié', () => {
    expect(Seance.observationTenue('s3', [valid('s1')])).toBe(false);
    expect(Seance.observationTenue('s3', [vide('s3')])).toBe(false);
    expect(Seance.observationTenue(null, [valid('s1')])).toBe(false);
  });
});

describe('§9.11 (49-8) — peutObserver', () => {
  const series = [valid('s1'), valid('s2'), valid('s3', 130, 4), vide('s4')];
  test('DISCRIMINANT — le test tenu sur s3 ne passe pas à s4 (scénario A)', () => {
    expect(Seance.peutObserver(pari(3, 0, 's3'), series[3], series)).toBe(false);
  });
  test('DISCRIMINANT — même à la même charge : une autre série reste une autre série (B2)', () => {
    const s4 = valid('s4', 130, 2);
    expect(Seance.peutObserver(pari(3, 0, 's3'), s4, series.slice(0, 3).concat([s4]))).toBe(false);
  });
  test('la même série se relit toujours (correction, dévalidation — 48c-2)', () => {
    expect(Seance.peutObserver(pari(3, 0, 's3'), series[2], series)).toBe(true);
    expect(Seance.peutObserver(pari(3, 0, 's3'), vide('s3'), [vide('s3')])).toBe(true);
  });
  test('une ligne sans observation, ou dont la série n’est plus en base, peut être observée', () => {
    expect(Seance.peutObserver(pari(3, 0, null), series[3], series)).toBe(true);
    expect(Seance.peutObserver(pari(3, 0, 'sX'), series[3], series)).toBe(true);
  });
});

describe('§9.11 (49-8) — parisAObserver', () => {
  const ids = (l) => l.map((x) => x.id).sort();

  test('A — s4 ajoutée prend le rang 3 : aucun pari à lire', () => {
    const series = [valid('s1'), valid('s2'), valid('s3', 130, 4), valid('s4', 110, 8)];
    const paris = [pari(1, 0, 's1'), pari(2, 0, 's2'), pari(3, 0, 's3')];
    expect(Seance.parisAObserver(paris, series[3], 3, series)).toEqual([]);
  });

  test('C — s3 validée après « + Série » prend le rang 2, tenu par s2 : rien', () => {
    const series = [valid('s1'), valid('s2'), valid('s3', 130, 4), vide('s4')];
    const paris = [pari(1, 0, 's1'), pari(2, 0, 's2'), pari(3, 0, null)];
    expect(Seance.parisAObserver(paris, series[2], 2, series)).toEqual([]);
  });

  test('E2 — les deux paris du rang 2 restent sur la série proposée', () => {
    const series = [valid('s1'), valid('s2', 130, 3), valid('s3', 130, 5), vide('s4')];
    const paris = [pari(1, 0, 's1'), pari(2, 0, 's2'), pari(2, 1, 's2'), pari(3, 0, null)];
    expect(Seance.parisAObserver(paris, series[2], 2, series)).toEqual([]);
  });

  test('DISCRIMINANT — suppression puis frappe sur s1 : s1 sert déjà le rang 1, pas le rang 2', () => {
    // s2 supprimée : son observation a été vidée ; s1 porte maintenant le
    // rang 2 par l'alignement de fin.
    const series = [valid('s1'), valid('s3', 130, 4)];
    const paris = [pari(1, 0, 's1'), pari(2, 0, null), pari(3, 0, 's3')];
    expect(ids(Seance.parisAObserver(paris, series[0], 2, series))).toEqual(['p1-0']);
  });

  test('une série qui n’est plus couverte relit quand même SES paris', () => {
    const series = [valid('s1'), valid('s2'), valid('s3'), vide('s4')];
    const paris = [pari(1, 0, 's1'), pari(2, 0, 's2'), pari(3, 0, 's3')];
    expect(ids(Seance.parisAObserver(paris, series[0], null, series))).toEqual(['p1-0']);
  });

  test('le cas ordinaire : tous les paris du rang, le pari de révision compris', () => {
    const series = [valid('s1'), valid('s2', 130, 3), vide('s3')];
    const paris = [pari(1, 0, 's1'), pari(2, 0, null), pari(2, 1, null), pari(3, 0, null)];
    expect(ids(Seance.parisAObserver(paris, series[1], 2, series))).toEqual(['p2-0', 'p2-1']);
  });

  test('la même série corrigée : ses paris, et le pari du rang qui n’a pas encore de série', () => {
    const series = [valid('s1'), valid('s2', 130, 3), vide('s3')];
    const paris = [pari(1, 0, 's1'), pari(2, 0, 's2'), pari(2, 1, null)];
    expect(ids(Seance.parisAObserver(paris, series[1], 2, series))).toEqual(['p2-0', 'p2-1']);
  });
});
