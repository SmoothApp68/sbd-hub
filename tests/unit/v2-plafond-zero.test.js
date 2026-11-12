/** @jest-environment node */
//
// PR 4b (R-A, MOTEUR §9.42 bis) — LE PLAFOND APRÈS UN ZÉRO REP. Ce fichier grandit commit par commit (un commit = une règle, ses tests dedans).
// Commit 1 : UNE SEULE DESCENTE `D` (T-A13) — la règle B, le calage et (commit 5) la réaction en séance ne décident qu'avec `descenteApresUnZero`.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');

const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const ch = (charge, reps) => ({ charge, reps: reps === undefined ? 5 : reps, ressenti: null, chauffe: true });
const cal = (o) => M.calagePremiereFois(Object.assign({ equipement: 'barre', reps: 8, debutant: false, habituelle: null, prochain: 'travail', series: [] }, o));
// la grille du test : un pas fixe
const tr = (charge, reps, ressenti) => ({ charge, reps, ressenti: ressenti || null, chauffe: false });
const grille = (pas) => (c, sens) => Math.round((c + sens * pas) * 100) / 100;

describe('T-A13 — UNE descente D (descenteApresUnZero)', () => {
  test('D = le cran sous Ch le plus proche de 95 % de Ch : pas 2,5 : 100 → 95, 102,5 → 97,5, 27,5 → 25', () => {
    expect(M.descenteApresUnZero(100, grille(2.5), 20)).toBe(95);
    expect(M.descenteApresUnZero(102.5, grille(2.5), 20)).toBe(97.5);
    expect(M.descenteApresUnZero(27.5, grille(2.5), 20)).toBe(25);
  });
  test('machine pas 5 : D(60) = 55 ; D(25) = 20', () => {
    expect(M.descenteApresUnZero(60, grille(5), 5)).toBe(55);
    expect(M.descenteApresUnZero(25, grille(5), 5)).toBe(20);
  });
  test('jamais sous le plancher : null (rien de plus léger)', () => {
    expect(M.descenteApresUnZero(20, grille(2.5), 20)).toBeNull();
    expect(M.descenteApresUnZero(22.5, grille(2.5), 22.5)).toBeNull();
    expect(M.descenteApresUnZero(25, grille(5), 25)).toBeNull();
  });
  test('la grille peut se taire : null', () => {
    expect(M.descenteApresUnZero(30, () => null, null)).toBeNull();
  });
  test('le calage appelle D : borne 100 → 95, borne 102,5 → 97,5 (et non le cran juste sous)', () => {
    expect(cal({ series: [tr(97.5, 8, 'reste_3_plus')], borne: 100 }).suivante).toMatchObject({ charge: 95, bornee: true, borne: 100 });
    expect(cal({ series: [tr(100, 8, 'reste_3_plus')], borne: 102.5 }).suivante).toMatchObject({ charge: 97.5, bornee: true });
  });
  test('en dessous de 30 × pas, D = le cran juste sous : les cas de la PR 3 ne bougent pas', () => {
    [[27.5, 25], [25, 22.5], [22.5, 20]].forEach(([b, c]) => {
      expect(cal({ series: [ch(20), ch(25)], borne: b }).suivante).toMatchObject({ charge: c, bornee: true });
    });
    expect(cal({ series: [ch(20), ch(25)], borne: 20 }).suivante).toBeNull();
    expect(sp(M.libellesCalage(cal({ series: [ch(20), ch(25)], borne: 27.5 })).pourquoi)).toBe('27,5 kg est resté à 0 rep : je propose 25 kg.');
  });
});
